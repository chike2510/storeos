import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertNoUserErrors, type ShopifyAdmin } from './admin-api'
import { SHOPIFY_WEBHOOK_TOPICS, shopifyWebhookUrl } from './config'
import { updateConnection, type ShopifyConnection } from './connection'
import { toGid } from './mappers'
import { INVENTORY_ITEM_QUERY, WEBHOOK_CREATE_MUTATION, WEBHOOK_DELETE_MUTATION, WEBHOOK_SUBSCRIPTIONS_QUERY } from './queries'
import { syncCustomerById, syncOrderById, syncProductById } from './sync'

type Sub = { id: string; topic: string; uri: string }

async function listSubscriptions(api: ShopifyAdmin): Promise<Sub[]> {
  const subs: Sub[] = []
  let after: string | null = null
  for (let i = 0; i < 10; i++) {
    const data: {
      webhookSubscriptions: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Sub[] }
    } = await api.graphql(WEBHOOK_SUBSCRIPTIONS_QUERY, { after })
    subs.push(...data.webhookSubscriptions.nodes)
    if (!data.webhookSubscriptions.pageInfo.hasNextPage) break
    after = data.webhookSubscriptions.pageInfo.endCursor
  }
  return subs
}

/** Create any missing subscriptions pointing at /api/shopify/webhooks. Idempotent. */
export async function registerWebhooks(api: ShopifyAdmin): Promise<{ created: number; existing: number; errors: string[] }> {
  const uri = shopifyWebhookUrl()
  const errors: string[] = []
  let created = 0
  let existing = 0
  if (!uri.startsWith('https://')) {
    return { created, existing, errors: [`Webhooks need a public https URL (NEXT_PUBLIC_SITE_URL is ${uri}).`] }
  }
  const subs = await listSubscriptions(api)
  for (const { topic } of SHOPIFY_WEBHOOK_TOPICS) {
    if (subs.some(s => s.topic === topic && s.uri === uri)) {
      existing++
      continue
    }
    try {
      const data = await api.graphql<{ webhookSubscriptionCreate: { userErrors: { field: string[] | null; message: string }[] } }>(
        WEBHOOK_CREATE_MUTATION,
        { topic, webhookSubscription: { uri, format: 'JSON' } },
      )
      assertNoUserErrors(data.webhookSubscriptionCreate.userErrors, topic)
      created++
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `${topic}: failed`)
    }
  }
  return { created, existing, errors }
}

/** Best-effort removal of our subscriptions (on disconnect). */
export async function deregisterWebhooks(api: ShopifyAdmin) {
  const uri = shopifyWebhookUrl()
  const subs = await listSubscriptions(api)
  let removed = 0
  for (const s of subs.filter(s => s.uri === uri)) {
    try {
      await api.graphql(WEBHOOK_DELETE_MUTATION, { id: s.id })
      removed++
    } catch {
      // ignore — the connection is being removed anyway
    }
  }
  return removed
}

type Payload = Record<string, unknown> & { id?: number | string; admin_graphql_api_id?: string }

function gidOf(type: string, p: Payload) {
  return typeof p.admin_graphql_api_id === 'string' ? p.admin_graphql_api_id : toGid(type, p.id ?? null)
}

/**
 * Apply one verified webhook. Payloads are only used to identify the resource;
 * the current state is re-read through GraphQL so out-of-order deliveries
 * converge on Shopify's latest data.
 */
export async function processWebhook(api: ShopifyAdmin, conn: ShopifyConnection, topic: string, payload: Payload) {
  const ws = conn.workspace_id
  switch (topic) {
    case 'orders/create':
    case 'orders/updated':
    case 'orders/cancelled': {
      const gid = gidOf('Order', payload)
      return gid ? syncOrderById(api, ws, gid) : 0
    }
    case 'products/create':
    case 'products/update': {
      const gid = gidOf('Product', payload)
      return gid ? syncProductById(api, ws, gid) : 0
    }
    case 'products/delete': {
      const gid = gidOf('Product', payload)
      if (!gid) return 0
      const { error } = await createAdminClient().rpc('shopify_archive_product', { p_workspace: ws, p_external_id: gid })
      if (error) throw new Error(error.message)
      return 1
    }
    case 'customers/create':
    case 'customers/update': {
      const gid = gidOf('Customer', payload)
      return gid ? syncCustomerById(api, ws, gid) : 0
    }
    case 'inventory_levels/update': {
      const itemGid = toGid('InventoryItem', (payload.inventory_item_id as number | string | undefined) ?? null)
      if (!itemGid) return 0
      const data = await api.graphql<{
        inventoryItem: { variants: { nodes: { id: string; product: { id: string } }[] } } | null
      }>(INVENTORY_ITEM_QUERY, { id: itemGid })
      const productId = data.inventoryItem?.variants.nodes[0]?.product.id
      return productId ? syncProductById(api, ws, productId) : 0
    }
    case 'app/uninstalled': {
      await updateConnection(ws, {
        status: 'uninstalled',
        access_token_enc: null,
        refresh_token_enc: null,
        token_expires_at: null,
        webhooks_registered_at: null,
        last_error: 'The StoreOS app was uninstalled from this Shopify store.',
      })
      await createAdminClient().from('audit_events').insert({
        workspace_id: ws,
        actor_type: 'system',
        action: 'shopify.uninstalled',
        entity_type: 'workspace',
        entity_id: ws,
        metadata: { shop: conn.shop_domain },
      })
      return 1
    }
    default:
      return 0
  }
}
