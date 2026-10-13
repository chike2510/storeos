// Unit tests for StoreOS → Shopify product writes (src/lib/shopify/product-writes.ts)
// and the description round trip in mappers.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProductSetInput,
  buildProductUpdateInput,
  buildVariantPriceUpdates,
  diffShopifyFields,
  hasChanges,
  isStaleProductWebhook,
  mergeTagCase,
  moneyInput,
  publishHandle,
  shopifyAdminProductUrl,
  textToHtml,
  toShopifyStatus,
} from '../src/lib/shopify/product-writes.ts'
import { htmlToText, mapProduct } from '../src/lib/shopify/mappers.ts'

const base = { title: 'Tee', description: 'Soft cotton', category: 'Shirts', price: 20, compare_at_price: 25, status: 'active', tags: ['summer', 'cotton'] }

test('diff: unchanged form produces no changes (number/string, tag order/case, CRLF, blank category)', () => {
  const same = diffShopifyFields(
    { ...base, category: null, description: 'a\nb' },
    { ...base, price: 20.0, compare_at_price: 25.004, category: '  ', tags: ['Cotton', 'summer'], description: 'a\r\nb  \n' },
  )
  assert.deepEqual(same, {})
  assert.equal(hasChanges(same), false)
})

test('diff: only changed fields are reported', () => {
  const c = diffShopifyFields(base, { ...base, title: ' Tee v2 ', price: 18.5, compare_at_price: null, status: 'draft', tags: ['summer'] })
  assert.deepEqual(c, { title: 'Tee v2', price: 18.5, compare_at_price: null, status: 'draft', tags: ['summer'] })
  assert.deepEqual(diffShopifyFields(base, { ...base, category: 'Tops' }), { category: 'Tops' })
  assert.deepEqual(diffShopifyFields(base, { ...base, category: null }), { category: null })
  assert.deepEqual(diffShopifyFields(base, { ...base, description: 'New' }), { description: 'New' })
})

test('status + money formatting', () => {
  assert.equal(toShopifyStatus('active'), 'ACTIVE')
  assert.equal(toShopifyStatus('draft'), 'DRAFT')
  assert.equal(toShopifyStatus('archived'), 'ARCHIVED')
  assert.equal(moneyInput(20), '20.00')
  assert.equal(moneyInput(19.999), '20.00')
  assert.equal(moneyInput(1500.5), '1500.50')
})

test('productUpdate input carries only changed fields', () => {
  assert.equal(buildProductUpdateInput('gid://shopify/Product/1', {}, []), null)
  assert.equal(buildProductUpdateInput('gid://shopify/Product/1', { price: 5 }, []), null) // price goes to variants
  const input = buildProductUpdateInput(
    'gid://shopify/Product/1',
    { title: 'New', description: 'Line 1\nLine 2\n\nPara <2>', category: null, status: 'archived', tags: ['summer', 'new'] },
    ['Summer', 'Sale'],
  )
  assert.deepEqual(input, {
    id: 'gid://shopify/Product/1',
    title: 'New',
    descriptionHtml: '<p>Line 1<br>Line 2</p><p>Para &lt;2&gt;</p>',
    productType: '',
    status: 'ARCHIVED',
    tags: ['Summer', 'new'],
  })
  assert.throws(() => buildProductUpdateInput('gid://shopify/Product/1', { title: '  ' }, []), /title/)
})

test('tags keep Shopify casing and dedupe', () => {
  assert.deepEqual(mergeTagCase(['vip', 'NEW', 'vip', ' '], ['VIP']), ['VIP', 'NEW'])
})

test('variant price updates: single variant, uniform multi-variant, divergent refused', () => {
  assert.deepEqual(buildVariantPriceUpdates([{ id: 'v1', price: '10.00', compareAtPrice: null }], { title: 'x' }), [])
  assert.deepEqual(buildVariantPriceUpdates([{ id: 'v1', price: '10.00', compareAtPrice: null }], { price: 12 }), [{ id: 'v1', price: '12.00' }])
  assert.deepEqual(
    buildVariantPriceUpdates(
      [
        { id: 'v1', price: '10.00', compareAtPrice: '15.00' },
        { id: 'v2', price: '10', compareAtPrice: '15' },
      ],
      { price: 11, compare_at_price: null },
    ),
    [
      { id: 'v1', price: '11.00', compareAtPrice: null },
      { id: 'v2', price: '11.00', compareAtPrice: null },
    ],
  )
  const divergent = [
    { id: 'v1', price: '10.00', compareAtPrice: null },
    { id: 'v2', price: '12.00', compareAtPrice: null },
  ]
  assert.throws(() => buildVariantPriceUpdates(divergent, { price: 11 }), /different prices/)
  // compare-at alone is fine when compare-at prices agree
  assert.deepEqual(buildVariantPriceUpdates(divergent, { compare_at_price: 20 }), [
    { id: 'v1', compareAtPrice: '20.00' },
    { id: 'v2', compareAtPrice: '20.00' },
  ])
  assert.throws(() => buildVariantPriceUpdates([], { price: 1 }), /no variants/)
  assert.throws(() => buildVariantPriceUpdates([{ id: 'v1', price: '1', compareAtPrice: null }], { price: -1 }), /negative/)
})

test('productSet input for a StoreOS product (draft, stock at location, image, sku)', () => {
  const p = {
    id: '9f1c2d3e-aaaa-bbbb-cccc-000000000000',
    title: 'Ankara wrap dress',
    description: 'Handmade\n\n100% cotton',
    category: 'Apparel',
    sku: 'ANK-1',
    price: 15000,
    compare_at_price: null,
    track_inventory: true,
    stock_quantity: 7,
    image_url: 'https://x.supabase.co/storage/v1/object/public/product-images/ws/a.png',
    tags: ['summer', 'Summer', 'ankara'],
  }
  const input = buildProductSetInput(p, { status: 'draft', locationId: 'gid://shopify/Location/1' })
  assert.equal(input.status, 'DRAFT')
  assert.equal(input.title, 'Ankara wrap dress')
  assert.equal(input.descriptionHtml, '<p>Handmade</p><p>100% cotton</p>')
  assert.equal(input.productType, 'Apparel')
  assert.deepEqual(input.tags, ['summer', 'ankara'])
  assert.deepEqual(input.productOptions, [{ name: 'Title', values: [{ name: 'Default Title' }] }])
  assert.deepEqual(input.variants, [
    {
      optionValues: [{ optionName: 'Title', name: 'Default Title' }],
      price: '15000.00',
      inventoryItem: { tracked: true },
      sku: 'ANK-1',
      inventoryQuantities: [{ locationId: 'gid://shopify/Location/1', name: 'available', quantity: 7 }],
    },
  ])
  assert.deepEqual(input.files, [{ originalSource: p.image_url, contentType: 'IMAGE', alt: 'Ankara wrap dress' }])

  const untracked = buildProductSetInput({ ...p, track_inventory: false, image_url: null, sku: null, category: null, compare_at_price: 20000 }, { status: 'active', locationId: null })
  assert.equal(untracked.status, 'ACTIVE')
  assert.equal(untracked.files, undefined)
  assert.equal(untracked.productType, undefined)
  assert.deepEqual(untracked.variants, [
    { optionValues: [{ optionName: 'Title', name: 'Default Title' }], price: '15000.00', inventoryItem: { tracked: false }, compareAtPrice: '20000.00' },
  ])
  assert.throws(() => buildProductSetInput({ ...p, title: ' ' }, { status: 'draft', locationId: null }), /title/)
})

test('publish handle is stable per product and URL-safe', () => {
  const id = '9F1C2D3E-aaaa-bbbb-cccc-000000000000'
  assert.equal(publishHandle('Ankara Wrap Dress!', id), 'ankara-wrap-dress-9f1c2d3e')
  assert.equal(publishHandle('Ankara Wrap Dress!', id), publishHandle('Ankara Wrap Dress!', id))
  assert.equal(publishHandle('Café crème', id), 'cafe-creme-9f1c2d3e')
  assert.equal(publishHandle('👗', id), 'product-9f1c2d3e')
  assert.ok(publishHandle('x'.repeat(300), id).length <= 69)
})

test('webhook echo / stale detection', () => {
  const stored = '2026-10-13T10:00:00Z'
  assert.equal(isStaleProductWebhook('2026-10-13T06:00:00-04:00', stored), true) // same instant (our own write echoing)
  assert.equal(isStaleProductWebhook('2026-10-13T09:59:59Z', stored), true) // older delivery
  assert.equal(isStaleProductWebhook('2026-10-13T10:00:01Z', stored), false) // a newer change in Shopify
  assert.equal(isStaleProductWebhook(undefined, stored), false)
  assert.equal(isStaleProductWebhook('2026-10-13T10:00:00Z', null), false)
  assert.equal(isStaleProductWebhook('garbage', stored), false)
})

test('admin product URL', () => {
  assert.equal(shopifyAdminProductUrl('my-shop.myshopify.com', 'gid://shopify/Product/123'), 'https://admin.shopify.com/store/my-shop/products/123')
  assert.equal(shopifyAdminProductUrl('evil.com', 'gid://shopify/Product/123'), null)
  assert.equal(shopifyAdminProductUrl('my-shop.myshopify.com', 'gid://shopify/Order/1'), null)
})

test('description round trip: text → descriptionHtml → text', () => {
  for (const t of ['Soft cotton', 'Line 1\nLine 2\n\nPara 2 & <more>', 'a\n\n\n\nb']) {
    const back = htmlToText(textToHtml(t))
    assert.equal(back, t.replace(/\n{3,}/g, '\n\n'))
  }
  assert.equal(textToHtml(''), '')
  assert.equal(htmlToText('<p>Hi&nbsp;there</p>\n<ul><li>One</li><li>Two &amp; three</li></ul><script>x</script>'), 'Hi there\n\n• One\n• Two & three')
  assert.equal(htmlToText('<p>Caf&#233; &#x2014; &quot;ok&quot; &#39;s</p>'), 'Café — "ok" \'s')
  assert.equal(htmlToText(null), '')
})

test('mapProduct prefers descriptionHtml and carries updatedAt', () => {
  const v = { id: 'gid://shopify/ProductVariant/1', title: 'Default Title', sku: null, price: '5.00', compareAtPrice: null, inventoryQuantity: 1, selectedOptions: [], inventoryItem: { id: 'gid://shopify/InventoryItem/1', tracked: true } }
  const row = mapProduct(
    { id: 'gid://shopify/Product/1', title: 'X', description: 'A B', descriptionHtml: '<p>A</p><p>B</p>', productType: null, status: 'DRAFT', tags: [], updatedAt: '2026-10-13T10:00:00Z', featuredMedia: null, variants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [v] } },
    [v],
  )
  assert.equal(row.description, 'A\n\nB')
  assert.equal(row.updated_at, '2026-10-13T10:00:00Z')
  assert.equal(row.has_variants, false)
})
