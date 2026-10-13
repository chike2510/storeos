// Shopify GraphQL nodes → rows for the shopify_upsert_* SQL functions.
// Pure functions (no imports) so they can be unit tested directly.

export type Money = { shopMoney: { amount: string; currencyCode?: string } } | null | undefined
export type PageInfo = { hasNextPage: boolean; endCursor: string | null }

export interface GqlVariant {
  id: string
  title: string
  sku: string | null
  price: string | null
  compareAtPrice: string | null
  inventoryQuantity: number | null
  selectedOptions: { name: string; value: string }[]
  inventoryItem: { id: string; tracked: boolean } | null
}

export interface GqlProduct {
  id: string
  title: string
  description: string | null
  descriptionHtml?: string | null
  productType: string | null
  status: string
  tags: string[]
  updatedAt: string
  featuredMedia: { preview: { image: { url: string } | null } | null } | null
  variants: { pageInfo: PageInfo; nodes: GqlVariant[] }
}

export interface GqlCustomer {
  id: string
  displayName: string | null
  firstName: string | null
  lastName: string | null
  defaultEmailAddress: { emailAddress: string | null } | null
  defaultPhoneNumber: { phoneNumber: string | null } | null
  defaultAddress: { formatted: string[] } | null
  tags: string[]
  updatedAt: string
}

export interface GqlLineItem {
  id: string
  name: string
  sku: string | null
  quantity: number
  originalUnitPriceSet: Money
  originalTotalSet: Money
  variant: { id: string } | null
  product: { id: string } | null
}

export interface GqlOrder {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  processedAt: string | null
  cancelledAt: string | null
  note: string | null
  currencyCode: string
  displayFinancialStatus: string | null
  displayFulfillmentStatus: string | null
  customer: GqlCustomer | null
  shippingAddress: { formatted: string[] } | null
  subtotalPriceSet: Money
  totalDiscountsSet: Money
  totalShippingPriceSet: Money
  totalPriceSet: Money
  totalRefundedSet: Money
  lineItems: { pageInfo: PageInfo; nodes: GqlLineItem[] }
}

export interface ProductRow {
  external_id: string
  title: string
  description: string
  category: string | null
  sku: string | null
  status: 'active' | 'draft' | 'archived'
  price: string
  compare_at_price: string | null
  track_inventory: boolean
  has_variants: boolean
  image_url: string | null
  tags: string[]
  /** Shopify Product.updatedAt (echo / out-of-order guard). */
  updated_at: string | null
  variants: {
    external_id: string
    title: string
    sku: string | null
    options: Record<string, string>
    price: string | null
    inventory_item_id: string | null
    tracked: boolean
    stock: number | null
  }[]
}

export interface CustomerRow {
  external_id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  tags: string[]
}

export type StoreOSOrderStatus = 'pending' | 'paid' | 'fulfilled' | 'delivered' | 'cancelled' | 'refunded'

export interface OrderRow {
  external_id: string
  name: string
  customer_external_id: string | null
  status: StoreOSOrderStatus
  financial_status: string | null
  fulfillment_status: string | null
  currency: string
  subtotal: string
  discount: string
  shipping: string
  total: string
  refunded_amount: string
  notes: string
  shipping_address: string | null
  created_at: string
  updated_at: string
  processed_at: string | null
  cancelled_at: string | null
  line_items: {
    external_id: string
    title: string
    sku: string | null
    quantity: number
    unit_price: string
    total: string
    product_external_id: string | null
    variant_external_id: string | null
  }[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/**
 * Shopify descriptionHtml → the plain text StoreOS edits. Keeps paragraph and
 * line breaks and list bullets (Shopify's own `description` field collapses
 * everything onto one line, which would lose them on a round trip).
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/\r\n?/g, '\n')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\n/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(li)>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z0-9]+);/gi, (m, e: string) => {
      const k = e.toLowerCase()
      if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16))
      if (k.startsWith('#') && k !== '#39') return String.fromCodePoint(parseInt(k.slice(1), 10))
      return ENTITIES[k] ?? m
    })
    .split('\n')
    .map(l => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function money(m: Money): string {
  const v = m?.shopMoney?.amount
  return v && Number.isFinite(Number(v)) ? v : '0'
}

export function mapProductStatus(s: string | null | undefined): ProductRow['status'] {
  switch ((s ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'ARCHIVED':
      return 'archived'
    default:
      return 'draft' // DRAFT, UNLISTED and anything new
  }
}

/**
 * StoreOS keeps one status per order; Shopify splits it into financial and
 * fulfilment status. Precedence: cancelled > refunded (full or partial; the
 * amount lives in refunded_amount, as for StoreOS-native partial refunds) >
 * fulfilled > paid > pending.
 */
export function mapOrderStatus(
  financial: string | null | undefined,
  fulfillment: string | null | undefined,
  cancelledAt: string | null | undefined,
): StoreOSOrderStatus {
  const fin = (financial ?? '').toUpperCase()
  const ful = (fulfillment ?? '').toUpperCase()
  if (cancelledAt) return 'cancelled'
  if (fin === 'REFUNDED' || fin === 'PARTIALLY_REFUNDED') return 'refunded'
  if (fin === 'VOIDED' || fin === 'EXPIRED') return 'cancelled'
  if (ful === 'FULFILLED') return 'fulfilled'
  if (fin === 'PAID' || fin === 'PARTIALLY_PAID') return 'paid'
  return 'pending'
}

function joinAddress(a: { formatted: string[] } | null | undefined): string | null {
  const s = (a?.formatted ?? []).filter(Boolean).join(', ').trim()
  return s || null
}

export function mapCustomer(c: GqlCustomer): CustomerRow {
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
  return {
    external_id: c.id,
    name: (c.displayName || full || c.defaultEmailAddress?.emailAddress || c.defaultPhoneNumber?.phoneNumber || 'Shopify customer').slice(0, 160),
    email: c.defaultEmailAddress?.emailAddress ?? null,
    phone: c.defaultPhoneNumber?.phoneNumber ?? null,
    address: joinAddress(c.defaultAddress),
    tags: (c.tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 50),
  }
}

/** `variants` must be the product's complete variant list (all pages). */
export function mapProduct(p: GqlProduct, variants: GqlVariant[]): ProductRow {
  const first = variants[0]
  const hasRealVariants = variants.length > 1 || (variants.length === 1 && variants[0].title !== 'Default Title')
  const prices = variants.map(v => Number(v.price)).filter(n => Number.isFinite(n) && n >= 0)
  return {
    external_id: p.id,
    title: (p.title || 'Untitled product').slice(0, 200),
    description: (typeof p.descriptionHtml === 'string' ? htmlToText(p.descriptionHtml) : p.description ?? '').slice(0, 5000),
    category: p.productType ? p.productType.slice(0, 80) : null,
    sku: first?.sku || null,
    status: mapProductStatus(p.status),
    price: prices.length ? String(Math.min(...prices)) : '0',
    compare_at_price: first?.compareAtPrice ?? null,
    track_inventory: variants.length === 0 ? false : variants.some(v => v.inventoryItem?.tracked !== false),
    has_variants: hasRealVariants,
    image_url: p.featuredMedia?.preview?.image?.url ?? null,
    tags: (p.tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
    updated_at: p.updatedAt || null,
    variants: variants.map(v => ({
      external_id: v.id,
      title: v.title || 'Default',
      sku: v.sku || null,
      options: Object.fromEntries((v.selectedOptions ?? []).map(o => [o.name, o.value])),
      price: v.price ?? null,
      inventory_item_id: v.inventoryItem?.id ?? null,
      tracked: v.inventoryItem?.tracked !== false,
      stock: typeof v.inventoryQuantity === 'number' ? v.inventoryQuantity : null,
    })),
  }
}

/** `lineItems` must be the order's complete line item list (all pages). */
export function mapOrder(o: GqlOrder, lineItems: GqlLineItem[]): OrderRow {
  return {
    external_id: o.id,
    name: o.name,
    customer_external_id: o.customer?.id ?? null,
    status: mapOrderStatus(o.displayFinancialStatus, o.displayFulfillmentStatus, o.cancelledAt),
    financial_status: o.displayFinancialStatus ?? null,
    fulfillment_status: o.displayFulfillmentStatus ?? null,
    currency: (o.totalPriceSet?.shopMoney?.currencyCode || o.currencyCode || '').toUpperCase(),
    subtotal: money(o.subtotalPriceSet),
    discount: money(o.totalDiscountsSet),
    shipping: money(o.totalShippingPriceSet),
    total: money(o.totalPriceSet),
    refunded_amount: money(o.totalRefundedSet),
    notes: (o.note ?? '').slice(0, 5000),
    shipping_address: joinAddress(o.shippingAddress),
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    processed_at: o.processedAt,
    cancelled_at: o.cancelledAt,
    line_items: lineItems.map(li => ({
      external_id: li.id,
      title: li.name || 'Item',
      sku: li.sku || null,
      quantity: li.quantity,
      unit_price: money(li.originalUnitPriceSet),
      total: money(li.originalTotalSet),
      product_external_id: li.product?.id ?? null,
      variant_external_id: li.variant?.id ?? null,
    })),
  }
}

/** Shopify search syntax filter for incremental syncs (2-minute overlap for clock skew). */
export function updatedSinceQuery(sinceIso: string | null | undefined): string | null {
  if (!sinceIso) return null
  const t = Date.parse(sinceIso)
  if (!Number.isFinite(t)) return null
  return `updated_at:>='${new Date(t - 120_000).toISOString()}'`
}

/** REST numeric id or GID → GID. */
export function toGid(type: string, id: string | number | null | undefined): string | null {
  if (id === null || id === undefined || id === '') return null
  const s = String(id)
  return s.startsWith('gid://') ? s : `gid://shopify/${type}/${s}`
}
