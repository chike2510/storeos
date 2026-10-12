import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ShopifyAdmin } from './admin-api'
import { getConnection, ShopifyAuthError, type ShopifyConnection } from './connection'
import {
  mapCustomer,
  mapOrder,
  mapProduct,
  updatedSinceQuery,
  type GqlCustomer,
  type GqlLineItem,
  type GqlOrder,
  type GqlProduct,
  type GqlVariant,
  type PageInfo,
} from './mappers'
import {
  CUSTOMER_QUERY,
  CUSTOMERS_QUERY,
  ORDER_LINE_ITEMS_QUERY,
  ORDER_QUERY,
  ORDERS_QUERY,
  PRODUCT_QUERY,
  PRODUCT_VARIANTS_QUERY,
  PRODUCTS_QUERY,
} from './queries'

type Resource = 'products' | 'customers' | 'orders'
const RESOURCES: Resource[] = ['products', 'customers', 'orders']
const PAGE_SIZE: Record<Resource, number> = { products: 10, customers: 100, orders: 5 }

interface ResourceState {
  since?: string | null // watermark: start of the last completed pass
  cursor?: string | null // mid-pass cursor (pass interrupted by the time budget)
  query?: string | null // filter the in-flight pass was started with
  pass_started?: string | null
}

export type SyncTrigger = 'connect' | 'manual' | 'cron' | 'webhook'

export interface SyncResult {
  status: 'succeeded' | 'partial' | 'failed' | 'skipped'
  stats: Record<Resource, number>
  error?: string
}

function errorMessage(e: unknown) {
  return (e instanceof Error ? e.message : 'Unknown error').slice(0, 500)
}

// ─── Fetch + upsert helpers (shared with webhooks) ─────────────────────────

async function allVariants(api: ShopifyAdmin, p: GqlProduct): Promise<GqlVariant[]> {
  const nodes = [...p.variants.nodes]
  let page: PageInfo = p.variants.pageInfo
  while (page.hasNextPage && page.endCursor) {
    const data = await api.graphql<{ product: { variants: { pageInfo: PageInfo; nodes: GqlVariant[] } } | null }>(
      PRODUCT_VARIANTS_QUERY,
      { id: p.id, after: page.endCursor },
    )
    if (!data.product) break
    nodes.push(...data.product.variants.nodes)
    page = data.product.variants.pageInfo
  }
  return nodes
}

async function allLineItems(api: ShopifyAdmin, o: GqlOrder): Promise<GqlLineItem[]> {
  const nodes = [...o.lineItems.nodes]
  let page: PageInfo = o.lineItems.pageInfo
  while (page.hasNextPage && page.endCursor) {
    const data = await api.graphql<{ order: { lineItems: { pageInfo: PageInfo; nodes: GqlLineItem[] } } | null }>(
      ORDER_LINE_ITEMS_QUERY,
      { id: o.id, after: page.endCursor },
    )
    if (!data.order) break
    nodes.push(...data.order.lineItems.nodes)
    page = data.order.lineItems.pageInfo
  }
  return nodes
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await createAdminClient().rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as number
}

export async function upsertProducts(api: ShopifyAdmin, workspaceId: string, products: GqlProduct[]) {
  const rows = []
  for (const p of products) rows.push(mapProduct(p, await allVariants(api, p)))
  return rows.length ? rpc('shopify_upsert_products', { p_workspace: workspaceId, p_rows: rows }) : 0
}

export async function upsertCustomers(workspaceId: string, customers: GqlCustomer[]) {
  const rows = customers.map(mapCustomer)
  return rows.length ? rpc('shopify_upsert_customers', { p_workspace: workspaceId, p_rows: rows }) : 0
}

export async function upsertOrders(api: ShopifyAdmin, workspaceId: string, orders: GqlOrder[]) {
  // Customers first so orders can link to them.
  const customers = new Map<string, GqlCustomer>()
  for (const o of orders) if (o.customer) customers.set(o.customer.id, o.customer)
  await upsertCustomers(workspaceId, Array.from(customers.values()))
  const rows = []
  for (const o of orders) rows.push(mapOrder(o, await allLineItems(api, o)))
  return rows.length ? rpc('shopify_upsert_orders', { p_workspace: workspaceId, p_rows: rows }) : 0
}

export async function syncProductById(api: ShopifyAdmin, workspaceId: string, gid: string) {
  const data = await api.graphql<{ product: GqlProduct | null }>(PRODUCT_QUERY, { id: gid })
  if (!data.product) return 0
  return upsertProducts(api, workspaceId, [data.product])
}

export async function syncCustomerById(api: ShopifyAdmin, workspaceId: string, gid: string) {
  const data = await api.graphql<{ customer: GqlCustomer | null }>(CUSTOMER_QUERY, { id: gid })
  if (!data.customer) return 0
  return upsertCustomers(workspaceId, [data.customer])
}

export async function syncOrderById(api: ShopifyAdmin, workspaceId: string, gid: string) {
  const data = await api.graphql<{ order: GqlOrder | null }>(ORDER_QUERY, { id: gid })
  if (!data.order) return 0
  return upsertOrders(api, workspaceId, [data.order])
}

// ─── Paged resource sync ────────────────────────────────────────────────────

type Page<T> = { pageInfo: PageInfo; nodes: T[] }

async function fetchPage(api: ShopifyAdmin, resource: Resource, after: string | null, query: string | null) {
  const vars = { first: PAGE_SIZE[resource], after, query }
  if (resource === 'products') return (await api.graphql<{ products: Page<GqlProduct> }>(PRODUCTS_QUERY, vars)).products
  if (resource === 'customers') return (await api.graphql<{ customers: Page<GqlCustomer> }>(CUSTOMERS_QUERY, vars)).customers
  return (await api.graphql<{ orders: Page<GqlOrder> }>(ORDERS_QUERY, vars)).orders
}

async function upsertPage(api: ShopifyAdmin, workspaceId: string, resource: Resource, nodes: unknown[]) {
  if (resource === 'products') return upsertProducts(api, workspaceId, nodes as GqlProduct[])
  if (resource === 'customers') return upsertCustomers(workspaceId, nodes as GqlCustomer[])
  return upsertOrders(api, workspaceId, nodes as GqlOrder[])
}

/**
 * Initial + incremental sync of products (with variants and stock), customers
 * and orders. Time-boxed: when the budget runs out mid-pass the cursor is saved
 * in sync_state and the next run (Sync now / cron) continues from it.
 * Idempotent — every write is an upsert keyed by Shopify GID.
 */
export async function runShopifySync(
  workspaceId: string,
  opts: { trigger: SyncTrigger; budgetMs?: number; fullProducts?: boolean; conn?: ShopifyConnection },
): Promise<SyncResult> {
  const stats: Record<Resource, number> = { products: 0, customers: 0, orders: 0 }
  const admin = createAdminClient()
  const conn = opts.conn ?? (await getConnection(workspaceId))
  if (!conn || conn.status === 'uninstalled' || conn.status === 'pending' || !conn.access_token_enc) {
    return { status: 'skipped', stats, error: 'Shopify is not connected' }
  }

  const budgetMs = opts.budgetMs ?? 45_000
  const { data: locked } = await admin.rpc('shopify_try_lock', {
    p_workspace: workspaceId,
    p_seconds: Math.ceil(budgetMs / 1000) + 90,
  })
  if (!locked) return { status: 'skipped', stats, error: 'A sync is already running' }

  const { data: run } = await admin
    .from('shopify_sync_runs')
    .insert({ workspace_id: workspaceId, trigger: opts.trigger, status: 'running' })
    .select('id')
    .single<{ id: string }>()

  const deadline = Date.now() + budgetMs
  const state = { ...(conn.sync_state ?? {}) } as Record<Resource, ResourceState>
  const api = new ShopifyAdmin(conn)
  let status: SyncResult['status'] = 'succeeded'
  let error: string | undefined
  let authFailed = false

  const saveState = async () => {
    await admin.from('shopify_connections').update({ sync_state: state }).eq('workspace_id', workspaceId)
  }

  try {
    outer: for (const resource of RESOURCES) {
      const s: ResourceState = { ...(state[resource] ?? {}) }
      if (!s.cursor) {
        s.pass_started = new Date().toISOString()
        s.query = opts.fullProducts && resource === 'products' ? null : updatedSinceQuery(s.since)
      }
      for (;;) {
        if (Date.now() > deadline) {
          status = 'partial'
          state[resource] = s
          await saveState()
          break outer
        }
        const page = await fetchPage(api, resource, s.cursor ?? null, s.query ?? null)
        stats[resource] += await upsertPage(api, workspaceId, resource, page.nodes)
        if (page.pageInfo.hasNextPage && page.pageInfo.endCursor) {
          s.cursor = page.pageInfo.endCursor
          state[resource] = s
          await saveState()
        } else {
          state[resource] = { since: s.pass_started }
          await saveState()
          break
        }
      }
    }
  } catch (e) {
    status = 'failed'
    error = errorMessage(e)
    authFailed = e instanceof ShopifyAuthError
  }

  const now = new Date().toISOString()
  await admin
    .from('shopify_connections')
    .update({
      sync_lock_until: null,
      ...(status !== 'failed' ? { last_sync_at: now, last_error: null, status: 'connected' } : { last_error: error }),
      ...(authFailed ? { status: 'error' } : {}),
    })
    .eq('workspace_id', workspaceId)
  if (run) {
    await admin.from('shopify_sync_runs').update({ status, stats, error: error ?? null, finished_at: now }).eq('id', run.id)
  }
  return { status, stats, error }
}

export function describeSync(r: SyncResult) {
  const counts = `${r.stats.products} products, ${r.stats.customers} customers and ${r.stats.orders} orders`
  if (r.status === 'succeeded') return `Synced ${counts}.`
  if (r.status === 'partial') return `Synced ${counts} so far — the rest continues on the next sync.`
  if (r.status === 'skipped') return r.error ?? 'Sync skipped.'
  return `Sync failed: ${r.error ?? 'unknown error'}`
}

export { ShopifyAuthError }
