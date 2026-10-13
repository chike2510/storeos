import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertNoUserErrors, ShopifyApiError, type ShopifyAdmin } from './admin-api'
import { mapProduct, type GqlProduct, type ProductRow } from './mappers'
import {
  buildProductSetInput,
  buildProductUpdateInput,
  buildVariantPriceUpdates,
  hasChanges,
  publishHandle,
  ProductWriteError,
  type ProductStatus,
  type PublishableProduct,
  type ShopifyFieldChanges,
} from './product-writes'
import {
  LOCATIONS_QUERY,
  PRODUCT_QUERY,
  PRODUCT_SET_MUTATION,
  PRODUCT_UPDATE_MUTATION,
  PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
} from './queries'
import { allVariants, syncProductById } from './sync'
import { shopifyAdminFor } from './writeback'

type UserError = { field: string[] | null; message: string; code?: string | null }

export interface ShopifyStoreInfo {
  connected: boolean
  shopDomain: string | null
  shopName: string | null
  currency: string | null
}

/**
 * Non-secret facts about the workspace's Shopify store, readable by any member
 * (the connections table itself is owner/admin-only under RLS, so this uses
 * the service role and selects only harmless columns).
 */
export const getShopifyStoreInfo = cache(async (workspaceId: string): Promise<ShopifyStoreInfo> => {
  const { data } = await createAdminClient()
    .from('shopify_connections')
    .select('shop_domain, shop_name, shop_currency, status')
    .eq('workspace_id', workspaceId)
    .maybeSingle<{ shop_domain: string; shop_name: string | null; shop_currency: string | null; status: string }>()
  if (!data) return { connected: false, shopDomain: null, shopName: null, currency: null }
  return {
    connected: data.status === 'connected' || data.status === 'error',
    shopDomain: data.shop_domain,
    shopName: data.shop_name,
    currency: data.shop_currency ? data.shop_currency.toUpperCase() : null,
  }
})

/**
 * Currency for catalogue prices: the Shopify shop's currency when a store is
 * connected (product prices are Shopify's numbers), else the workspace's.
 */
export async function catalogCurrency(workspace: { id: string; currency: string }): Promise<string> {
  const info = await getShopifyStoreInfo(workspace.id)
  return (info.connected && info.currency) || workspace.currency
}

async function saveFromShopify(workspaceId: string, row: ProductRow) {
  const { error } = await createAdminClient().rpc('shopify_upsert_products', { p_workspace: workspaceId, p_rows: [row] })
  if (error) throw new Error(`Shopify was updated, but StoreOS could not save the result: ${error.message}`)
}

async function rowFrom(api: ShopifyAdmin, product: GqlProduct) {
  return mapProduct(product, await allVariants(api, product))
}

/**
 * Push an edit of a Shopify-sourced product to Shopify (productUpdate, then
 * productVariantsBulkUpdate for price / compare-at), then mirror Shopify's
 * response into StoreOS. Nothing the user typed is saved locally unless
 * Shopify accepted it. Returns the row as Shopify now has it.
 */
export async function pushProductEdit(args: {
  workspaceId: string
  productExternalId: string
  changes: ShopifyFieldChanges
}): Promise<ProductRow | null> {
  if (!hasChanges(args.changes)) return null
  const api = await shopifyAdminFor(args.workspaceId)

  const current = await api.graphql<{ product: GqlProduct | null }>(PRODUCT_QUERY, { id: args.productExternalId })
  if (!current.product) throw new ShopifyApiError('This product no longer exists in Shopify.')
  const variants = await allVariants(api, current.product)

  // Validate everything before the first write so a bad price can't leave a half-applied edit.
  const productInput = buildProductUpdateInput(current.product.id, args.changes, current.product.tags ?? [])
  const variantInputs = buildVariantPriceUpdates(
    variants.map(v => ({ id: v.id, price: v.price, compareAtPrice: v.compareAtPrice })),
    args.changes,
  )

  let latest: GqlProduct = current.product
  let wrote = false
  try {
    if (productInput) {
      const data = await api.graphql<{ productUpdate: { product: GqlProduct | null; userErrors: UserError[] } }>(
        PRODUCT_UPDATE_MUTATION,
        { product: productInput },
      )
      assertNoUserErrors(data.productUpdate.userErrors, 'Shopify rejected the change')
      if (!data.productUpdate.product) throw new ShopifyApiError('Shopify did not return the updated product.')
      latest = data.productUpdate.product
      wrote = true
    }
    if (variantInputs.length) {
      const data = await api.graphql<{ productVariantsBulkUpdate: { product: GqlProduct | null; userErrors: UserError[] } }>(
        PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
        { productId: current.product.id, variants: variantInputs },
      )
      assertNoUserErrors(data.productVariantsBulkUpdate.userErrors, 'Shopify rejected the price change')
      if (!data.productVariantsBulkUpdate.product) throw new ShopifyApiError('Shopify did not return the updated product.')
      latest = data.productVariantsBulkUpdate.product
      wrote = true
    }
  } catch (e) {
    // The first mutation may have landed before the second failed. Mirror what
    // Shopify actually has now (not what was typed) so StoreOS never disagrees.
    if (wrote) {
      try {
        await syncProductById(api, args.workspaceId, current.product.id)
      } catch {
        // webhook / next sync will converge
      }
      const msg = e instanceof Error ? e.message : 'Shopify rejected part of the change'
      throw new ShopifyApiError(`${msg} (other fields were saved in Shopify; StoreOS now shows Shopify's current values).`)
    }
    throw e
  }

  const row = await rowFrom(api, latest)
  await saveFromShopify(args.workspaceId, row)
  return row
}

async function firstActiveLocation(api: ShopifyAdmin): Promise<string | null> {
  const data = await api.graphql<{ locations: { nodes: { id: string; isActive: boolean; fulfillsOnlineOrders: boolean }[] } }>(
    LOCATIONS_QUERY,
  )
  const active = data.locations.nodes.filter(l => l.isActive)
  return (active.find(l => l.fulfillsOnlineOrders) ?? active[0])?.id ?? null
}

export interface PublishResult {
  externalId: string
  status: ProductStatus
  title: string
}

/**
 * Create a StoreOS-native product in Shopify with productSet (DRAFT unless
 * asked otherwise), then convert the local row into the Shopify-sourced one
 * (source, external_id, variant external ids) so sync never duplicates it.
 * The handle is derived from the StoreOS id, so a retry after a timeout
 * upserts the same Shopify product instead of creating a second one.
 */
export async function publishProductToShopify(args: {
  workspaceId: string
  productId: string
  status?: ProductStatus
}): Promise<PublishResult> {
  const admin = createAdminClient()
  const { data: product, error } = await admin
    .from('products')
    .select('id, source, external_id, title, description, category, sku, price, compare_at_price, track_inventory, stock_quantity, image_url, tags')
    .eq('id', args.productId)
    .eq('workspace_id', args.workspaceId)
    .maybeSingle<PublishableProduct & { source: string; external_id: string | null }>()
  if (error) throw new Error(error.message)
  if (!product) throw new ProductWriteError('Product not found.')
  if (product.source === 'shopify') throw new ProductWriteError('This product is already in Shopify.')
  if (product.source !== 'storeos') throw new ProductWriteError(`Products synced from ${product.source} can't be published to Shopify.`)

  const api = await shopifyAdminFor(args.workspaceId)
  const p: PublishableProduct = {
    ...product,
    price: Number(product.price),
    compare_at_price: product.compare_at_price === null ? null : Number(product.compare_at_price),
    stock_quantity: Number(product.stock_quantity) || 0,
    tags: product.tags ?? [],
  }
  let locationId: string | null = null
  if (p.track_inventory && p.stock_quantity > 0) {
    locationId = await firstActiveLocation(api)
    if (!locationId) throw new ProductWriteError('Shopify has no active location to stock this product at. Add one in Shopify, then try again.')
  }
  const status = args.status ?? 'draft'
  const input = buildProductSetInput(p, { status, locationId })
  const handle = publishHandle(p.title, p.id)

  const data = await api.graphql<{ productSet: { product: GqlProduct | null; userErrors: UserError[] } }>(PRODUCT_SET_MUTATION, {
    input: { ...input, handle },
    identifier: { handle },
  })
  assertNoUserErrors(data.productSet.userErrors, 'Shopify rejected the product')
  const created = data.productSet.product
  if (!created) throw new ShopifyApiError('Shopify did not return the new product.')

  const row = await rowFrom(api, created)
  const link = await admin.rpc('shopify_link_published_product', {
    p_workspace: args.workspaceId,
    p_product: p.id,
    p_row: row,
  })
  if (link.error) {
    throw new Error(`The product was created in Shopify, but StoreOS could not link it (${link.error.message}). Publishing again will link it without creating a duplicate.`)
  }
  return { externalId: created.id, status: row.status, title: row.title }
}

export { ProductWriteError }
