import 'server-only'
import { SHOPIFY_API_VERSION } from './config'
import { getAccessToken, ShopifyAuthError, type ShopifyConnection } from './connection'

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ShopifyApiError'
  }
}

type GqlError = { message: string; extensions?: { code?: string } }
type Cost = {
  requestedQueryCost?: number
  throttleStatus?: { maximumAvailable: number; currentlyAvailable: number; restoreRate: number }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Minimal Admin GraphQL client for one connection: auto token refresh (and one
 * forced refresh on 401), cost-based throttling, retries on THROTTLED / 429 / 5xx.
 */
export class ShopifyAdmin {
  private token: string | null = null

  constructor(public readonly conn: ShopifyConnection) {}

  get shop() {
    return this.conn.shop_domain
  }

  private async accessToken(force = false) {
    if (!this.token || force) this.token = await getAccessToken(this.conn, { force })
    return this.token
  }

  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let refreshed = false
    for (let attempt = 0; attempt < 6; attempt++) {
      const token = await this.accessToken()
      let res: Response
      try {
        res = await fetch(`https://${this.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': token },
          body: JSON.stringify({ query, variables }),
          cache: 'no-store',
        })
      } catch {
        await sleep(500 * 2 ** attempt)
        continue
      }

      if (res.status === 401 && !refreshed) {
        refreshed = true
        await this.accessToken(true)
        continue
      }
      if (res.status === 401 || res.status === 403) {
        throw new ShopifyAuthError(`Shopify denied access (HTTP ${res.status}). Reconnect the store or check the app's scopes.`)
      }
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'))
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt)
        continue
      }

      const json = (await res.json().catch(() => null)) as {
        data?: T
        errors?: GqlError[] | string
        extensions?: { cost?: Cost }
      } | null
      if (!json) throw new ShopifyApiError(`Shopify returned an unreadable response (HTTP ${res.status})`, res.status)

      const cost = json.extensions?.cost
      const errors = Array.isArray(json.errors) ? json.errors : json.errors ? [{ message: String(json.errors) }] : []
      if (errors.some(e => e.extensions?.code === 'THROTTLED')) {
        const status = cost?.throttleStatus
        const need = cost?.requestedQueryCost ?? 200
        const wait = status ? Math.max(0, (need - status.currentlyAvailable) / Math.max(status.restoreRate, 1)) * 1000 : 2000
        await sleep(Math.min(wait + 250, 20_000))
        continue
      }
      if (errors.length) {
        throw new ShopifyApiError(errors.map(e => e.message).join('; ').slice(0, 500), res.status)
      }
      if (!res.ok || !json.data) throw new ShopifyApiError(`Shopify request failed (HTTP ${res.status})`, res.status)

      // Stay ahead of the leaky bucket: pause when it runs low.
      const ts = cost?.throttleStatus
      if (ts && ts.currentlyAvailable < Math.min(300, ts.maximumAvailable / 3)) {
        await sleep(Math.min(((300 - ts.currentlyAvailable) / Math.max(ts.restoreRate, 1)) * 1000, 10_000))
      }
      return json.data
    }
    throw new ShopifyApiError('Shopify is busy (rate limited or unavailable). Try again shortly.')
  }
}

/** userErrors → Error (or nothing). */
export function assertNoUserErrors(errors: { field?: string[] | null; message: string }[] | null | undefined, what: string) {
  if (errors && errors.length) {
    throw new ShopifyApiError(`${what}: ${errors.map(e => e.message).join('; ')}`.slice(0, 500))
  }
}
