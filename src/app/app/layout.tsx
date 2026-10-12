import type { Metadata } from 'next'
import { AppShell } from '@/components/app/sidebar'
import { requireWorkspace } from '@/lib/workspace'
import { switchWorkspace } from './actions'

export const metadata: Metadata = { title: { default: 'Overview', template: '%s · StoreOS' } }
export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace()
  const [approvals, inbox] = await Promise.all([
    ctx.supabase
      .from('approvals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.workspace.id)
      .eq('status', 'pending'),
    ctx.supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.workspace.id)
      .eq('status', 'open'),
  ])

  return (
    <AppShell
      workspace={{ id: ctx.workspace.id, name: ctx.workspace.name, currency: ctx.workspace.currency }}
      workspaces={ctx.workspaces}
      user={ctx.user}
      role={ctx.role}
      badges={{ approvals: approvals.count ?? 0, inbox: inbox.count ?? 0 }}
      switchWorkspace={switchWorkspace}
    >
      {children}
    </AppShell>
  )
}
