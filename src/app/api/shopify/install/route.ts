import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { OAUTH_COOKIE, SHOPIFY_SCOPES, envAppCredentials, shopifyRedirectUri } from '@/lib/shopify/config'
import { getConnection, stateSigningKey } from '@/lib/shopify/connection'
import { normalizeShopDomain, signState } from '@/lib/shopify/hmac'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shopify/install?shop=xxx.myshopify.com
 * Starts the authorization-code grant: signed state cookie (nonce + workspace +
 * shop, 10 min) → redirect to Shopify's authorize URL.
 */
export async function GET(req: NextRequest) {
  const settings = new URL('/app/settings', req.nextUrl.origin)
  const fail = (msg: string) => {
    settings.searchParams.set('shopify_error', msg)
    return NextResponse.redirect(settings)
  }

  const shop = normalizeShopDomain(req.nextUrl.searchParams.get('shop'))
  if (!shop) return fail('Enter a valid shop domain (xxx.myshopify.com).')

  const { workspace, role, user } = await requireWorkspace()
  if (!canManage(role)) return fail('Only owners and admins can connect Shopify.')

  let conn
  try {
    conn = await getConnection(workspace.id)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not load the connection')
  }

  let clientId: string
  if (conn && conn.shop_domain === shop) {
    clientId = conn.client_id
  } else {
    if (conn && conn.status === 'connected') return fail('Disconnect the current Shopify store before connecting another one.')
    const env = envAppCredentials()
    if (!env) return fail('Enter the app client ID and secret, then choose "Install via OAuth".')
    const { error } = await createAdminClient()
      .from('shopify_connections')
      .upsert(
        {
          workspace_id: workspace.id,
          shop_domain: shop,
          client_id: env.clientId,
          client_secret_enc: null,
          access_token_enc: null,
          refresh_token_enc: null,
          token_expires_at: null,
          auth_mode: 'oauth',
          status: 'pending',
          sync_state: {},
          connected_by: user.id,
          last_error: null,
        },
        { onConflict: 'workspace_id' },
      )
    if (error) {
      return fail(error.code === '23505' ? 'This Shopify store is already connected to another StoreOS workspace.' : error.message)
    }
    clientId = env.clientId
  }

  const nonce = randomBytes(16).toString('hex')
  const state = signState({ n: nonce, w: workspace.id, s: shop, t: Date.now() }, stateSigningKey())

  const authorize = new URL(`https://${shop}/admin/oauth/authorize`)
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('scope', SHOPIFY_SCOPES.join(','))
  authorize.searchParams.set('redirect_uri', shopifyRedirectUri())
  authorize.searchParams.set('state', nonce)

  const res = NextResponse.redirect(authorize)
  res.cookies.set(OAUTH_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/shopify',
    maxAge: 600,
  })
  return res
}
