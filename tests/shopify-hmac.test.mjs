// Unit tests for Shopify webhook/OAuth HMAC verification, shop-domain parsing
// and the signed OAuth state (src/lib/shopify/hmac.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { normalizeShopDomain, signState, verifyOAuthHmac, verifyState, verifyWebhookHmac } from '../src/lib/shopify/hmac.ts'

const SECRET = 'test_client_secret'

test('webhook HMAC: accepts the exact raw body', () => {
  const body = '{"id":820982911946154500,"admin_graphql_api_id":"gid://shopify/Order/820982911946154508"}'
  const header = createHmac('sha256', SECRET).update(body, 'utf8').digest('base64')
  assert.equal(verifyWebhookHmac(body, header, SECRET), true)
  assert.equal(verifyWebhookHmac(Buffer.from(body), header, SECRET), true)
})

test('webhook HMAC: rejects modified body, wrong secret, missing/garbage header', () => {
  const body = '{"id":1}'
  const header = createHmac('sha256', SECRET).update(body).digest('base64')
  assert.equal(verifyWebhookHmac('{"id":2}', header, SECRET), false)
  assert.equal(verifyWebhookHmac('{"id": 1}', header, SECRET), false) // re-serialised JSON must fail
  assert.equal(verifyWebhookHmac(body, header, 'other'), false)
  assert.equal(verifyWebhookHmac(body, null, SECRET), false)
  assert.equal(verifyWebhookHmac(body, '', SECRET), false)
  assert.equal(verifyWebhookHmac(body, 'not-base64!!', SECRET), false)
  assert.equal(verifyWebhookHmac(body, header, ''), false)
  // hex digest instead of base64 must fail
  assert.equal(verifyWebhookHmac(body, createHmac('sha256', SECRET).update(body).digest('hex'), SECRET), false)
})

function signedQuery(params) {
  const message = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')
  const hmac = createHmac('sha256', SECRET).update(message).digest('hex')
  return new URLSearchParams({ ...params, hmac })
}

test('OAuth HMAC: accepts a correctly signed callback (any param order)', () => {
  const q = signedQuery({ shop: 'demo.myshopify.com', code: 'abc123', state: 'n0nce', timestamp: '1760000000', host: 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvZGVtbw' })
  assert.equal(verifyOAuthHmac(q, SECRET), true)
  const reordered = new URLSearchParams([...q.entries()].reverse())
  assert.equal(verifyOAuthHmac(reordered, SECRET), true)
  assert.equal(verifyOAuthHmac(Object.fromEntries(q.entries()), SECRET), true)
})

test('OAuth HMAC: rejects tampering and missing hmac', () => {
  const q = signedQuery({ shop: 'demo.myshopify.com', code: 'abc123', state: 'n0nce', timestamp: '1760000000' })
  const tampered = new URLSearchParams(q)
  tampered.set('shop', 'evil.myshopify.com')
  assert.equal(verifyOAuthHmac(tampered, SECRET), false)
  const added = new URLSearchParams(q)
  added.set('extra', '1')
  assert.equal(verifyOAuthHmac(added, SECRET), false)
  const noHmac = new URLSearchParams(q)
  noHmac.delete('hmac')
  assert.equal(verifyOAuthHmac(noHmac, SECRET), false)
  assert.equal(verifyOAuthHmac(q, 'wrong'), false)
  assert.equal(verifyOAuthHmac(q, ''), false)
})

test('shop domain normalisation', () => {
  assert.equal(normalizeShopDomain('demo'), 'demo.myshopify.com')
  assert.equal(normalizeShopDomain('Demo-Store.myshopify.com'), 'demo-store.myshopify.com')
  assert.equal(normalizeShopDomain('https://demo.myshopify.com/admin/products?x=1'), 'demo.myshopify.com')
  assert.equal(normalizeShopDomain('https://admin.shopify.com/store/demo-2/orders'), 'demo-2.myshopify.com')
  assert.equal(normalizeShopDomain('  demo.myshopify.com  '), 'demo.myshopify.com')
  assert.equal(normalizeShopDomain(''), null)
  assert.equal(normalizeShopDomain('evil.com'), null)
  assert.equal(normalizeShopDomain('demo.myshopify.com.evil.com'), null)
  assert.equal(normalizeShopDomain('-bad.myshopify.com'), null)
  assert.equal(normalizeShopDomain('a b'), null)
})

test('signed OAuth state: verifies, expires, rejects tampering', () => {
  const key = 'state-key'
  const now = Date.now()
  const token = signState({ n: 'abc', w: 'ws', s: 'demo.myshopify.com', t: now }, key)
  assert.deepEqual(verifyState(token, key, 600_000, now + 1000)?.n, 'abc')
  assert.equal(verifyState(token, key, 600_000, now + 601_000), null) // expired
  assert.equal(verifyState(token, 'other-key', 600_000, now), null)
  const [body, sig] = token.split('.')
  const forged = Buffer.from(JSON.stringify({ n: 'abc', w: 'other-ws', s: 'demo.myshopify.com', t: now })).toString('base64url')
  assert.equal(verifyState(`${forged}.${sig}`, key, 600_000, now), null)
  assert.equal(verifyState(`${body}.`, key, 600_000, now), null)
  assert.equal(verifyState(undefined, key, 600_000, now), null)
})
