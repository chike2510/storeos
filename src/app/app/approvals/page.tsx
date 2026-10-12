import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { ApprovalStatusBadge, Badge, RiskBadge, humanize } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import { Avatar, EmptyState, PageHeader } from '@/components/ui/misc'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { cn, formatDateTime, formatMoney, timeAgo } from '@/lib/utils'
import type { AIDecision, Approval, Conversation, Message } from '@/lib/types'
import { decideApproval } from './actions'
import { ApprovalDecisionForm } from './approval-card'

export const metadata: Metadata = { title: 'Approvals' }

type Row = Approval & {
  decision: AIDecision | null
  conversation: (Conversation & { customer: { id: string; name: string } | null }) | null
}

export default async function ApprovalsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const { supabase, workspace, role } = await requireWorkspace()
  const tab = searchParams.tab === 'decided' ? 'decided' : 'pending'

  let query = supabase
    .from('approvals')
    .select('*, decision:ai_decisions(*), conversation:conversations(*, customer:customers(id, name))')
    .eq('workspace_id', workspace.id)
    .limit(50)
  query = tab === 'pending' ? query.eq('status', 'pending').order('created_at', { ascending: true }) : query.neq('status', 'pending').order('decided_at', { ascending: false })
  const { data } = await query
  const rows = (data ?? []) as Row[]

  const messageIds = rows.map(r => r.decision?.message_id).filter((x): x is string => Boolean(x))
  const { data: msgRows } = messageIds.length ? await supabase.from('messages').select('*').in('id', messageIds) : { data: [] }
  const messages = new Map(((msgRows ?? []) as Message[]).map(m => [m.id, m]))

  const deciderIds = Array.from(new Set(rows.map(r => r.decided_by).filter((x): x is string => Boolean(x))))
  const names = new Map<string, string>()
  if (deciderIds.length) {
    const { data: dir } = await supabase.rpc('workspace_member_directory', { p_workspace: workspace.id })
    for (const m of (dir ?? []) as { user_id: string; full_name: string | null; email: string | null }[]) {
      names.set(m.user_id, m.full_name || m.email || 'Team member')
    }
  }
  const allowed = canManage(role)

  return (
    <>
      <PageHeader title="Approvals" description="High-risk AI decisions wait here for a human. Every decision is logged with its rationale." />
      <div className="mb-4 flex gap-1">
        {(['pending', 'decided'] as const).map(t => (
          <Link
            key={t}
            href={`/app/approvals?tab=${t}`}
            className={cn(
              'rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
              tab === t ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100',
            )}
          >
            {t === 'pending' ? 'Pending' : 'Decided'}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck />}
            title={tab === 'pending' ? 'All clear' : 'No decisions yet'}
            description={tab === 'pending' ? 'Nothing needs your sign-off right now.' : 'Approved and rejected items will appear here.'}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map(r => {
            const d = r.decision
            const msg = d?.message_id ? messages.get(d.message_id) : undefined
            const customer = r.conversation?.customer
            return (
              <Card key={r.id}>
                <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar name={customer?.name ?? 'Customer'} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">
                        {customer ? (
                          <Link href={`/app/customers/${customer.id}`} className="hover:underline">
                            {customer.name}
                          </Link>
                        ) : (
                          'Unknown customer'
                        )}
                        {r.conversation ? (
                          <Link href={`/app/inbox/${r.conversation.id}`} className="ml-2 font-normal text-zinc-500 hover:underline">
                            {r.conversation.subject}
                          </Link>
                        ) : null}
                      </p>
                      <p className="text-xs text-zinc-500">Flagged {timeAgo(r.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tab === 'decided' ? <ApprovalStatusBadge status={r.status} /> : null}
                    {d ? <RiskBadge level={d.risk_level} /> : null}
                    {d?.action ? <Badge tone="blue">{humanize(d.action)}</Badge> : null}
                    {d?.refund_amount !== null && d?.refund_amount !== undefined ? (
                      <Badge tone="violet">Refund {formatMoney(d.refund_amount, workspace.currency)}</Badge>
                    ) : null}
                  </div>
                </div>
                <CardBody className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4 text-sm">
                    {msg ? (
                      <div>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Customer wrote</p>
                        <p className="whitespace-pre-line rounded-lg bg-zinc-50 p-3 leading-relaxed text-zinc-700">{msg.body}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Why it needs review</p>
                      <p className="text-amber-800">{r.reason || '—'}</p>
                    </div>
                    {d?.reasoning ? (
                      <div>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">AI reasoning</p>
                        <p className="leading-relaxed text-zinc-600">{d.reasoning}</p>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    {r.status === 'pending' ? (
                      <ApprovalDecisionForm action={decideApproval} approvalId={r.id} draft={d?.draft_reply ?? ''} canDecide={allowed} />
                    ) : (
                      <div className="space-y-4 text-sm">
                        {r.final_reply ? (
                          <div>
                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Reply sent</p>
                            <p className="whitespace-pre-line rounded-lg bg-zinc-900 p-3 leading-relaxed text-white">{r.final_reply}</p>
                          </div>
                        ) : null}
                        <div>
                          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Rationale</p>
                          <p className="text-zinc-700">{r.rationale}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {humanize(r.status)} by {r.decided_by ? names.get(r.decided_by) ?? 'a team member' : 'a team member'} ·{' '}
                            {formatDateTime(r.decided_at)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
