// Unit tests for Shopify → StoreOS mapping (src/lib/shopify/mappers.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapCustomer, mapOrder, mapOrderStatus, mapProduct, mapProductStatus, toGid, updatedSinceQuery } from '../src/lib/shopify/mappers.ts'

test('order status precedence', () => {
  assert.equal(mapOrderStatus('PAID', 'UNFULFILLED', null), 'paid')
  assert.equal(mapOrderStatus('PAID', 'FULFILLED', null), 'fulfilled')
  assert.equal(mapOrderStatus('PARTIALLY_REFUNDED', 'FULFILLED', null), 'refunded')
  assert.equal(mapOrderStatus('REFUNDED', 'UNFULFILLED', null), 'refunded')
  assert.equal(mapOrderStatus('PAID', 'FULFILLED', '2026-10-01T00:00:00Z'), 'cancelled')
  assert.equal(mapOrderStatus('VOIDED', null, null), 'cancelled')
  assert.equal(mapOrderStatus('PENDING', 'UNFULFILLED', null), 'pending')
  assert.equal(mapOrderStatus('AUTHORIZED', null, null), 'pending')
})

test('product status', () => {
  assert.equal(mapProductStatus('ACTIVE'), 'active')
  assert.equal(mapProductStatus('ARCHIVED'), 'archived')
  assert.equal(mapProductStatus('DRAFT'), 'draft')
  assert.equal(mapProductStatus('UNLISTED'), 'draft')
})

test('product + variants', () => {
  const variants = [
    { id: 'gid://shopify/ProductVariant/1', title: 'S', sku: 'T-S', price: '25.00', compareAtPrice: '30.00', inventoryQuantity: 4, selectedOptions: [{ name: 'Size', value: 'S' }], inventoryItem: { id: 'gid://shopify/InventoryItem/1', tracked: true } },
    { id: 'gid://shopify/ProductVariant/2', title: 'M', sku: 'T-M', price: '20.00', compareAtPrice: null, inventoryQuantity: 6, selectedOptions: [{ name: 'Size', value: 'M' }], inventoryItem: { id: 'gid://shopify/InventoryItem/2', tracked: true } },
  ]
  const row = mapProduct({ id: 'gid://shopify/Product/9', title: 'Tee', description: 'Soft', productType: 'Shirts', status: 'ACTIVE', tags: ['Summer'], updatedAt: '', featuredMedia: { preview: { image: { url: 'https://cdn/x.png' } } }, variants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: variants } }, variants)
  assert.equal(row.price, '20')
  assert.equal(row.has_variants, true)
  assert.equal(row.track_inventory, true)
  assert.equal(row.image_url, 'https://cdn/x.png')
  assert.deepEqual(row.tags, ['summer'])
  assert.deepEqual(row.variants[0].options, { Size: 'S' })
  assert.equal(row.variants[1].stock, 6)
  const single = mapProduct({ id: 'p', title: '', description: null, productType: null, status: 'DRAFT', tags: [], updatedAt: '', featuredMedia: null, variants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }, [{ ...variants[0], title: 'Default Title', inventoryItem: { id: 'i', tracked: false } }])
  assert.equal(single.has_variants, false)
  assert.equal(single.track_inventory, false)
  assert.equal(single.title, 'Untitled product')
})

test('customer name fallbacks', () => {
  const base = { id: 'gid://shopify/Customer/1', displayName: null, firstName: null, lastName: null, defaultEmailAddress: null, defaultPhoneNumber: null, defaultAddress: null, tags: [], updatedAt: '' }
  assert.equal(mapCustomer({ ...base, firstName: 'Ada', lastName: 'Obi' }).name, 'Ada Obi')
  assert.equal(mapCustomer({ ...base, defaultEmailAddress: { emailAddress: 'a@x.com' } }).name, 'a@x.com')
  assert.equal(mapCustomer(base).name, 'Shopify customer')
  assert.equal(mapCustomer({ ...base, defaultAddress: { formatted: ['1 Road', 'Lagos', 'Nigeria'] } }).address, '1 Road, Lagos, Nigeria')
})

test('order mapping uses shop money and line items', () => {
  const m = a => ({ shopMoney: { amount: a, currencyCode: 'USD' } })
  const row = mapOrder({ id: 'gid://shopify/Order/1', name: '#1001', createdAt: 'c', updatedAt: 'u', processedAt: 'p', cancelledAt: null, note: null, currencyCode: 'USD', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customer: null, shippingAddress: null, subtotalPriceSet: m('40.0'), totalDiscountsSet: m('0.0'), totalShippingPriceSet: m('5.0'), totalPriceSet: m('45.0'), totalRefundedSet: null, lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } },
    [{ id: 'li', name: 'Tee - S', sku: null, quantity: 2, originalUnitPriceSet: m('20.0'), originalTotalSet: m('40.0'), variant: { id: 'v' }, product: { id: 'p' } }])
  assert.equal(row.status, 'paid')
  assert.equal(row.total, '45.0')
  assert.equal(row.refunded_amount, '0')
  assert.equal(row.currency, 'USD')
  assert.equal(row.line_items[0].variant_external_id, 'v')
})

test('helpers', () => {
  assert.equal(toGid('Order', 123), 'gid://shopify/Order/123')
  assert.equal(toGid('Order', 'gid://shopify/Order/5'), 'gid://shopify/Order/5')
  assert.equal(toGid('Order', null), null)
  assert.equal(updatedSinceQuery(null), null)
  assert.equal(updatedSinceQuery('2026-10-12T10:00:00.000Z'), "updated_at:>='2026-10-12T09:58:00.000Z'")
})
