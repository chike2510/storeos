import { Store } from 'lucide-react'
import { Badge, humanize, type Tone } from '@/components/ui/badge'
import { CardBody } from '@/components/ui/card'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Field, Input, Select } from '@/components/ui/input'
import { Alert } from '@/components/ui/misc'
import { formatDateTime, timeAgo } from '@/lib/utils'
import { connectShopify, disconnectShopify, syncShopifyNow } from './shopify-actions'

/** Non-secret columns only (the ciphertext columns are not selectable by users). */
export const SHOPIFY_CONNECTION_COLUMNS =
  'shop_domain, shop_name, client_id, auth_mode, status, scopes, token_expires_at, webhooks_registered_at, last_sync_at, last_error, created_at'

export interface ShopifyConnectionView {
  shop_domain: string
  shop_name: string | null
  client_id: string
  auth_mode: 'client_credentials' | 'oauth'
  status: 'pending' | 'connected' | 'error' | 'uninstalled'
  scopes: string[]
  token_expires_at: string | null
  webhooks_registered_at: string | null
  last_sync_at: string | null
  last_error: string | null
  created_at: string
}

export interface ShopifySyncRunView {
  id: string
  trigger: string
  status: string
  stats: { products?: number; customers?: number; orders?: number }
  error: string | null
  started_at: string
}

const STATUS: Record<ShopifyConnectionView['status'], { tone: Tone; label: string }> = {
  connected: { tone: 'green', label: 'Connected' },
  pending: { tone: 'amber', label: 'Waiting for authorization' },
  error: { tone: 'red', label: 'Needs attention' },
  uninstalled: { tone: 'neutral', label: 'App uninstalled' },
}

const RUN_TONE: Record<string, Tone> = { succeeded: 'green', partial: 'amber', failed: 'red', running: 'blue', skipped: 'neutral' }

function ConnectForm({ conn }: { conn: ShopifyConnectionView | null }) {
  return (
    <ActionForm action={connectShopify} className="space-y-4">
      <Field
        label="Store"
        htmlFor="shopify-shop"
        hint="Your myshopify.com domain, or paste any URL from your Shopify admin."
      >
        <Input id="shopify-shop" name="shop" required placeholder="your-store.myshopify.com" defaultValue={conn?.shop_domain ?? ''} autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client ID" htmlFor="shopify-client-id" hint="Dev Dashboard → your app → Settings.">
          <Input id="shopify-client-id" name="client_id" defaultValue={conn?.client_id ?? ''} autoComplete="off" />
        </Field>
        <Field
          label="Client secret"
          htmlFor="shopify-client-secret"
          hint={conn ? 'Leave blank to keep the saved secret.' : 'Encrypted before it is stored; never shown again.'}
        >
          <Input id="shopify-client-secret" name="client_secret" type="password" autoComplete="new-password" />
        </Field>
      </div>
      <Field
        label="Connection method"
        htmlFor="shopify-method"
        hint="Client credentials works when the app and store are in the same Shopify organization. Use OAuth for a merchant-owned store."
      >
        <Select id="shopify-method" name="method" defaultValue={conn?.auth_mode ?? 'client_credentials'}>
          <option value="client_credentials">Client credentials — connect now</option>
          <option value="oauth">Install via OAuth — approve in Shopify</option>
        </Select>
      </Field>
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingText="Connecting…">
          Connect
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

export function ShopifyIntegration({
  admin,
  conn,
  runs,
}: {
  admin: boolean
  conn: ShopifyConnectionView | null
  runs: ShopifySyncRunView[]
}) {
  const status = conn ? STATUS[conn.status] : null
  return (
    <CardBody className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Store className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900">Shopify</p>
          <p className="truncate text-xs text-zinc-500">
            {conn ? (conn.shop_name ? `${conn.shop_name} · ${conn.shop_domain}` : conn.shop_domain) : 'Sync products, inventory, customers and orders from your Shopify store.'}
          </p>
        </div>
        {status ? (
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        ) : (
          <Badge>Not connected</Badge>
        )}
      </div>

      {!admin ? (
        <p className="text-sm text-zinc-500">Only owners and admins can view or change the Shopify connection.</p>
      ) : (
        <>
          {conn?.last_error ? <Alert tone="error">{conn.last_error}</Alert> : null}

          {conn && conn.status !== 'pending' ? (
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <dt className="text-zinc-500">Method</dt>
              <dd className="text-zinc-800">{conn.auth_mode === 'oauth' ? 'OAuth (offline token)' : 'Client credentials'}</dd>
              <dt className="text-zinc-500">Last sync</dt>
              <dd className="text-zinc-800">{conn.last_sync_at ? `${timeAgo(conn.last_sync_at)} · ${formatDateTime(conn.last_sync_at)}` : 'Never'}</dd>
              <dt className="text-zinc-500">Webhooks</dt>
              <dd className="text-zinc-800">{conn.webhooks_registered_at ? `Registered ${timeAgo(conn.webhooks_registered_at)}` : 'Not registered — run Sync now to retry'}</dd>
              <dt className="text-zinc-500">Token</dt>
              <dd className="text-zinc-800">
                {conn.status === 'uninstalled'
                  ? 'Revoked'
                  : conn.token_expires_at
                    ? `Auto-renews · current one expires ${formatDateTime(conn.token_expires_at)}`
                    : 'Non-expiring'}
              </dd>
            </dl>
          ) : null}

          {conn && (conn.status === 'connected' || conn.status === 'error') ? (
            <div className="flex flex-wrap items-start gap-2">
              <ActionForm action={syncShopifyNow} className="flex-1">
                <SubmitButton size="sm" variant="secondary" pendingText="Syncing…">
                  Sync now
                </SubmitButton>
              </ActionForm>
              <ActionForm action={disconnectShopify}>
                <ConfirmButton
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  message={`Disconnect ${conn.shop_domain}? Webhooks are removed; synced data stays in StoreOS.`}
                >
                  Disconnect
                </ConfirmButton>
              </ActionForm>
            </div>
          ) : null}

          {!conn || conn.status !== 'connected' ? (
            <div className={conn ? 'border-t border-zinc-100 pt-4' : ''}>
              {conn?.status === 'pending' ? (
                <p className="mb-3 text-sm text-zinc-500">Authorization in Shopify hasn&apos;t finished. Submit again to restart it.</p>
              ) : null}
              <ConnectForm conn={conn} />
              {conn && conn.status !== 'error' ? (
                <ActionForm action={disconnectShopify} className="mt-2">
                  <ConfirmButton size="sm" variant="ghost" message="Remove this Shopify connection?">
                    Remove connection
                  </ConfirmButton>
                </ActionForm>
              ) : null}
            </div>
          ) : null}

          {runs.length ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Recent syncs</p>
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
                {runs.map(r => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <Badge tone={RUN_TONE[r.status] ?? 'neutral'}>{humanize(r.status)}</Badge>
                    <span className="min-w-0 flex-1 truncate text-zinc-600">
                      {r.error
                        ? r.error
                        : `${r.stats.products ?? 0} products · ${r.stats.customers ?? 0} customers · ${r.stats.orders ?? 0} orders`}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {humanize(r.trigger)} · {timeAgo(r.started_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </CardBody>
  )
}
