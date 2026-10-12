import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ShopifyAdmin } from '@/lib/shopify/admin-api'
import { envAppCredentials } from '@/lib/shopify/config'
import { connectionClientSecret, getConnectionByShop } from '@/lib/shopify/connection'
import { normalizeShopDomain, verifyWebhookHmac } from '@/lib/shopify/hmac'
import { processWebhook } from '@/lib/shopify/webhooks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/shopify/webhooks — every topic StoreOS subscribes to.
 * 1. Verify X-Shopify-Hmac-Sha256 over the raw body with the app's client secret.
 * 2. Dedupe on X-Shopify-Webhook-Id (shopify_webhook_events).
 * 3. Re-read the resource through GraphQL and upsert it.
 * Failures return 500 so Shopify retries; a failed delivery may be re-claimed.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256')
  const topic = req.headers.get('x-shopify-topic') ?? ''
  const webhookId = req.headers.get('x-shopify-webhook-id') ?? req.headers.get('x-shopify-event-id')
  const rawShop = req.headers.get('x-shopify-shop-domain')
  const shop = normalizeShopDomain(rawShop)
  if (!shop || !hmac || !webhookId || !topic) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  let conn
  try {
    conn = await getConnectionByShop(shop)
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 })
  }

  let secret: string | null = null
  try {
    secret = conn ? connectionClientSecret(conn) : envAppCredentials()?.clientSecret ?? null
  } catch {
    secret = null
  }
  if (!secret || !verifyWebhookHmac(raw, hmac, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  // Verified, but nothing to apply it to (e.g. disconnected store).
  if (!conn) return NextResponse.json({ ok: true, ignored: 'no connection' })

  const admin = createAdminClient()
  const { data: claimed, error: claimErr } = await admin.rpc('shopify_claim_webhook', {
    p_webhook_id: webhookId,
    p_shop: shop,
    p_topic: topic,
    p_workspace: conn.workspace_id,
  })
  if (claimErr) return NextResponse.json({ error: 'Unavailable' }, { status: 503 })
  if (!claimed) return NextResponse.json({ ok: true, duplicate: true })

  const finish = (status: 'processed' | 'failed' | 'ignored', error?: string) =>
    admin
      .from('shopify_webhook_events')
      .update({ status, error: error ?? null, processed_at: new Date().toISOString() })
      .eq('webhook_id', webhookId)

  if (conn.status === 'uninstalled' && topic !== 'app/uninstalled') {
    await finish('ignored', 'connection uninstalled')
    return NextResponse.json({ ok: true, ignored: 'uninstalled' })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw) as Record<string, unknown>
  } catch {
    await finish('failed', 'invalid JSON')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const n = await processWebhook(new ShopifyAdmin(conn), conn, topic, payload)
    await finish(n === 0 && !/^(orders|products|customers|inventory_levels|app)\//.test(topic) ? 'ignored' : 'processed')
    return NextResponse.json({ ok: true })
  } catch (e) {
    await finish('failed', (e instanceof Error ? e.message : 'error').slice(0, 500))
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
