import { NextRequest, NextResponse } from 'next/server'
import { qwen, MODELS } from '@/lib/qwen/client'
import { HumanCheckpoint } from '@/types'
import { rateLimit, getClientId } from '@/lib/rate-limit'

// NOTE ON PERSISTENCE: this array lives in a single serverless function's
// module scope. On Vercel, that scope is NOT guaranteed to survive between
// invocations (cold starts reset it, and concurrent requests may land on
// different instances). This is fine for the hackathon demo — the dashboard
// keeps its own client-side state and never reads from GET — but this is
// NOT a durable audit trail. Swap for Vercel KV / a real DB before treating
// this as a compliance-grade log.
const auditLog: HumanCheckpoint[] = []

function isValidCheckpoint(cp: any): cp is HumanCheckpoint {
  if (!cp || typeof cp !== 'object') return false
  if (typeof cp.id !== 'string' || typeof cp.eventId !== 'string') return false
  if (!cp.resolution || typeof cp.resolution !== 'object') return false
  if (!cp.context || typeof cp.context !== 'object') return false
  if (!cp.intent || typeof cp.intent !== 'object') return false
  if (typeof cp.resolution.refundAmount === 'number') {
    if (cp.resolution.refundAmount < 0 || cp.resolution.refundAmount > 10000) return false
  }
  return true
}

export async function GET() {
  return NextResponse.json({ checkpoints: auditLog })
}

export async function POST(req: NextRequest) {
  const clientId = getClientId(req)
  const { allowed } = rateLimit(`checkpoint:${clientId}`, 30)
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 })
  }

  const { checkpoint }: { checkpoint: HumanCheckpoint } = await req.json()

  if (!isValidCheckpoint(checkpoint)) {
    return NextResponse.json({ error: 'Invalid checkpoint payload' }, { status: 400 })
  }

  auditLog.push(checkpoint)

  return NextResponse.json({ success: true, id: checkpoint.id })
}

export async function PATCH(req: NextRequest) {
  const clientId = getClientId(req)
  const { allowed } = rateLimit(`checkpoint-patch:${clientId}`, 30)
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 })
  }

  const {
    id,
    action,
    humanOverride,
  }: { id: string; action: 'approved' | 'rejected'; humanOverride?: string } = await req.json()

  if (typeof id !== 'string' || !['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const checkpoint = auditLog.find(c => c.id === id)
  if (!checkpoint) {
    return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 })
  }

  if (checkpoint.status !== 'pending') {
    // Already actioned — avoid double-processing (e.g. a duplicate click that
    // slipped past the client-side guard)
    return NextResponse.json({ success: true, checkpoint, alreadyProcessed: true })
  }

  checkpoint.status = action
  if (humanOverride) checkpoint.humanOverride = humanOverride.slice(0, 2000)

  if (action === 'approved') {
    const finalMessage = humanOverride || checkpoint.resolution.draftResponse

    const finalResponse = await qwen.chat.completions.create({
      model: MODELS.MAX,
      messages: [
        {
          role: 'system',
          content: 'You are a professional e-commerce customer service agent. Polish this response to be warm, helpful, and concise. Keep it under 100 words.',
        },
        {
          role: 'user',
          content: finalMessage,
        },
      ],
    })

    const polished = finalResponse.choices[0].message.content

    return NextResponse.json({
      success: true,
      finalResponse: polished,
      checkpoint,
    })
  }

  return NextResponse.json({ success: true, checkpoint })
}
