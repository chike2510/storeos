// AES-256-GCM encryption for Shopify credentials at rest.
//
// Ciphertext format: "v1:<iv>:<tag>:<data>" (base64url, 12-byte IV, 16-byte tag).
// The optional AAD binds a ciphertext to its row + column (e.g.
// "shopify_connections:<workspace>:access_token") so a value copied into another
// row or column fails to decrypt.
//
// Pure Node (no Next/Supabase imports) so it can be unit tested directly.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'

/** Parse STOREOS_ENCRYPTION_KEY: 32 bytes as 64 hex chars or base64/base64url. */
export function parseEncryptionKey(raw: string | undefined | null): Buffer {
  const s = (raw ?? '').trim()
  if (!s) throw new Error('STOREOS_ENCRYPTION_KEY is not configured')
  const key = /^[0-9a-fA-F]{64}$/.test(s) ? Buffer.from(s, 'hex') : Buffer.from(s, 'base64')
  if (key.length !== 32) {
    throw new Error('STOREOS_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64, e.g. `openssl rand -base64 32`)')
  }
  return key
}

export function encryptSecret(plaintext: string, key: Buffer, aad?: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'))
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join(':')
}

export function decryptSecret(payload: string, key: Buffer, aad?: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unrecognised ciphertext format')
  const iv = Buffer.from(parts[1], 'base64url')
  const tag = Buffer.from(parts[2], 'base64url')
  const data = Buffer.from(parts[3], 'base64url')
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Corrupt ciphertext')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    // Never echo the payload or key material.
    throw new Error('Could not decrypt secret (wrong STOREOS_ENCRYPTION_KEY or tampered value)')
  }
}
