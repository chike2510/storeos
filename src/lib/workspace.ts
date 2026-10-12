import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { MemberRole, Workspace } from '@/lib/types'

export const WORKSPACE_COOKIE = 'storeos_ws'

export interface WorkspaceContext {
  supabase: ReturnType<typeof createClient>
  user: { id: string; email: string | null; name: string | null }
  workspace: Workspace
  role: MemberRole
  workspaces: { id: string; name: string; role: MemberRole }[]
}

/** Signed-in user or redirect to /login. */
export const requireUser = cache(async () => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
})

/**
 * Resolve the active workspace for this request (cookie → first membership).
 * Redirects to onboarding when the user has no workspace yet.
 */
export const requireWorkspace = cache(async (): Promise<WorkspaceContext> => {
  const { supabase, user } = await requireUser()

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('role, workspace:workspaces(id, name, currency, business_type, timezone, created_at)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  type Row = { role: MemberRole; workspace: Workspace | Workspace[] | null }
  const rows = ((memberships ?? []) as Row[])
    .map(r => ({ role: r.role, workspace: Array.isArray(r.workspace) ? r.workspace[0] : r.workspace }))
    .filter((r): r is { role: MemberRole; workspace: Workspace } => Boolean(r.workspace))

  if (rows.length === 0) redirect('/onboarding')

  const preferred = cookies().get(WORKSPACE_COOKIE)?.value
  const active = rows.find(r => r.workspace.id === preferred) ?? rows[0]

  return {
    supabase,
    user: {
      id: user.id,
      email: user.email ?? null,
      name: (user.user_metadata?.full_name as string | undefined) ?? null,
    },
    workspace: active.workspace,
    role: active.role,
    workspaces: rows.map(r => ({ id: r.workspace.id, name: r.workspace.name, role: r.role })),
  }
})

export function canManage(role: MemberRole) {
  return role === 'owner' || role === 'admin'
}
