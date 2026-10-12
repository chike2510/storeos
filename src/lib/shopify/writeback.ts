import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertNoUserErrors, ShopifyAdmin, ShopifyApiError } from './admin-api'
import { getConnection } from './connection'
import { INVENTORY_ADJUST_MUTATION, INVENTORY_ITEM_QUERY, ORDER_REFUND_INFO_QUERY, REFUND_CREATE_MUTATION, VARIANT_QUANTITY_QUERY } from './queries'
import { syncOrderById } from './sync'

export async function shopifyAdminFor(workspaceId: string) {
  const conn = await getConnection(workspaceId)
  if (!conn || conn.status === 'uninstalled' || conn.status === 'pending' || !conn.access_token_enc) {
    throw new Error('Shopify is not connected for this workspace. Reconnect it in Settings → Integrations.')
  }
  return new ShopifyAdmin(conn)
}

type UserError = { field: string[] | null; message: string; code?: string | null }

/**
 * Push a stock change for one Shopify variant (inventoryAdjustQuantities on its
 * first active location, with compare-and-swap on the current quantity), then
 * record the resulting on-hand in StoreOS attributed to the user.
 * Returns the variant's new total available quantity.
 */
export async function pushInventoryAdjustment(args: {
  workspaceId: string
  variantExternalId: string
  inventoryItemId: string
  delta: number
  reason: 'restock' | 'adjustment'
  note: string | null
  userId: string
}): Promise<number> {
  const api = await shopifyAdminFor(args.workspaceId)

  const item = await api.graphql<{
    inventoryItem: {
      tracked: boolean
      inventoryLevels: {
        nodes: { location: { id: string; isActive: boolean }; quantities: { name: string; quantity: number }[] }[]
      }
    } | null
  }>(INVENTORY_ITEM_QUERY, { id: args.inventoryItemId })
  if (!item.inventoryItem) throw new ShopifyApiError('This variant no longer exists in Shopify.')
  if (!item.inventoryItem.tracked) throw new ShopifyApiError('Shopify does not track inventory for this variant.')
  const level =
    item.inventoryItem.inventoryLevels.nodes.find(l => l.location.isActive) ?? item.inventoryItem.inventoryLevels.nodes[0]
  if (!level) throw new ShopifyApiError('This variant is not stocked at any Shopify location.')
  const current = level.quantities.find(q => q.name === 'available')?.quantity ?? 0

  const data = await api.graphql<{ inventoryAdjustQuantities: { userErrors: UserError[] } }>(INVENTORY_ADJUST_MUTATION, {
    idempotencyKey: randomUUID(),
    input: {
      name: 'available',
      reason: args.reason === 'restock' ? 'restock' : 'correction',
      changes: [
        {
          inventoryItemId: args.inventoryItemId,
          locationId: level.location.id,
          delta: args.delta,
          changeFromQuantity: current,
        },
      ],
    },
  })
  const errs = data.inventoryAdjustQuantities.userErrors
  if (errs.some(e => e.code === 'CHANGE_FROM_QUANTITY_STALE')) {
    throw new ShopifyApiError('Stock changed in Shopify while you were editing. Refresh and try again.')
  }
  assertNoUserErrors(errs, 'Shopify rejected the stock change')

  const fresh = await api.graphql<{ productVariant: { inventoryQuantity: number | null } | null }>(VARIANT_QUANTITY_QUERY, {
    id: args.variantExternalId,
  })
  const qty = fresh.productVariant?.inventoryQuantity ?? null
  if (qty === null) throw new ShopifyApiError('Stock was updated in Shopify, but the new quantity could not be read back.')

  const { error } = await createAdminClient().rpc('shopify_set_variant_stock', {
    p_workspace: args.workspaceId,
    p_variant_external_id: args.variantExternalId,
    p_quantity: qty,
    p_reason: args.reason,
    p_note: args.note ? `${args.note} (pushed to Shopify)` : 'Pushed to Shopify',
    p_user: args.userId,
  })
  if (error) throw new Error(`Shopify was updated but StoreOS could not record it: ${error.message}`)
  return qty
}

export interface RefundResult {
  refundId: string
  amount: number
  currency: string
}

/**
 * Refund money on a Shopify order (refundCreate against its captured payment).
 * `idempotencyKey` should be stable for the business action (e.g. the approval
 * id) so a retried request can never refund twice. Re-syncs the order after.
 */
export async function createShopifyRefund(args: {
  workspaceId: string
  orderExternalId: string
  amount: number
  note: string
  idempotencyKey: string
}): Promise<RefundResult> {
  if (!(args.amount > 0)) throw new ShopifyApiError('Refund amount must be greater than zero.')
  const api = await shopifyAdminFor(args.workspaceId)

  type Tx = {
    id: string
    kind: string
    status: string
    gateway: string
    amountSet: { shopMoney: { amount: string; currencyCode: string } }
    parentTransaction: { id: string } | null
  }
  const info = await api.graphql<{
    order: {
      id: string
      currencyCode: string
      totalReceivedSet: { shopMoney: { amount: string } }
      totalRefundedSet: { shopMoney: { amount: string } }
      transactions: Tx[]
    } | null
  }>(ORDER_REFUND_INFO_QUERY, { id: args.orderExternalId })
  const order = info.order
  if (!order) throw new ShopifyApiError('This order no longer exists in Shopify.')

  const ok = (t: Tx) => t.status === 'SUCCESS'
  const captures = order.transactions.filter(t => ok(t) && (t.kind === 'SALE' || t.kind === 'CAPTURE'))
  if (captures.length === 0) throw new ShopifyApiError('There is no captured payment on this Shopify order to refund.')
  const refundedFrom = (id: string) =>
    order.transactions
      .filter(t => ok(t) && t.kind === 'REFUND' && t.parentTransaction?.id === id)
      .reduce((s, t) => s + Number(t.amountSet.shopMoney.amount), 0)
  const parent = captures
    .map(t => ({ t, left: Number(t.amountSet.shopMoney.amount) - refundedFrom(t.id) }))
    .sort((a, b) => b.left - a.left)[0]

  const refundable = Math.min(
    parent.left,
    Number(order.totalReceivedSet.shopMoney.amount) - Number(order.totalRefundedSet.shopMoney.amount),
  )
  const amount = Math.round(Math.min(args.amount, refundable) * 100) / 100
  if (!(amount > 0)) throw new ShopifyApiError('Nothing left to refund on this Shopify order.')

  const data = await api.graphql<{
    refundCreate: {
      refund: { id: string; totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } } } | null
      userErrors: UserError[]
    }
  }>(REFUND_CREATE_MUTATION, {
    idempotencyKey: args.idempotencyKey,
    input: {
      orderId: order.id,
      note: args.note.slice(0, 250),
      notify: false,
      transactions: [
        {
          orderId: order.id,
          parentId: parent.t.id,
          gateway: parent.t.gateway,
          kind: 'REFUND',
          amount: amount.toFixed(2),
        },
      ],
    },
  })
  assertNoUserErrors(data.refundCreate.userErrors, 'Shopify refused the refund')
  const refund = data.refundCreate.refund
  if (!refund) throw new ShopifyApiError('Shopify did not return the refund.')

  // Pull Shopify's authoritative totals/status back into StoreOS.
  try {
    await syncOrderById(api, args.workspaceId, order.id)
  } catch {
    // The order webhook / next sync will catch up.
  }
  return {
    refundId: refund.id,
    amount: Number(refund.totalRefundedSet.shopMoney.amount) || amount,
    currency: refund.totalRefundedSet.shopMoney.currencyCode || order.currencyCode,
  }
}
