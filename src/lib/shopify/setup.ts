import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ShopifyAdmin } from './admin-api'
import { getConnection, updateConnection } from './connection'
import { SHOP_QUERY } from './queries'
import { runShopifySync, type SyncResult } from './sync'
import { registerWebhooks } from './webhooks'

export interface ConnectOutcome {
  shopName: string
  webhookErrors: string[]
  sync: SyncResult | null
}

/**
 * After a token has been stored: read the shop, register webhooks, run the
 * first (time-boxed) sync and audit the connection.
 */
export async function finalizeConnection(
  workspaceId: string,
  userId: string,
  opts: { syncBudgetMs: number; authMode: 'client_credentials' | 'oauth' },
): Promise<ConnectOutcome> {
  const conn = await getConnection(workspaceId)
  if (!conn) throw new Error('Shopify connection not found')
  const api = new ShopifyAdmin(conn)

  const shop = await api.graphql<{
    shop: { name: string; myshopifyDomain: string; currencyCode: string }
    currentAppInstallation: { accessScopes: { handle: string }[] } | null
  }>(SHOP_QUERY)

  const scopes = shop.currentAppInstallation?.accessScopes.map(s => s.handle) ?? conn.scopes
  await updateConnection(workspaceId, {
    shop_name: shop.shop.name,
    shop_currency: shop.shop.currencyCode,
    scopes,
    status: 'connected',
    last_error: null,
  })

  let webhookErrors: string[] = []
  try {
    const wh = await registerWebhooks(api)
    webhookErrors = wh.errors
    if (wh.errors.length === 0) await updateConnection(workspaceId, { webhooks_registered_at: new Date().toISOString() })
  } catch (e) {
    webhookErrors = [e instanceof Error ? e.message : 'Webhook registration failed']
  }

  await createAdminClient().from('audit_events').insert({
    workspace_id: workspaceId,
    actor_type: 'user',
    actor_id: userId,
    action: 'shopify.connected',
    entity_type: 'workspace',
    entity_id: workspaceId,
    metadata: { shop: conn.shop_domain, shop_name: shop.shop.name, auth_mode: opts.authMode, scopes, webhook_errors: webhookErrors },
  })

  const sync = opts.syncBudgetMs > 0 ? await runShopifySync(workspaceId, { trigger: 'connect', budgetMs: opts.syncBudgetMs }) : null
  return { shopName: shop.shop.name, webhookErrors, sync }
}

/** Every scope the app needs, treating write_x as covering read_x. */
export function missingScopes(granted: string[], required: readonly string[]) {
  return required.filter(s => !granted.includes(s) && !(s.startsWith('read_') && granted.includes(`write_${s.slice(5)}`)))
}
