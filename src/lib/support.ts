import 'server-only'
import { classifyMessage, resolveMessage } from '@/lib/ai/engine'
import { enforcePolicy } from '@/lib/ai/policy'
import type { TriageContext } from '@/lib/ai/schema'
import type { Conversation, Customer, Message, Order, Policies } from '@/lib/types'
import type { WorkspaceContext } from '@/lib/workspace'

type OrderWithItems = Order & { order_items: { title: string; quantity: number }[] }

export interface TriageOutcome {
  decisionId: string
  autoSent: boolean
  approvalId: string | null
  notes: string[]
  mode: 'live' | 'demo'
}

/**
 * Support triage pipeline: classify → gather customer/order context → draft a
 * reply → enforce workspace policy server-side → auto-send (low risk) or queue
 * for approval (everything else). Every step is recorded.
 */
export async function triageConversation(ctx: WorkspaceContext, conversationId: string): Promise<TriageOutcome> {
  const { supabase, workspace } = ctx

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('workspace_id', workspace.id)
    .single<Conversation>()
  if (convErr || !conv) throw new Error('Conversation not found')

  const [{ data: msgs }, { data: policies }] = await Promise.all([
    supabase.from('messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true }).limit(50),
    supabase.from('policies').select('*').eq('workspace_id', workspace.id).single<Policies>(),
  ])
  const messages = (msgs ?? []) as Message[]
  const latest = [...messages].reverse().find(m => m.direction === 'inbound')
  if (!latest) throw new Error('There is no customer message to triage yet')
  if (!policies) throw new Error('Workspace policies are missing')

  let customer: Customer | null = null
  let stats = { orders_count: 0, total_spent: 0 }
  let orders: OrderWithItems[] = []
  if (conv.customer_id) {
    const [c, s, o] = await Promise.all([
      supabase.from('customers').select('*').eq('id', conv.customer_id).single<Customer>(),
      supabase.from('customer_stats').select('orders_count,total_spent').eq('customer_id', conv.customer_id).maybeSingle(),
      supabase
        .from('orders')
        .select('*, order_items(title, quantity)')
        .eq('customer_id', conv.customer_id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])
    customer = c.data ?? null
    if (s.data) stats = { orders_count: Number(s.data.orders_count), total_spent: Number(s.data.total_spent) }
    orders = (o.data ?? []) as OrderWithItems[]
  }

  const { data: catalogRows } = await supabase
    .from('products')
    .select('title, price, stock_quantity, track_inventory')
    .eq('workspace_id', workspace.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(25)

  let linkedOrder: OrderWithItems | null = conv.order_id ? orders.find(o => o.id === conv.order_id) ?? null : null
  if (conv.order_id && !linkedOrder) {
    const { data } = await supabase.from('orders').select('*, order_items(title, quantity)').eq('id', conv.order_id).maybeSingle()
    linkedOrder = (data as OrderWithItems | null) ?? null
  }

  const triageCtx: TriageContext = {
    workspaceName: workspace.name,
    currency: workspace.currency,
    message: latest.body,
    history: messages
      .filter(m => m.direction !== 'internal' && m.id !== latest.id)
      .map(m => ({ from: m.direction === 'inbound' ? 'customer' : 'store', body: m.body.slice(0, 1000) })),
    customer: customer
      ? { name: customer.name, sentiment: customer.sentiment, ordersCount: stats.orders_count, totalSpent: stats.total_spent }
      : null,
    orders: orders.map(o => ({
      number: o.order_number,
      status: o.status,
      total: Number(o.total),
      createdAt: o.created_at,
      items: (o.order_items ?? []).map(i => `${i.quantity}× ${i.title}`),
    })),
    linkedOrderNumber: linkedOrder?.order_number ?? null,
    catalog: (catalogRows ?? []).map(p => ({
      title: p.title as string,
      price: Number(p.price),
      inStock: !p.track_inventory || Number(p.stock_quantity) > 0,
    })),
    guidelines: policies.reply_guidelines ?? '',
    policy: { autoRefundLimit: Number(policies.auto_refund_limit), highRiskRefundAbove: Number(policies.high_risk_refund_above) },
  }

  const classified = await classifyMessage(triageCtx)

  // The customer referenced an order number: link it if it's theirs (or the thread has no customer yet).
  const mentioned = classified.result.entities.orderNumber
  if (!linkedOrder && mentioned) {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(title, quantity)')
      .eq('workspace_id', workspace.id)
      .eq('order_number', mentioned)
      .maybeSingle()
    const found = data as OrderWithItems | null
    if (found && (!conv.customer_id || found.customer_id === conv.customer_id)) {
      linkedOrder = found
      triageCtx.linkedOrderNumber = found.order_number
      if (!triageCtx.orders.some(o => o.number === found.order_number)) {
        triageCtx.orders.unshift({
          number: found.order_number,
          status: found.status,
          total: Number(found.total),
          createdAt: found.created_at,
          items: (found.order_items ?? []).map(i => `${i.quantity}× ${i.title}`),
        })
      }
    }
  }

  const linkedTotal = linkedOrder ? Number(linkedOrder.total) - Number(linkedOrder.refunded_amount) : null
  const resolved = await resolveMessage(classified.result, triageCtx, linkedTotal)
  const { resolution, notes } = enforcePolicy(resolved.result, classified.result, triageCtx, policies, linkedTotal)
  const autoSend = !resolution.requiresApproval

  const { data: decision, error: decErr } = await supabase
    .from('ai_decisions')
    .insert({
      workspace_id: workspace.id,
      conversation_id: conv.id,
      message_id: latest.id,
      intent: classified.result.intent,
      urgency: classified.result.urgency,
      confidence: classified.result.confidence,
      entities: { ...classified.result.entities, sentiment: classified.result.sentiment },
      action: resolution.action,
      risk_level: resolution.riskLevel,
      requires_approval: resolution.requiresApproval,
      refund_amount: resolution.refundAmount,
      draft_reply: resolution.draftReply,
      reasoning: resolution.reasoning,
      policy_notes: notes,
      model: resolved.model,
      mode: resolved.mode,
      status: autoSend ? 'auto_sent' : 'pending_approval',
    })
    .select('id')
    .single<{ id: string }>()
  if (decErr || !decision) throw new Error(decErr?.message ?? 'Could not save the AI decision')

  let approvalId: string | null = null
  if (autoSend) {
    await supabase.from('messages').insert({
      workspace_id: workspace.id,
      conversation_id: conv.id,
      direction: 'outbound',
      author_type: 'ai',
      body: resolution.draftReply,
      ai_decision_id: decision.id,
    })
    if (resolution.action === 'refund' && resolution.refundAmount && linkedOrder) {
      // Records the refund on the order (restocking is a human call). Payment movement is not wired in v1.
      await supabase.rpc('set_order_status', {
        p_order: linkedOrder.id,
        p_status: 'refunded',
        p_restock: false,
        p_refund_amount: resolution.refundAmount,
        p_note: 'Auto-approved by AI within policy',
      })
    }
  } else {
    const { data: approval } = await supabase
      .from('approvals')
      .insert({
        workspace_id: workspace.id,
        decision_id: decision.id,
        conversation_id: conv.id,
        reason: notes.join('; ') || 'Flagged for review',
      })
      .select('id')
      .single<{ id: string }>()
    approvalId = approval?.id ?? null
  }

  await supabase
    .from('conversations')
    .update({
      intent: classified.result.intent,
      urgency: classified.result.urgency,
      status: autoSend ? 'resolved' : 'awaiting_approval',
      order_id: linkedOrder?.id ?? conv.order_id,
    })
    .eq('id', conv.id)

  await supabase.from('audit_events').insert({
    workspace_id: workspace.id,
    actor_type: 'ai',
    action: autoSend ? 'ai.reply_auto_sent' : 'ai.approval_requested',
    entity_type: 'conversation',
    entity_id: conv.id,
    metadata: {
      decision_id: decision.id,
      intent: classified.result.intent,
      risk: resolution.riskLevel,
      action: resolution.action,
      refund_amount: resolution.refundAmount,
      policy_notes: notes,
      model: resolved.model,
    },
  })

  return { decisionId: decision.id, autoSent: autoSend, approvalId, notes, mode: resolved.mode }
}
