# StoreOS

> The operating system for your store — products, inventory, orders, customers and AI-assisted support in one workspace, with human approval whenever money is involved.

StoreOS serves two kinds of businesses:

- **Social & direct sellers** (Instagram, WhatsApp, own website, in person). StoreOS is the system of record: every product, stock movement, order and customer lives here.
- **Shopify merchants.** StoreOS layers on top of Shopify for support triage, approvals, listings and customer insight. The data model is sync-ready (`source` + `external_id` on every syncable table); the Shopify connector itself is on the roadmap.

Currency is a per-workspace setting (NGN by default; USD, GBP, EUR, GHS, KES, ZAR, CAD, INR supported in the UI).

## Modules

| Route | Module | What it does |
|---|---|---|
| `/` | Landing page | Value prop, features, AI guardrails, pricing placeholder, FAQ, sign-up CTA |
| `/login`, `/signup` | Auth | Email + password and magic link (Supabase Auth via `@supabase/ssr`) |
| `/onboarding` | Onboarding | Creates a workspace (name, how you sell, currency) and optionally loads demo data |
| `/app` | Overview | 30-day revenue/orders/AOV with deltas, sales chart, recent orders, low-stock alerts, pending approvals |
| `/app/products` | Products & inventory | CRUD, image upload to Supabase Storage, stock ledger, adjust/restock, low-stock threshold, filters |
| `/app/orders` | Orders | Manual order builder (catalogue + custom lines, discount, delivery fee), stock decrement, status workflow, refunds with optional restock, timeline |
| `/app/customers` | Customers | List with spend/orders, profile with order history, conversations and notes |
| `/app/inbox` | Support inbox | Conversations and messages; log customer messages from any channel; AI triage; replies, notes |
| `/app/approvals` | Approvals | Approve (optionally edit the reply) or reject high-risk AI decisions with a required rationale — all logged |
| `/app/studio` | Product Studio | Photo → AI listing draft (title, description, category, tags, suggested price) → save as product |
| `/app/analytics` | Analytics | Revenue over time (7/30/90d), top products, orders by status |
| `/app/settings` | Settings | Workspace name/currency/time zone, AI & refund policy thresholds, team (owner/admin/staff) and invites, AI provider status, demo data |

## How the AI support pipeline works

1. A customer message is logged in a conversation (pasted from WhatsApp/Instagram/email today; channel connectors later).
2. **Classify** — intent, urgency, sentiment, confidence and entities (order number, amount). The message is wrapped in a tagged boundary and the model is told to treat it as data only (prompt-injection boundary).
3. **Context** — the customer's profile and sentiment, recent orders with items, the referenced order, and the active catalogue are pulled from the workspace (via RLS).
4. **Draft** — the model recommends an action (`reply`, `info_provided`, `refund`, `replace`, `escalate`) and writes the reply, following the store's reply guidelines.
5. **Enforce policy (server-side)** — `src/lib/ai/policy.ts` re-checks the recommendation against the workspace's policy: auto-refund limit, high-risk threshold, negative sentiment, urgency, complaints, low confidence, refund larger than the order, malformed output (fails closed). The model cannot override this.
6. **Route** — low-risk drafts are posted automatically (if auto-send is on); everything else becomes a pending approval. Owners/admins approve or reject with a rationale (`decide_approval` RPC). Approved refunds are recorded on the linked order.
7. Every step is written to `ai_decisions` and `audit_events`.

Without an `AI_API_KEY` StoreOS runs a deterministic demo AI (`src/lib/ai/demo.ts`) so the whole flow works offline.

AI routes are rate limited per user (in-memory; swap for Upstash/Vercel KV in production).

## Tech stack

- Next.js 14 (App Router, Server Components, Server Actions), TypeScript, Tailwind CSS, Framer Motion, lucide-react
- Supabase: Postgres, Auth, Storage, Row Level Security (`@supabase/ssr`, `@supabase/supabase-js`)
- AI: any OpenAI-compatible API through the `openai` SDK — Google Gemini by default, Qwen (DashScope) as a drop-in alternative
- zod for input validation

## Getting started

```bash
git clone https://github.com/chike2510/storeos
cd storeos
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | e.g. `https://tjqldcvlcbxhbvovhmmp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | no (reserved) | Server-only. Not used by v1 flows; reserved for webhooks / Shopify sync |
| `NEXT_PUBLIC_SITE_URL` | yes in prod | Used for magic-link and confirmation redirects |
| `AI_BASE_URL` | no | Default `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `AI_API_KEY` | no | Empty = demo AI |
| `AI_MODEL` | no | Default `gemini-2.5-flash` |
| `AI_VISION_MODEL` | no | Defaults to `AI_MODEL` |

Qwen alternative:

```bash
AI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
AI_API_KEY=sk-...
AI_MODEL=qwen-max
AI_VISION_MODEL=qwen-vl-max
```

### Database

Apply the migrations in `supabase/migrations/` in order (Supabase CLI `supabase db push`, or paste each file into the SQL editor):

| File | Contents |
|---|---|
| `20261012000001_core.sql` | profiles (+ auth trigger), workspaces, workspace_members, workspace_invitations, policies, membership helpers, `create_workspace`, `accept_pending_invitations`, `workspace_member_directory` |
| `20261012000002_commerce.sql` | products, product_variants, inventory_movements (stock ledger + trigger), customers, orders (per-workspace numbering), order_items, `adjust_stock`, `create_order`, `set_order_status`, `customer_stats` view |
| `20261012000003_support_ai.sql` | conversations, messages, ai_decisions, approvals, audit_events, `decide_approval` |
| `20261012000004_rls.sql` | RLS on every table, scoped to workspace membership; admin-only deletes/settings; append-only ledgers |
| `20261012000005_storage.sql` | `product-images` bucket (public read, 5 MB, images only) with member-only writes under `<workspace_id>/` |
| `20261012000006_demo_seed.sql` | `seed_demo_workspace(ws)` / `clear_demo_workspace(ws)` |

Supabase Auth settings to check: add `<site>/auth/callback` and `<site>/auth/confirm` to the redirect allow-list, and set the Site URL.

### Demo data

Tick **Load sample data** during onboarding, or use **Settings → Demo data**. From SQL: `select public.seed_demo_workspace('<workspace-id>');`

## Security model

- Every tenant row has `workspace_id`; RLS allows access only to members (`is_workspace_member`) and restricts destructive or configuration changes to owners/admins (`has_workspace_role`).
- Stock is changed only through the `inventory_movements` ledger; orders are created atomically by `create_order`, which refuses to oversell.
- Approvals can only be decided by owners/admins, require a rationale, and are audited. `audit_events` and `inventory_movements` have no update/delete policies.
- The app never uses the service-role key for user flows.

## Scripts

```bash
npm run dev        # local development
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run build      # production build
```

## Roadmap

1. Shopify OAuth + product/order/customer sync (upserts into the existing tables via `source`/`external_id`)
2. Channel connectors: WhatsApp Business, Instagram DMs, email — inbound webhooks and real outbound sending
3. Payment provider integration (Paystack/Flutterwave/Stripe) so approved refunds move money
4. Variant management UI, bulk import/export
5. Billing, plan limits and usage metering
6. Durable rate limiting and AI evaluation suite

## Origin

StoreOS began as a Qwen Cloud Global AI Hackathon project (Track 4: Autopilot Agent) and is now developed as a standalone SaaS product.

## License

MIT © 2026 chike2510
