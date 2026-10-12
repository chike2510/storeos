'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { str } from '@/lib/utils'
import type { ActionState } from '@/lib/types'
import { ShopifyAdmin } from '@/lib/shopify/admin-api'
import { envAppCredentials } from '@/lib/shopify/config'
import {
  connectionClientSecret,
  encryptField,
  getConnection,
  requestClientCredentialsToken,
  tokenColumns,
} from '@/lib/shopify/connection'
import { normalizeShopDomain } from '@/lib/shopify/hmac'
import { finalizeConnection } from '@/lib/shopify/setup'
import { describeSync, runShopifySync } from '@/lib/shopify/sync'
import { deregisterWebhooks, registerWebhooks } from '@/lib/shopify/webhooks'

async function requireAdmin() {
  const ctx = await requireWorkspace()
  if (!canManage(ctx.role)) throw new Error('Only owners and admins can manage integrations.')
  return ctx
}

function fail(e: unknown): ActionState {
  return { error: e instanceof Error ? e.message : 'Something went wrong' }
}

/**
 * Connect a Shopify store. method=client_credentials exchanges the client ID +
 * secret for a token right away (same-organization stores); method=oauth saves
 * the credentials and sends the admin through Shopify's install screen.
 */
export async function connectShopify(_: ActionState, fd: FormData): Promise<ActionState> {
  let oauthShop: string | null = null
  try {
    const { workspace, user } = await requireAdmin()
    const shop = normalizeShopDomain(str(fd.get('shop')))
    if (!shop) return { error: 'Enter your store as xxx.myshopify.com or paste its admin URL.' }
    const method = str(fd.get('method')) === 'oauth' ? 'oauth' : 'client_credentials'
    let clientId = str(fd.get('client_id'))
    let secret = str(fd.get('client_secret'))

    const existing = await getConnection(workspace.id)
    if (existing && existing.shop_domain !== shop && existing.status === 'connected') {
      return { error: `Disconnect ${existing.shop_domain} before connecting another store.` }
    }
    // Blank secret = keep the saved one (same store and app).
    if (!secret && existing && existing.shop_domain === shop && (!clientId || clientId === existing.client_id)) {
      clientId = existing.client_id
      secret = connectionClientSecret(existing) ?? ''
    }
    if (!clientId && !secret && method === 'oauth' && envAppCredentials()) {
      oauthShop = shop // install route uses the app-level credentials
    } else {
      if (!clientId) return { error: 'Enter the app client ID from the Shopify Dev Dashboard.' }
      if (!secret) return { error: 'Enter the app client secret from the Shopify Dev Dashboard.' }
    }

    const admin = createAdminClient()
    const sameStore = existing?.shop_domain === shop

    if (method === 'oauth') {
      if (!oauthShop) {
        const secretEnc = encryptField(workspace.id, 'client_secret', secret)
        const { error } =
          sameStore && existing?.status === 'connected'
            ? // Re-authorizing a connected store: keep its token until the callback replaces it.
              await admin
                .from('shopify_connections')
                .update({ client_id: clientId, client_secret_enc: secretEnc })
                .eq('workspace_id', workspace.id)
            : await admin.from('shopify_connections').upsert(
                {
                  workspace_id: workspace.id,
                  shop_domain: shop,
                  client_id: clientId,
                  client_secret_enc: secretEnc,
                  access_token_enc: null,
                  refresh_token_enc: null,
                  token_expires_at: null,
                  refresh_token_expires_at: null,
                  auth_mode: 'oauth',
                  status: 'pending',
                  sync_state: sameStore ? existing?.sync_state ?? {} : {},
                  connected_by: user.id,
                  last_error: null,
                },
                { onConflict: 'workspace_id' },
              )
        if (error) {
          return { error: error.code === '23505' ? 'This Shopify store is already connected to another StoreOS workspace.' : error.message }
        }
        oauthShop = shop
      }
    } else {
      const token = await requestClientCredentialsToken(shop, clientId, secret)
      const { error } = await admin.from('shopify_connections').upsert(
        {
          workspace_id: workspace.id,
          shop_domain: shop,
          client_id: clientId,
          client_secret_enc: encryptField(workspace.id, 'client_secret', secret),
          refresh_token_enc: null,
          refresh_token_expires_at: null,
          ...tokenColumns(workspace.id, token),
          auth_mode: 'client_credentials',
          status: 'connected',
          sync_state: sameStore ? existing?.sync_state ?? {} : {},
          connected_by: user.id,
          last_error: null,
        },
        { onConflict: 'workspace_id' },
      )
      if (error) {
        return { error: error.code === '23505' ? 'This Shopify store is already connected to another StoreOS workspace.' : error.message }
      }
      const outcome = await finalizeConnection(workspace.id, user.id, { syncBudgetMs: 35_000, authMode: 'client_credentials' })
      revalidatePath('/app', 'layout')
      const webhookNote = outcome.webhookErrors.length ? ` Webhooks: ${outcome.webhookErrors[0]}` : ''
      return {
        ok: true,
        message: `Connected to ${outcome.shopName}. ${outcome.sync ? describeSync(outcome.sync) : ''}${webhookNote}`.trim(),
      }
    }
  } catch (e) {
    return fail(e)
  }
  // redirect() throws, so it must run outside try/catch.
  redirect(`/api/shopify/install?shop=${encodeURIComponent(oauthShop as string)}`)
}

export async function syncShopifyNow(_: ActionState): Promise<ActionState> {
  try {
    const { workspace } = await requireAdmin()
    const conn = await getConnection(workspace.id)
    if (!conn) return { error: 'Shopify is not connected.' }
    let webhookNote = ''
    if (!conn.webhooks_registered_at && conn.status !== 'uninstalled') {
      try {
        const wh = await registerWebhooks(new ShopifyAdmin(conn))
        if (wh.errors.length === 0) {
          await createAdminClient()
            .from('shopify_connections')
            .update({ webhooks_registered_at: new Date().toISOString() })
            .eq('workspace_id', workspace.id)
        } else webhookNote = ` Webhooks: ${wh.errors[0]}`
      } catch (e) {
        webhookNote = ` Webhooks: ${e instanceof Error ? e.message : 'registration failed'}`
      }
    }
    const result = await runShopifySync(workspace.id, { trigger: 'manual', budgetMs: 45_000 })
    revalidatePath('/app', 'layout')
    if (result.status === 'failed') return { error: describeSync(result) }
    return { ok: true, message: describeSync(result) + webhookNote }
  } catch (e) {
    return fail(e)
  }
}

export async function disconnectShopify(_: ActionState): Promise<ActionState> {
  try {
    const { workspace, user } = await requireAdmin()
    const conn = await getConnection(workspace.id)
    if (!conn) return { ok: true, message: 'Shopify is already disconnected.' }
    let removed = 0
    if (conn.access_token_enc && conn.status !== 'uninstalled') {
      try {
        removed = await deregisterWebhooks(new ShopifyAdmin(conn))
      } catch {
        // Token may be invalid already; deleting the connection is what matters.
      }
    }
    const admin = createAdminClient()
    const { error } = await admin.from('shopify_connections').delete().eq('workspace_id', workspace.id)
    if (error) return { error: error.message }
    await admin.from('audit_events').insert({
      workspace_id: workspace.id,
      actor_type: 'user',
      actor_id: user.id,
      action: 'shopify.disconnected',
      entity_type: 'workspace',
      entity_id: workspace.id,
      metadata: { shop: conn.shop_domain, webhooks_removed: removed },
    })
    revalidatePath('/app', 'layout')
    return { ok: true, message: `Disconnected ${conn.shop_domain}. Synced products, orders and customers stay in StoreOS.` }
  } catch (e) {
    return fail(e)
  }
}
