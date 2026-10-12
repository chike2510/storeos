'use server'

import { revalidatePath } from 'next/cache'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { str } from '@/lib/utils'
import type { ActionState } from '@/lib/types'

export async function decideApproval(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd.get('approval_id'))
  const decision = str(fd.get('decision'))
  const rationale = str(fd.get('rationale'))
  const finalReply = str(fd.get('final_reply'))

  if (decision !== 'approved' && decision !== 'rejected') return { error: 'Choose approve or reject' }
  if (!rationale) return { error: 'Add a short rationale — it is kept in the audit log.' }

  const { supabase, workspace, role } = await requireWorkspace()
  if (!canManage(role)) return { error: 'Only owners and admins can decide approvals.' }

  const { error } = await supabase.rpc('decide_approval', {
    p_approval: id,
    p_decision: decision,
    p_rationale: rationale,
    p_final_reply: finalReply || null,
  })
  if (error) return { error: error.message }

  let note = ''
  if (decision === 'approved') {
    // An approved refund is recorded on the linked order.
    const { data: approval } = await supabase
      .from('approvals')
      .select('conversation_id, decision:ai_decisions(action, refund_amount), conversation:conversations(order_id)')
      .eq('id', id)
      .eq('workspace_id', workspace.id)
      .single()
    const dec = (Array.isArray(approval?.decision) ? approval?.decision[0] : approval?.decision) as
      | { action: string | null; refund_amount: number | null }
      | undefined
    const conv = (Array.isArray(approval?.conversation) ? approval?.conversation[0] : approval?.conversation) as
      | { order_id: string | null }
      | undefined
    if (dec?.action === 'refund' && dec.refund_amount && conv?.order_id) {
      const { error: refundErr } = await supabase.rpc('set_order_status', {
        p_order: conv.order_id,
        p_status: 'refunded',
        p_restock: false,
        p_refund_amount: dec.refund_amount,
        p_note: `Approved refund: ${rationale}`,
      })
      note = refundErr ? ` The order could not be marked refunded (${refundErr.message}).` : ' The order was marked refunded.'
    }
  }

  revalidatePath('/app/approvals')
  revalidatePath('/app/inbox')
  revalidatePath('/app')
  return { ok: true, message: (decision === 'approved' ? 'Approved — reply posted to the conversation.' : 'Rejected.') + note }
}
