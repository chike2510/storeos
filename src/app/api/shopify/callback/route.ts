import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/workspace'
import { OAUTH_COOKIE, SHOPIFY_SCOPES } from '@/lib/shopify/config'
import {
  connectionClientSecret,
  exchangeAuthorizationCode,
  getConnection,
  stateSigningKey,
  tokenColumns,
  updateConnection,
} from '@/lib/shopify/connection'
import { normalizeShopDomain, verifyOAuthHmac, verifyState } from '@/lib/shopify/hmac'
import { finalizeConnection, missingScopes } from '@/lib/shopify/setup'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/shopify/callback — Shopify redirects here after the merchant
 * approves the app. Verifies the state cookie and the HMAC, exchanges the code
 * for an expiring offline token (+ refresh token) and finishes the connection.
 */
export async function GET(req: NextRequest) {
  const settings = new URL('/app/settings', req.nextUrl.origin)
  const done = (param: 'shopify' | 'shopify_error', msg: string) => {
    settings.searchParams.set(param, msg)
    const res = NextResponse.redirect(settings)
    res.cookies.set(OAUTH_COOKIE, '', { path: '/api/shopify', maxAge: 0 })
    return res
  }
  const fail = (msg: string) => done('shopify_error', msg)

  const params = req.nextUrl.searchParams
  const rawShop = params.get('shop')
  const shop = normalizeShopDomain(rawShop)
  if (!shop || shop !== rawShop) return fail('Invalid shop in the Shopify callback.')

  let st: { n: string; w: string; s: string; t: number } | null
  try {
    st = verifyState<{ n: string; w: string; s: string }>(req.cookies.get(OAUTH_COOKIE)?.value, stateSigningKey(), 10 * 60_000)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Server is missing STOREOS_ENCRYPTION_KEY')
  }
  if (!st || st.n !== params.get('state') || st.s !== shop) {
    return fail('The Shopify authorization expired or did not start here. Try "Install via OAuth" again.')
  }

  const { supabase, user } = await requireUser()
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', st.w)
    .eq('user_id', user.id)
    .maybeSingle<{ role: string }>()
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return fail('Only owners and admins can connect Shopify.')
  }

  const conn = await getConnection(st.w).catch(() => null)
  if (!conn || conn.shop_domain !== shop) return fail('No pending Shopify connection for this store.')

  let secret: string | null
  try {
    secret = connectionClientSecret(conn)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not read the client secret')
  }
  if (!secret) return fail('The client secret for this app is missing. Enter it again.')
  if (!verifyOAuthHmac(params, secret)) return fail('Shopify callback signature (HMAC) did not verify.')
  const ts = Number(params.get('timestamp'))
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 3600) return fail('The Shopify callback is too old. Try again.')

  const code = params.get('code')
  if (!code) return fail('Shopify did not return an authorization code.')

  try {
    const token = await exchangeAuthorizationCode(shop, conn.client_id, secret, code)
    const cols = tokenColumns(conn.workspace_id, token)
    const missing = missingScopes(cols.scopes ?? [], SHOPIFY_SCOPES)
    await updateConnection(conn.workspace_id, {
      ...cols,
      auth_mode: 'oauth',
      status: 'connected',
      last_error: missing.length ? `Missing scopes: ${missing.join(', ')}` : null,
    })
    const outcome = await finalizeConnection(conn.workspace_id, user.id, { syncBudgetMs: 25_000, authMode: 'oauth' })
    const notes = [
      missing.length ? `Missing scopes: ${missing.join(', ')}.` : '',
      outcome.webhookErrors.length ? 'Some webhooks could not be registered.' : '',
    ].filter(Boolean)
    return done('shopify', `Connected to ${outcome.shopName} via OAuth.${notes.length ? ' ' + notes.join(' ') : ''}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not finish connecting Shopify'
    await updateConnection(conn.workspace_id, { last_error: msg }).catch(() => undefined)
    return fail(msg)
  }
}
