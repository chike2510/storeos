# StoreOS

> AI customer support automation for small ecommerce teams—with human approval when it matters.

StoreOS is a SaaS foundation for Shopify-first merchants who want to automate repetitive support work without giving up control over refunds, complaints, and high-risk decisions.

## Product workflow

1. A customer sends a messy message.
2. StoreOS classifies the intent, urgency, and entities.
3. It finds relevant customer and order context.
4. It recommends a resolution and applies risk policy.
5. Low-risk requests are resolved automatically.
6. High-risk requests enter a human approval queue with an explainable rationale.
7. The final response is recorded in the activity trail.

The product also includes a product studio that turns an uploaded product image into an editable listing draft.

## Current SaaS foundation

- **Demo mode by default:** the full workflow works without API credentials using deterministic local rules and fixtures.
- **Live Qwen mode:** set `STOREOS_MODE=live` and `QWEN_API_KEY` to use Qwen Cloud.
- **Health endpoint:** `GET /api/health` reports service health, runtime mode, and configured model names.
- **Safety boundaries:** request limits, prompt-injection boundaries, output normalization, and server-side refund policy enforcement.
- **Human checkpoint:** approvals and rejections are kept behind an explicit review step.

> Demo mode is intentionally obvious in the dashboard. It is useful for portfolio reviewers and local development; it is not a substitute for persistent production storage or live commerce integrations.

## Tech stack

- **Frontend:** Next.js 14, React, Tailwind CSS, Framer Motion
- **Backend:** Next.js App Router API routes
- **AI:** Qwen Cloud through its OpenAI-compatible API
- **Demo data:** typed local fixtures and deterministic fallback responses
- **Deployment target:** Vercel or Alibaba Cloud

## Run locally

```bash
git clone https://github.com/chike2510/storeos
cd storeos
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Live AI mode

```bash
STOREOS_MODE=live
QWEN_API_KEY=your_key_here
QWEN_THINKING_MODEL=qwen3-235b-thinking
```

Keep secrets in `.env.local`; never commit them.

## Useful commands

```bash
npm run dev       # local development
npm run lint      # Next.js lint checks
npm run typecheck # TypeScript validation
npm run build     # production build
```

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Runtime health and demo/live status |
| `POST /api/classify` | Classify a customer message |
| `POST /api/embed` | Retrieve relevant customer/order context |
| `POST /api/think` | Recommend a resolution and risk level |
| `POST /api/checkpoint` | Create or action a human approval checkpoint |
| `POST /api/vision` | Generate a product listing draft from an image |

## Roadmap to production SaaS

1. Persistent Postgres/Supabase data model and durable audit events
2. Merchant authentication, workspaces, roles, and tenant isolation
3. Shopify OAuth and order/customer synchronization
4. Configurable merchant policies for refunds, returns, and escalation
5. Stripe subscriptions, usage metering, and plan limits
6. Inbox ingestion for email and additional commerce channels
7. Evaluation suite for AI resolution quality and regression testing

## Origin

StoreOS began as a Global AI Hackathon project for Qwen Cloud’s Track 4: Autopilot Agent. It is now being developed as a standalone SaaS product.

## License

MIT © 2026 chike2510
