// Shopify request verification + small pure helpers.
// Pure Node (no Next/Supabase imports) so it can be unit tested directly.
import { createHmac, timingSafeEqual } from 'node:crypto'

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}

/**
 * Verify X-Shopify-Hmac-Sha256: base64(HMAC-SHA256(raw body, client secret)).
 * `rawBody` must be the exact bytes Shopify sent (read before JSON parsing).
 */
export function verifyWebhookHmac(rawBody: string | Buffer, header: string | null | undefined, secret: string): boolean {
  if (!header || !secret) return false
  const digest = createHmac('sha256', secret).update(rawBody).digest()
  const given = Buffer.from(header.trim(), 'base64')
  return safeEqual(given, digest)
}

/**
 * Verify the `hmac` query parameter on OAuth redirects (install callback):
 * hex(HMAC-SHA256("k1=v1&k2=v2…", secret)) over every parameter except
 * `hmac` (and legacy `signature`), sorted by key, using decoded values.
 */
export function verifyOAuthHmac(params: URLSearchParams | Record<string, string>, secret: string): boolean {
  if (!secret) return false
  const entries: [string, string][] =
    params instanceof URLSearchParams ? Array.from(params.entries()) : Object.entries(params)
  const hmac = entries.find(([k]) => k === 'hmac')?.[1]
  if (!hmac || !/^[0-9a-f]+$/i.test(hmac)) return false
  const message = entries
    .filter(([k]) => k !== 'hmac' && k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const digest = createHmac('sha256', secret).update(message).digest()
  return safeEqual(Buffer.from(hmac, 'hex'), digest)
}

/**
 * Normalise what a merchant pastes into "xxx.myshopify.com". Accepts:
 * "xxx", "xxx.myshopify.com", "https://xxx.myshopify.com/admin/...",
 * "https://admin.shopify.com/store/xxx/...". Returns null when invalid.
 */
export function normalizeShopDomain(input: string | null | undefined): string | null {
  let s = (input ?? '').trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^[a-z]+:\/\//, '')
  const admin = s.match(/^admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/)
  let handle: string | undefined
  if (admin) {
    handle = admin[1]
  } else {
    const host = s.split(/[/?#]/)[0]
    const m = host.match(/^([a-z0-9][a-z0-9-]*)(\.myshopify\.com)?$/)
    handle = m?.[1]
  }
  if (!handle || handle.length > 60) return null
  return `${handle}.myshopify.com`
}

/** Signed, expiring token for the OAuth state cookie: base64url(json).base64url(hmac). */
export function signState(payload: Record<string, unknown>, key: string | Buffer): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', key).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyState<T extends Record<string, unknown>>(
  token: string | null | undefined,
  key: string | Buffer,
  maxAgeMs: number,
  now = Date.now(),
): (T & { t: number }) | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', key).update(body).digest()
  if (!safeEqual(Buffer.from(sig, 'base64url'), expected)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { t: number }
    if (typeof data.t !== 'number' || now - data.t > maxAgeMs || data.t - now > 60_000) return null
    return data
  } catch {
    return null
  }
}
