// StoreOS → Shopify product writes: pure builders for productUpdate,
// productVariantsBulkUpdate and productSet inputs, plus the field diff and the
// webhook echo check. No runtime imports so they can be unit tested directly.

export type ProductStatus = 'active' | 'draft' | 'archived'

/** The product fields Shopify owns for a Shopify-sourced product. */
export interface ShopifyOwnedFields {
  title: string
  description: string
  category: string | null
  price: number
  compare_at_price: number | null
  status: ProductStatus
  tags: string[]
}

export type ShopifyFieldChanges = Partial<ShopifyOwnedFields>

export interface ShopifyVariantPrice {
  id: string
  price: string | null
  compareAtPrice: string | null
}

export class ProductWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductWriteError'
  }
}

export function toShopifyStatus(s: ProductStatus): 'ACTIVE' | 'DRAFT' | 'ARCHIVED' {
  return s === 'active' ? 'ACTIVE' : s === 'archived' ? 'ARCHIVED' : 'DRAFT'
}

/** Shopify Money scalar input: decimal string, 2 dp. */
export function moneyInput(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

const cents = (n: number | string | null | undefined) => {
  if (n === null || n === undefined || n === '') return null
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) : null
}

const normText = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .trim()

const tagSet = (tags: string[]) =>
  Array.from(new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean))).sort().join('\u0000')

/**
 * Which Shopify-owned fields the user actually changed (form vs. the row they
 * were editing). Only these are sent to Shopify, so an edit never clobbers a
 * field someone else changed in Shopify meanwhile.
 */
export function diffShopifyFields(current: ShopifyOwnedFields, next: ShopifyOwnedFields): ShopifyFieldChanges {
  const c: ShopifyFieldChanges = {}
  if (next.title.trim() !== current.title.trim()) c.title = next.title.trim()
  if (normText(next.description) !== normText(current.description)) c.description = normText(next.description)
  if ((next.category?.trim() || null) !== (current.category?.trim() || null)) c.category = next.category?.trim() || null
  if (cents(next.price) !== cents(current.price)) c.price = next.price
  if (cents(next.compare_at_price) !== cents(current.compare_at_price)) c.compare_at_price = next.compare_at_price
  if (next.status !== current.status) c.status = next.status
  if (tagSet(next.tags) !== tagSet(current.tags)) c.tags = next.tags
  return c
}

export function hasChanges(c: ShopifyFieldChanges) {
  return Object.keys(c).length > 0
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** StoreOS plain text → descriptionHtml: blank lines = paragraphs, newlines = <br>. */
export function textToHtml(text: string): string {
  const t = normText(text)
  if (!t) return ''
  return t
    .split(/\n{2,}/)
    .map(p => `<p>${p.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('')
}

/**
 * StoreOS stores tags lower-cased; Shopify keeps their case. Keep Shopify's
 * spelling for tags that already exist there so an edit doesn't rename them.
 */
export function mergeTagCase(next: string[], shopifyTags: string[]): string[] {
  const byLower = new Map(shopifyTags.map(t => [t.trim().toLowerCase(), t.trim()]))
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of next) {
    const t = raw.trim()
    const k = t.toLowerCase()
    if (!t || seen.has(k)) continue
    seen.add(k)
    out.push(byLower.get(k) ?? t)
  }
  return out
}

/** ProductUpdateInput for the changed product-level fields, or null when there are none. */
export function buildProductUpdateInput(
  productId: string,
  changes: ShopifyFieldChanges,
  shopifyTags: string[],
): Record<string, unknown> | null {
  const input: Record<string, unknown> = { id: productId }
  if (changes.title !== undefined) {
    if (!changes.title.trim()) throw new ProductWriteError('Give the product a title')
    input.title = changes.title.trim()
  }
  if (changes.description !== undefined) input.descriptionHtml = textToHtml(changes.description)
  if (changes.category !== undefined) input.productType = changes.category ?? ''
  if (changes.status !== undefined) input.status = toShopifyStatus(changes.status)
  if (changes.tags !== undefined) input.tags = mergeTagCase(changes.tags, shopifyTags)
  return Object.keys(input).length > 1 ? input : null
}

/**
 * productVariantsBulkUpdate inputs for a price / compare-at change. StoreOS has
 * one price per product: it is applied to every variant, but only when the
 * variants share one price in Shopify today (otherwise the edit would flatten
 * deliberate per-variant pricing, so we refuse and point to Shopify).
 */
export function buildVariantPriceUpdates(variants: ShopifyVariantPrice[], changes: ShopifyFieldChanges) {
  const priceChanged = changes.price !== undefined
  const compareChanged = changes.compare_at_price !== undefined
  if (!priceChanged && !compareChanged) return []
  if (variants.length === 0) throw new ProductWriteError('This product has no variants in Shopify to price.')

  if (priceChanged && (!Number.isFinite(changes.price) || (changes.price as number) < 0)) {
    throw new ProductWriteError('Price cannot be negative')
  }
  if (compareChanged && changes.compare_at_price !== null && !((changes.compare_at_price as number) >= 0)) {
    throw new ProductWriteError('Compare-at price cannot be negative')
  }
  if (variants.length > 1) {
    const distinct = (vals: (string | null)[]) => new Set(vals.map(v => cents(v))).size
    if (priceChanged && distinct(variants.map(v => v.price)) > 1) {
      throw new ProductWriteError(
        `This product's ${variants.length} variants have different prices in Shopify. Change variant prices in Shopify instead.`,
      )
    }
    if (compareChanged && distinct(variants.map(v => v.compareAtPrice)) > 1) {
      throw new ProductWriteError(
        `This product's ${variants.length} variants have different compare-at prices in Shopify. Change them in Shopify instead.`,
      )
    }
  }
  return variants.map(v => {
    const input: Record<string, unknown> = { id: v.id }
    if (priceChanged) input.price = moneyInput(changes.price as number)
    if (compareChanged) input.compareAtPrice = changes.compare_at_price === null ? null : moneyInput(changes.compare_at_price as number)
    return input
  })
}

export interface PublishableProduct {
  id: string
  title: string
  description: string
  category: string | null
  sku: string | null
  price: number
  compare_at_price: number | null
  track_inventory: boolean
  stock_quantity: number
  image_url: string | null
  tags: string[]
}

/** Stable handle for a published product: retries upsert the same Shopify product instead of creating another. */
export function publishHandle(title: string, productId: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  const suffix = productId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase()
  return slug ? `${slug}-${suffix}` : `product-${suffix}`
}

/** ProductSetInput for a single-variant StoreOS product. */
export function buildProductSetInput(
  p: PublishableProduct,
  opts: { status: ProductStatus; locationId: string | null },
): Record<string, unknown> {
  if (!p.title.trim()) throw new ProductWriteError('Give the product a title')
  if (!(p.price >= 0)) throw new ProductWriteError('Price cannot be negative')
  const variant: Record<string, unknown> = {
    optionValues: [{ optionName: 'Title', name: 'Default Title' }],
    price: moneyInput(p.price),
    inventoryItem: { tracked: p.track_inventory },
  }
  if (p.compare_at_price !== null && p.compare_at_price !== undefined) variant.compareAtPrice = moneyInput(p.compare_at_price)
  if (p.sku?.trim()) variant.sku = p.sku.trim()
  if (p.track_inventory && opts.locationId) {
    variant.inventoryQuantities = [{ locationId: opts.locationId, name: 'available', quantity: Math.max(0, Math.floor(p.stock_quantity)) }]
  }
  const input: Record<string, unknown> = {
    title: p.title.trim(),
    descriptionHtml: textToHtml(p.description),
    status: toShopifyStatus(opts.status),
    tags: mergeTagCase(p.tags, []),
    productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
    variants: [variant],
  }
  if (p.category?.trim()) input.productType = p.category.trim()
  if (p.image_url && /^https:\/\//i.test(p.image_url)) {
    input.files = [{ originalSource: p.image_url, contentType: 'IMAGE', alt: p.title.trim().slice(0, 512) }]
  }
  return input
}

/**
 * products/create|update webhook: true when the payload is not newer than
 * what StoreOS already mirrored (our own write echoing back, or an older
 * delivery arriving late), so the GraphQL re-read can be skipped.
 */
export function isStaleProductWebhook(payloadUpdatedAt: unknown, storedUpdatedAt: string | null | undefined): boolean {
  if (typeof payloadUpdatedAt !== 'string' || !storedUpdatedAt) return false
  const incoming = Date.parse(payloadUpdatedAt)
  const stored = Date.parse(storedUpdatedAt)
  if (!Number.isFinite(incoming) || !Number.isFinite(stored)) return false
  return incoming <= stored
}

/** Link to the product in Shopify admin. */
export function shopifyAdminProductUrl(shopDomain: string | null | undefined, productGid: string | null | undefined): string | null {
  const id = productGid?.match(/^gid:\/\/shopify\/Product\/(\d+)$/)?.[1]
  const store = shopDomain?.match(/^([a-z0-9][a-z0-9-]*)\.myshopify\.com$/)?.[1]
  return id && store ? `https://admin.shopify.com/store/${store}/products/${id}` : null
}
