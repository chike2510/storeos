# StoreOS

> The AI that runs your store while you sleep.

**Global AI Hackathon with Qwen Cloud - Track 4: Autopilot Agent**

---

## What it does

StoreOS is an autonomous e-commerce operations agent. It handles the full customer service and product listing workflow end-to-end - from messy, unstructured inputs to resolved outcomes - with human-in-the-loop checkpoints at every high-stakes decision.

### Core Pipeline

**Customer Inbox Autopilot**
1. Customer sends any message (email, WhatsApp text, DM - deliberately messy and unstructured)
2. `qwen-max` classifies intent, extracts urgency and entities from ambiguous input
3. `text-embedding-v4` performs semantic search over order history and customer context
4. `qwen3-235b-thinking` reasons through the resolution - refund decisions, dispute handling, policy enforcement
5. Low-risk decisions are auto-resolved with a polished response
6. High-risk decisions (large refunds, repeat complaints, high urgency) are routed to the human approval queue with full reasoning attached
7. Human approves or rejects - agent sends final response polished by `qwen-max`

**Product Listing Generator**
- Merchant uploads any product photo
- `qwen-omni-turbo` (vision model) analyzes the image and generates a complete listing: title, description, category, price range, tags, and key highlights
- Ready to publish in seconds

---

## Qwen Cloud Models Used

| Model | Role |
|-------|------|
| `qwen-max` | Customer message drafting, intent classification, response polishing |
| `qwen3-235b-thinking` | Dispute reasoning, refund decisions, risk assessment |
| `qwen-omni-turbo` | Product photo → listing generation (vision) |
| `text-embedding-v4` | Semantic search over order history and customer profiles |

---

## Tech Stack

- **Frontend:** Next.js 14, React, Tailwind CSS, Framer Motion
- **Backend:** Next.js API Routes (serverless)
- **AI:** Qwen Cloud via DashScope API (`dashscope-intl.aliyuncs.com`)
- **Storage:** Alibaba Cloud OSS (product images)
- **Deployment:** Alibaba Cloud / Vercel

---

## Architecture

See `ARCHITECTURE.mermaid` for the full system diagram.

See `alibaba-cloud-proof.ts` for Alibaba Cloud service integration details.

---

## Running Locally

```bash
# Clone
git clone https://github.com/chike2510/storeos
cd storeos

# Install
npm install

# Environment
cp .env.local.example .env.local
# Add your QWEN_API_KEY from https://home.qwencloud.com

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Hackathon Track

**Track 4: Autopilot Agent**

StoreOS demonstrates all three core requirements:
- ✅ **Ambiguous inputs** : handles messy real-world customer messages, not structured forms
- ✅ **External tool invocation** : Qwen Cloud APIs, embedding search, OSS file storage
- ✅ **Human-in-the-loop checkpoints** : all high-risk decisions require human approval before action

---

## License

MIT © 2026 chike2510
