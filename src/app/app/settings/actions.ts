'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { CURRENCIES, num, str } from '@/lib/utils'
import type { ActionState, MemberRole } from '@/lib/types'

async function requireAdmin() {
  const ctx = await requireWorkspace()
  if (!canManage(ctx.role)) throw new Error('Only owners and admins can change settings.')
  return ctx
}

function fail(e: unknown): ActionState {
  return { error: e instanceof Error ? e.message : 'Something went wrong' }
}

async function audit(action: string, metadata: Record<string, unknown> = {}) {
  const { supabase, workspace, user } = await requireWorkspace()
  await supabase.from('audit_events').insert({
    workspace_id: workspace.id,
    actor_type: 'user',
    actor_id: user.id,
    action,
    entity_type: 'workspace',
    entity_id: workspace.id,
    metadata,
  })
}

export async function updateWorkspace(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase, workspace } = await requireAdmin()
    const parsed = z
      .object({
        name: z.string().min(1, 'Name is required').max(80),
        currency: z.enum(CURRENCIES.map(c => c.code) as [string, ...string[]]),
        business_type: z.enum(['standalone', 'shopify']),
        timezone: z.string().min(1).max(64),
      })
      .safeParse({
        name: str(fd.get('name')),
        currency: str(fd.get('currency')),
        business_type: str(fd.get('business_type')),
        timezone: str(fd.get('timezone')),
      })
    if (!parsed.success) return { error: parsed.error.issues[0].message }
    try {
      new Intl.DateTimeFormat('en', { timeZone: parsed.data.timezone })
    } catch {
      return { error: 'Unknown time zone' }
    }
    const { error } = await supabase.from('workspaces').update(parsed.data).eq('id', workspace.id)
    if (error) return { error: error.message }
    await audit('workspace.updated', parsed.data)
    revalidatePath('/app', 'layout')
    return { ok: true, message: 'Workspace saved.' }
  } catch (e) {
    return fail(e)
  }
}

export async function updatePolicies(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase, workspace } = await requireAdmin()
    const auto = num(fd.get('auto_refund_limit'))
    const high = num(fd.get('high_risk_refund_above'))
    const threshold = num(fd.get('default_low_stock_threshold'))
    if (auto === null || auto < 0) return { error: 'Auto-refund limit must be zero or more' }
    if (high === null || high < 0) return { error: 'High-risk threshold must be zero or more' }
    if (high < auto) return { error: 'The high-risk threshold should be at least the auto-refund limit' }
    const values = {
      auto_refund_limit: auto,
      high_risk_refund_above: high,
      auto_send_low_risk: fd.get('auto_send_low_risk') === 'on',
      escalate_high_urgency: fd.get('escalate_high_urgency') === 'on',
      escalate_negative_sentiment: fd.get('escalate_negative_sentiment') === 'on',
      escalate_complaints: fd.get('escalate_complaints') === 'on',
      default_low_stock_threshold: Math.max(0, Math.floor(threshold ?? 5)),
      reply_guidelines: str(fd.get('reply_guidelines')).slice(0, 2000),
    }
    const { error } = await supabase.from('policies').update(values).eq('workspace_id', workspace.id)
    if (error) return { error: error.message }
    await audit('policies.updated', values)
    revalidatePath('/app/settings')
    return { ok: true, message: 'Policies saved. New AI decisions use them immediately.' }
  } catch (e) {
    return fail(e)
  }
}

export async function inviteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase, workspace, user, role: myRole } = await requireAdmin()
    const email = str(fd.get('email')).toLowerCase()
    const role = str(fd.get('role')) as MemberRole
    if (!z.string().email().safeParse(email).success) return { error: 'Enter a valid email' }
    if (!['admin', 'staff'].includes(role)) return { error: 'Choose a role' }
    if (role === 'admin' && myRole !== 'owner') return { error: 'Only owners can invite admins' }
    if (email === user.email?.toLowerCase()) return { error: "That's you!" }

    const { error } = await supabase
      .from('workspace_invitations')
      .upsert({ workspace_id: workspace.id, email, role, invited_by: user.id, accepted_at: null }, { onConflict: 'workspace_id,email' })
    if (error) return { error: error.message }
    await audit('member.invited', { email, role })
    revalidatePath('/app/settings')
    return { ok: true, message: `Invitation saved. Ask ${email} to sign up or sign in with that email — they'll join automatically.` }
  } catch (e) {
    return fail(e)
  }
}

export async function revokeInvitation(fd: FormData) {
  const { supabase, workspace } = await requireAdmin()
  await supabase.from('workspace_invitations').delete().eq('id', str(fd.get('id'))).eq('workspace_id', workspace.id)
  await audit('member.invite_revoked')
  revalidatePath('/app/settings')
}

export async function updateMemberRole(fd: FormData) {
  const { supabase, workspace, role: myRole, user } = await requireAdmin()
  const userId = str(fd.get('user_id'))
  const role = str(fd.get('role')) as MemberRole
  if (!['owner', 'admin', 'staff'].includes(role) || userId === user.id) return
  if ((role === 'owner' || role === 'admin') && myRole !== 'owner') return
  await supabase.from('workspace_members').update({ role }).eq('workspace_id', workspace.id).eq('user_id', userId)
  await audit('member.role_changed', { user_id: userId, role })
  revalidatePath('/app/settings')
}

export async function removeMember(fd: FormData) {
  const { supabase, workspace, user } = await requireAdmin()
  const userId = str(fd.get('user_id'))
  if (userId === user.id) return
  await supabase.from('workspace_members').delete().eq('workspace_id', workspace.id).eq('user_id', userId)
  await audit('member.removed', { user_id: userId })
  revalidatePath('/app/settings')
}

export async function loadDemoData(_: ActionState): Promise<ActionState> {
  try {
    const { supabase, workspace } = await requireAdmin()
    const { data, error } = await supabase.rpc('seed_demo_workspace', { p_workspace: workspace.id })
    if (error) return { error: error.message }
    revalidatePath('/app', 'layout')
    const r = data as { products: number; customers: number; orders: number } | null
    return { ok: true, message: r ? `Loaded ${r.products} products, ${r.customers} customers and ${r.orders} orders.` : 'Demo data loaded.' }
  } catch (e) {
    return fail(e)
  }
}

export async function clearDemoData(_: ActionState): Promise<ActionState> {
  try {
    const { supabase, workspace } = await requireAdmin()
    const { error } = await supabase.rpc('clear_demo_workspace', { p_workspace: workspace.id })
    if (error) return { error: error.message }
    revalidatePath('/app', 'layout')
    return { ok: true, message: 'Demo data removed.' }
  } catch (e) {
    return fail(e)
  }
}
