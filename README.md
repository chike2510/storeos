# StoreOS

> The operating system for your store — products, inventory, orders, customers and AI-assisted support in one workspace, with human approval whenever money is involved.

StoreOS serves two kinds of businesses:

- **Social & direct sellers** (Instagram, WhatsApp, own website, in person). StoreOS is the system of record: every product, stock movement, order and customer lives here.
- **Shopify merchants.** StoreOS layers on top of Shopify for support triage, approvals, listings and customer insight. Connect a store in **Settings → Integrations**: products (with variants and stock), customers and orders sync into the same tables (`source = 'shopify'`, `external_id` = Shopify GID), webhooks keep them current, and stock adjustments and approved refunds are written back to Shopify.

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
| `SUPABASE_SERVICE_ROLE_KEY` | for Shopify | Server-only. Used only by the Shopify connector (credential storage, sync, webhooks, cron) |
| `STOREOS_ENCRYPTION_KEY` | for Shopify | 32-byte key (`openssl rand -base64 32`) for AES-256-GCM encryption of Shopify client secrets and tokens. Changing it makes saved connections unreadable (reconnect) |
| `CRON_SECRET` | for the cron | Vercel sends it as `Authorization: Bearer …` to `/api/cron/shopify-sync`; the route refuses requests without it |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | no | App-level credentials for OAuth installs started without entering them in Settings |
| `SHOPIFY_REDIRECT_URI` | no | Defaults to `NEXT_PUBLIC_SITE_URL/api/shopify/callback`; must match the Dev Dashboard redirect URL |
| `NEXT_PUBLIC_SITE_URL` | yes in prod | Used for magic-link and confirmation redirects, and as the Shopify webhook base URL (`/api/shopify/webhooks`) |
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
| `20261012000007_shopify.sql` | `shopify_connections` (encrypted credentials, owner/admin RLS, ciphertext columns not selectable by users), `shopify_sync_runs`, `shopify_webhook_events` (idempotency), service-role-only `shopify_upsert_*` functions, `orders.external_name/financial_status/fulfillment_status`, `product_variants.external_inventory_item_id` |

Supabase Auth settings to check: add `<site>/auth/callback` and `<site>/auth/confirm` to the redirect allow-list, and set the Site URL.

### Demo data

Tick **Load sample data** during onboarding, or use **Settings → Demo data**. From SQL: `select public.seed_demo_workspace('<workspace-id>');`

## Shopify integration

Admin GraphQL API `2026-10`. Scopes: `read/write_products`, `read/write_orders`, `read/write_customers`, `read/write_inventory`, `read/write_fulfillments`, `read_locations`.

- **Connect** (Settings → Integrations → Shopify): shop domain (`xxx.myshopify.com`, or paste any admin URL), client ID and secret from the Dev Dashboard app.
  - *Client credentials* — for stores in the same Shopify organization as the app. StoreOS exchanges the ID/secret at `POST https://{shop}/admin/oauth/access_token` (`grant_type=client_credentials`) and re-requests the ~24 h token automatically before it expires.
  - *Install via OAuth* — for merchant-owned stores: `/api/shopify/install?shop=…` (signed, 10-minute state cookie) → Shopify → `/api/shopify/callback` (state + HMAC + timestamp verified) → expiring offline token + refresh token, refreshed automatically.
- **Secrets**: client secret, access token and refresh token are encrypted in Node with AES-256-GCM (`STOREOS_ENCRYPTION_KEY`, AAD bound to workspace + column) and only ever read with the service role. Users can't select those columns at all.
- **Sync** (on connect, **Sync now**, and the daily cron): products + all variants + stock, customers, orders + line items + financial/fulfilment status. Paginated, cost-aware (pauses when the GraphQL bucket runs low; retries on `THROTTLED`/429/5xx), time-boxed with a saved cursor so large stores finish over several runs, incremental by `updated_at` after the first pass. Upserts are idempotent and keyed by Shopify GID; stock differences go through the `inventory_movements` ledger as `sync` movements; re-syncing an order never consumes a StoreOS order number.
- **Webhooks** (registered on connect to `NEXT_PUBLIC_SITE_URL/api/shopify/webhooks`): `orders/create|updated|cancelled`, `products/create|update|delete`, `customers/create|update`, `inventory_levels/update`, `app/uninstalled`. Each delivery is verified (`X-Shopify-Hmac-Sha256`, client secret), deduped by `X-Shopify-Webhook-Id`, then the resource is re-read via GraphQL and upserted. Deleted products are archived. Uninstall clears the tokens.
- **Write-back**: stock adjustments on Shopify products call `inventoryAdjustQuantities` (first active location, compare-and-swap, idempotency key) and then record Shopify's resulting quantity. Approved refunds on Shopify orders call `refundCreate` against the captured payment *before* the approval is recorded (idempotency key = approval id); a failure leaves the approval pending. AI refunds within the auto-refund limit follow the same policy as native orders: StoreOS calls `refundCreate` first (idempotency key = the customer message id) and only then posts the reply; if Shopify refuses, the decision is routed to Approvals instead. Fulfilment/cancellation of Shopify orders happens in Shopify.
- **Product editing (two-way)**: for Shopify products, Shopify owns title, description, product type (StoreOS *category*), price, compare-at price, status and tags. Saving the product form diffs those fields against what the user was editing and pushes only the changed ones — `productUpdate`, then `productVariantsBulkUpdate` for price/compare-at (applied to every variant, and refused when variants already have different prices) — then saves Shopify's response through `shopify_upsert_products`. If Shopify rejects the change nothing typed is saved and the error is shown (if a first mutation landed before a second failed, StoreOS re-reads and mirrors what Shopify actually has). Cost and the low-stock alert stay StoreOS-only; SKU, inventory tracking and the image are shown as managed in Shopify. Only owners/admins can change Shopify-owned fields. Descriptions round-trip via `descriptionHtml` (paragraphs and line breaks preserved).
- **Publish to Shopify**: StoreOS-native products (product page, or the checkbox on Add product / Product Studio) are created with `productSet` (status DRAFT unless *active* is chosen; price, compare-at, SKU, tracking, opening stock at the first active location, image). The handle is derived from the StoreOS id, so a retry upserts instead of duplicating. `shopify_link_published_product` then turns the same row into the Shopify product (source `shopify`, external ids on product and variant) without double-counting stock, and folds in a duplicate if the `products/create` webhook won the race. Owners/admins only.
- **Echo / ordering guard**: `products.external_updated_at` records Shopify's `updatedAt` as last mirrored. A `products/create|update` webhook whose `updated_at` is not newer (our own write echoing back) is skipped, and the upsert never lets an older Shopify read overwrite a newer one.
- **Currency**: catalogue prices (products list, product page, Add product, Studio) are shown in the connected shop's currency (`shopify_connections.shop_currency`, refreshed on every sync), falling back to the workspace currency. Orders keep their own currency.
- **Cron**: `vercel.json` runs `/api/cron/shopify-sync` daily at 03:00 UTC (Hobby-plan compatible) as a backstop; it includes a full product pass because inventory changes don't bump a product's `updated_at`.

## Security model

- Every tenant row has `workspace_id`; RLS allows access only to members (`is_workspace_member`) and restricts destructive or configuration changes to owners/admins (`has_workspace_role`).
- Stock is changed only through the `inventory_movements` ledger; orders are created atomically by `create_order`, which refuses to oversell.
- Approvals can only be decided by owners/admins, require a rationale, and are audited. `audit_events` and `inventory_movements` have no update/delete policies.
- The service-role key is used only by the Shopify connector (credential storage, sync, webhooks, cron), always after a server-side role check or a verified Shopify signature.

## Scripts

```bash
npm run dev        # local development
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run build      # production build
npm test           # unit tests (HMAC verification, encryption, Shopify mapping + product writes)
```

## Roadmap

1. Channel connectors: WhatsApp Business, Instagram DMs, email — inbound webhooks and real outbound sending
2. Payment provider integration (Paystack/Flutterwave/Stripe) so approved refunds move money
3. Variant management UI, bulk import/export
4. Billing, plan limits and usage metering
5. Durable rate limiting and AI evaluation suite

## Origin

StoreOS began as a Qwen Cloud Global AI Hackathon project (Track 4: Autopilot Agent) and is now developed as a standalone SaaS product.

## License

MIT © 2026 chike2510
