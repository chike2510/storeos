// Unit tests for AES-256-GCM secret encryption (src/lib/shopify/crypto.ts).
// Run: npm test  (Node ≥ 22.6 with --experimental-strip-types)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { decryptSecret, encryptSecret, parseEncryptionKey } from '../src/lib/shopify/crypto.ts'

const key = randomBytes(32)

test('round-trips a secret', () => {
  const ct = encryptSecret('shpss_example_secret', key, 'shopify_connections:ws1:client_secret')
  assert.equal(decryptSecret(ct, key, 'shopify_connections:ws1:client_secret'), 'shpss_example_secret')
})

test('ciphertext is versioned, random per call and never contains the plaintext', () => {
  const a = encryptSecret('token-123', key)
  const b = encryptSecret('token-123', key)
  assert.match(a, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
  assert.notEqual(a, b)
  assert.ok(!a.includes('token-123'))
})

test('rejects a wrong key', () => {
  const ct = encryptSecret('secret', key)
  assert.throws(() => decryptSecret(ct, randomBytes(32)), /Could not decrypt/)
})

test('rejects tampered data and tags', () => {
  const ct = encryptSecret('secret', key)
  const [v, iv, tag, data] = ct.split(':')
  const flip = s => (s[0] === 'A' ? 'B' : 'A') + s.slice(1)
  assert.throws(() => decryptSecret([v, iv, tag, flip(data)].join(':'), key))
  assert.throws(() => decryptSecret([v, iv, flip(tag), data].join(':'), key))
})

test('AAD binds ciphertext to its row and column', () => {
  const ct = encryptSecret('secret', key, 'shopify_connections:ws1:access_token')
  assert.throws(() => decryptSecret(ct, key, 'shopify_connections:ws2:access_token'))
  assert.throws(() => decryptSecret(ct, key, 'shopify_connections:ws1:refresh_token'))
  assert.throws(() => decryptSecret(ct, key))
})

test('rejects malformed payloads', () => {
  assert.throws(() => decryptSecret('plaintext', key), /format/)
  assert.throws(() => decryptSecret('v2:a:b:c', key), /format/)
})

test('parses hex and base64 keys, rejects bad ones', () => {
  const raw = randomBytes(32)
  assert.deepEqual(parseEncryptionKey(raw.toString('hex')), raw)
  assert.deepEqual(parseEncryptionKey(raw.toString('base64')), raw)
  assert.deepEqual(parseEncryptionKey(` ${raw.toString('base64url')} `), raw)
  assert.throws(() => parseEncryptionKey(undefined), /not configured/)
  assert.throws(() => parseEncryptionKey(''), /not configured/)
  assert.throws(() => parseEncryptionKey(randomBytes(16).toString('base64')), /32 bytes/)
})
