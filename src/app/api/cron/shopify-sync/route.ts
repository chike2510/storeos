import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runShopifySync } from '@/lib/shopify/sync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * GET /api/cron/shopify-sync — Vercel Cron backstop for missed webhooks.
 * Incremental customers/orders, plus a full product pass (inventory changes
 * don't bump a product's updated_at). Time-boxed per run; unfinished passes
 * resume next time.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await createAdminClient()
    .from('shopify_connections')
    .select('workspace_id')
    .in('status', ['connected', 'error'])
    .order('last_sync_at', { ascending: true, nullsFirst: true })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const started = Date.now()
  const totalBudget = 50_000
  const results: { workspace_id: string; status: string; error?: string }[] = []
  for (const row of (data ?? []) as { workspace_id: string }[]) {
    const left = totalBudget - (Date.now() - started)
    if (left < 8_000) break
    const r = await runShopifySync(row.workspace_id, { trigger: 'cron', budgetMs: Math.min(left - 5_000, 40_000), fullProducts: true })
    results.push({ workspace_id: row.workspace_id, status: r.status, error: r.error })
  }
  return NextResponse.json({ ok: true, results })
}
