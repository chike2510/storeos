import { siteUrl } from '@/lib/env'

export const SHOPIFY_API_VERSION = '2026-10'

export const SHOPIFY_SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'write_orders',
  'read_customers',
  'write_customers',
  'read_inventory',
  'write_inventory',
  'read_fulfillments',
  'write_fulfillments',
  'read_locations',
] as const

/** Webhook topics registered on connect (GraphQL enum → REST topic header). */
export const SHOPIFY_WEBHOOK_TOPICS: { topic: string; header: string }[] = [
  { topic: 'ORDERS_CREATE', header: 'orders/create' },
  { topic: 'ORDERS_UPDATED', header: 'orders/updated' },
  { topic: 'ORDERS_CANCELLED', header: 'orders/cancelled' },
  { topic: 'PRODUCTS_CREATE', header: 'products/create' },
  { topic: 'PRODUCTS_UPDATE', header: 'products/update' },
  { topic: 'PRODUCTS_DELETE', header: 'products/delete' },
  { topic: 'CUSTOMERS_CREATE', header: 'customers/create' },
  { topic: 'CUSTOMERS_UPDATE', header: 'customers/update' },
  { topic: 'INVENTORY_LEVELS_UPDATE', header: 'inventory_levels/update' },
  { topic: 'APP_UNINSTALLED', header: 'app/uninstalled' },
]

export function shopifyWebhookUrl() {
  return `${siteUrl()}/api/shopify/webhooks`
}

/** Must exactly match a redirect URL registered on the Dev Dashboard app. */
export function shopifyRedirectUri() {
  return (process.env.SHOPIFY_REDIRECT_URI || `${siteUrl()}/api/shopify/callback`).trim()
}

/** App-level credentials (optional): used for OAuth installs started without a saved client ID/secret. */
export function envAppCredentials() {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim() || ''
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/** Refresh tokens this long before they expire. */
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000

/** httpOnly cookie carrying the signed OAuth state (path /api/shopify, 10 minutes). */
export const OAUTH_COOKIE = 'storeos_shopify_oauth'
