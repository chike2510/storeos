'use server'

import { revalidatePath } from 'next/cache'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { formatMoney, str } from '@/lib/utils'
import type { ActionState } from '@/lib/types'
import { createShopifyRefund, type RefundResult } from '@/lib/shopify/writeback'

type ApprovalContext = {
  status: string
  conversation_id: string | null
  decision: { action: string | null; refund_amount: number | null } | null
  order: { id: string; source: string; external_id: string | null } | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null
}

export async function decideApproval(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd.get('approval_id'))
  const decision = str(fd.get('decision'))
  const rationale = str(fd.get('rationale'))
  const finalReply = str(fd.get('final_reply'))

  if (decision !== 'approved' && decision !== 'rejected') return { error: 'Choose approve or reject' }
  if (!rationale) return { error: 'Add a short rationale — it is kept in the audit log.' }

  const { supabase, workspace, role, user } = await requireWorkspace()
  if (!canManage(role)) return { error: 'Only owners and admins can decide approvals.' }

  // Load the approval's refund + linked order up front (needed before deciding
  // when money has to move in Shopify).
  const { data: row } = await supabase
    .from('approvals')
    .select('status, conversation_id, decision:ai_decisions(action, refund_amount), conversation:conversations(order:orders(id, source, external_id))')
    .eq('id', id)
    .eq('workspace_id', workspace.id)
    .maybeSingle()
  const conv = one(row?.conversation as unknown as { order: unknown } | { order: unknown }[] | null)
  const ctx: ApprovalContext | null = row
    ? {
        status: row.status as string,
        conversation_id: row.conversation_id as string | null,
        decision: one(row.decision as unknown as ApprovalContext['decision'] | ApprovalContext['decision'][]),
        order: one(conv?.order as ApprovalContext['order'] | ApprovalContext['order'][] | null),
      }
    : null

  const isRefund = Boolean(ctx?.decision?.action === 'refund' && ctx.decision.refund_amount && ctx.order)
  const shopifyRefund = decision === 'approved' && isRefund && ctx?.order?.source === 'shopify'

  // Shopify orders: issue the real refund first. If Shopify refuses, the
  // approval stays pending so the admin can retry or reject. The idempotency
  // key is the approval id, so a retried approval can never refund twice.
  let refund: RefundResult | null = null
  if (shopifyRefund && ctx?.order) {
    if (ctx.status !== 'pending') return { error: `This approval was already ${ctx.status}.` }
    if (!ctx.order.external_id) return { error: 'The linked Shopify order is missing its Shopify id. Run a Shopify sync first.' }
    try {
      refund = await createShopifyRefund({
        workspaceId: workspace.id,
        orderExternalId: ctx.order.external_id,
        amount: Number(ctx.decision?.refund_amount),
        note: `Approved in StoreOS: ${rationale}`,
        idempotencyKey: id,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Shopify refund failed'
      await supabase.from('audit_events').insert({
        workspace_id: workspace.id,
        actor_type: 'user',
        actor_id: user.id,
        action: 'shopify.refund_failed',
        entity_type: 'order',
        entity_id: ctx.order.id,
        metadata: { approval_id: id, amount: ctx.decision?.refund_amount, error: msg, via: 'approval' },
      })
      return { error: `Shopify did not process the refund, so the approval is still pending: ${msg}` }
    }
    await supabase.from('audit_events').insert({
      workspace_id: workspace.id,
      actor_type: 'user',
      actor_id: user.id,
      action: 'shopify.refund_created',
      entity_type: 'order',
      entity_id: ctx.order.id,
      metadata: { approval_id: id, refund_id: refund.refundId, amount: refund.amount, currency: refund.currency, rationale, via: 'approval' },
    })
  }

  const { error } = await supabase.rpc('decide_approval', {
    p_approval: id,
    p_decision: decision,
    p_rationale: rationale,
    p_final_reply: finalReply || null,
  })
  if (error) {
    return {
      error: refund
        ? `The Shopify refund (${formatMoney(refund.amount, refund.currency)}) went through, but the approval could not be recorded: ${error.message}`
        : error.message,
    }
  }

  let note = ''
  if (refund) {
    note = ` Refunded ${formatMoney(refund.amount, refund.currency)} through Shopify.`
  } else if (decision === 'approved' && isRefund && ctx?.order && ctx.decision?.refund_amount) {
    // StoreOS-native orders: an approved refund is recorded on the linked order (unchanged behaviour).
    const { error: refundErr } = await supabase.rpc('set_order_status', {
      p_order: ctx.order.id,
      p_status: 'refunded',
      p_restock: false,
      p_refund_amount: ctx.decision.refund_amount,
      p_note: `Approved refund: ${rationale}`,
    })
    note = refundErr ? ` The order could not be marked refunded (${refundErr.message}).` : ' The order was marked refunded.'
  }

  revalidatePath('/app/approvals')
  revalidatePath('/app/inbox')
  revalidatePath('/app/orders')
  revalidatePath('/app')
  return { ok: true, message: (decision === 'approved' ? 'Approved — reply posted to the conversation.' : 'Rejected.') + note }
}
