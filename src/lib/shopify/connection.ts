import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { TOKEN_REFRESH_MARGIN_MS, envAppCredentials } from './config'
import { createHmac } from 'node:crypto'
import { decryptSecret, encryptSecret, parseEncryptionKey } from './crypto'

/** Full row, including ciphertext. Only ever loaded with the service role. */
export interface ShopifyConnection {
  id: string
  workspace_id: string
  shop_domain: string
  shop_name: string | null
  shop_currency: string | null
  client_id: string
  client_secret_enc: string | null
  access_token_enc: string | null
  refresh_token_enc: string | null
  token_expires_at: string | null
  refresh_token_expires_at: string | null
  auth_mode: 'client_credentials' | 'oauth'
  scopes: string[]
  status: 'pending' | 'connected' | 'error' | 'uninstalled'
  webhooks_registered_at: string | null
  sync_state: Record<string, unknown>
  sync_lock_until: string | null
  last_sync_at: string | null
  last_error: string | null
}

export interface TokenResponse {
  access_token: string
  scope?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
}

export class ShopifyAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShopifyAuthError'
  }
}

type SecretField = 'client_secret' | 'access_token' | 'refresh_token'

function key() {
  return parseEncryptionKey(process.env.STOREOS_ENCRYPTION_KEY)
}

function aad(workspaceId: string, field: SecretField) {
  return `shopify_connections:${workspaceId}:${field}`
}

export function encryptField(workspaceId: string, field: SecretField, value: string) {
  return encryptSecret(value, key(), aad(workspaceId, field))
}

export function decryptField(workspaceId: string, field: SecretField, value: string | null): string | null {
  return value ? decryptSecret(value, key(), aad(workspaceId, field)) : null
}

/** The connection's client secret: the saved one, or the app-level env secret for the same client ID. */
export function connectionClientSecret(conn: Pick<ShopifyConnection, 'workspace_id' | 'client_id' | 'client_secret_enc'>): string | null {
  const saved = decryptField(conn.workspace_id, 'client_secret', conn.client_secret_enc)
  if (saved) return saved
  const env = envAppCredentials()
  return env && env.clientId === conn.client_id ? env.clientSecret : null
}

export async function getConnection(workspaceId: string): Promise<ShopifyConnection | null> {
  const { data, error } = await createAdminClient()
    .from('shopify_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(`Could not load the Shopify connection: ${error.message}`)
  return (data as ShopifyConnection | null) ?? null
}

export async function getConnectionByShop(shopDomain: string): Promise<ShopifyConnection | null> {
  const { data, error } = await createAdminClient()
    .from('shopify_connections')
    .select('*')
    .eq('shop_domain', shopDomain)
    .maybeSingle()
  if (error) throw new Error(`Could not load the Shopify connection: ${error.message}`)
  return (data as ShopifyConnection | null) ?? null
}

export async function updateConnection(workspaceId: string, values: Partial<ShopifyConnection>) {
  const { error } = await createAdminClient().from('shopify_connections').update(values).eq('workspace_id', workspaceId)
  if (error) throw new Error(`Could not save the Shopify connection: ${error.message}`)
}

// ─── Token endpoint ────────────────────────────────────────────────────────

async function postTokenEndpoint(shop: string, body: Record<string, string>): Promise<TokenResponse> {
  let res: Response
  try {
    res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    throw new Error(`Could not reach ${shop}. Check the shop domain.`)
  }
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    // Shopify returns HTML for unknown shops.
  }
  if (!res.ok || typeof json.access_token !== 'string') {
    const detail =
      (typeof json.error_description === 'string' && json.error_description) ||
      (typeof json.error === 'string' && json.error) ||
      (typeof json.errors === 'string' && json.errors) ||
      `HTTP ${res.status}`
    const hint =
      res.status === 400 || res.status === 401 || res.status === 403
        ? ' Check the client ID and secret, that the app is installed on this store, and (for client credentials) that the app and store belong to the same Shopify organization.'
        : res.status === 404
          ? ' Check the shop domain.'
          : ''
    throw new ShopifyAuthError(`Shopify rejected the token request (${detail}).${hint}`)
  }
  return json as unknown as TokenResponse
}

/** Client credentials grant (app and store in the same Shopify organization). ~24h token, no refresh token. */
export function requestClientCredentialsToken(shop: string, clientId: string, clientSecret: string) {
  return postTokenEndpoint(shop, { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
}

/** Authorization code grant → expiring offline token + refresh token. */
export function exchangeAuthorizationCode(shop: string, clientId: string, clientSecret: string, code: string) {
  return postTokenEndpoint(shop, { client_id: clientId, client_secret: clientSecret, code, expiring: '1' })
}

export function refreshOfflineToken(shop: string, clientId: string, clientSecret: string, refreshToken: string) {
  return postTokenEndpoint(shop, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
}

/** Encrypted column values for a token response. */
export function tokenColumns(workspaceId: string, t: TokenResponse): Partial<ShopifyConnection> {
  const now = Date.now()
  const cols: Partial<ShopifyConnection> = {
    access_token_enc: encryptField(workspaceId, 'access_token', t.access_token),
    token_expires_at: t.expires_in ? new Date(now + t.expires_in * 1000).toISOString() : null,
  }
  if (t.refresh_token) {
    cols.refresh_token_enc = encryptField(workspaceId, 'refresh_token', t.refresh_token)
    cols.refresh_token_expires_at = t.refresh_token_expires_in
      ? new Date(now + t.refresh_token_expires_in * 1000).toISOString()
      : null
  }
  if (t.scope) cols.scopes = t.scope.split(',').map(s => s.trim()).filter(Boolean)
  return cols
}

// ─── Token manager ──────────────────────────────────────────────────────────

function isFresh(conn: ShopifyConnection) {
  if (!conn.access_token_enc) return false
  if (!conn.token_expires_at) return true // non-expiring offline token
  return Date.parse(conn.token_expires_at) - Date.now() > TOKEN_REFRESH_MARGIN_MS
}

/**
 * A valid Admin API token for this connection. Client-credentials tokens are
 * re-requested and OAuth tokens refreshed shortly before they expire (or when
 * `force` is set after a 401). Mutates `conn` with the new ciphertext.
 */
export async function getAccessToken(conn: ShopifyConnection, opts: { force?: boolean } = {}): Promise<string> {
  if (!opts.force && isFresh(conn)) {
    return decryptField(conn.workspace_id, 'access_token', conn.access_token_enc) as string
  }

  const secret = connectionClientSecret(conn)
  if (!secret) throw new ShopifyAuthError('The Shopify client secret is missing. Reconnect the store in Settings.')

  let token: TokenResponse
  if (conn.auth_mode === 'client_credentials') {
    token = await requestClientCredentialsToken(conn.shop_domain, conn.client_id, secret)
  } else {
    const refresh = decryptField(conn.workspace_id, 'refresh_token', conn.refresh_token_enc)
    if (!refresh) {
      if (conn.access_token_enc && !conn.token_expires_at) {
        return decryptField(conn.workspace_id, 'access_token', conn.access_token_enc) as string
      }
      throw new ShopifyAuthError('The Shopify authorization expired. Reinstall the app via OAuth in Settings.')
    }
    token = await refreshOfflineToken(conn.shop_domain, conn.client_id, secret, refresh)
  }

  const cols = tokenColumns(conn.workspace_id, token)
  await updateConnection(conn.workspace_id, { ...cols, status: 'connected', last_error: null })
  Object.assign(conn, cols, { status: 'connected', last_error: null })
  return token.access_token
}

/** HMAC key for the OAuth state cookie, derived from STOREOS_ENCRYPTION_KEY (never the raw key). */
export function stateSigningKey() {
  return createHmac('sha256', key()).update('storeos:shopify-oauth-state:v1').digest()
}
