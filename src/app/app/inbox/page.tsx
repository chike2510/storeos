import type { Metadata } from 'next'
import Link from 'next/link'
import { Inbox, Plus } from 'lucide-react'
import { ConversationStatusBadge, RiskBadge, humanize } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar, EmptyState, PageHeader } from '@/components/ui/misc'
import { requireWorkspace } from '@/lib/workspace'
import { cn, timeAgo } from '@/lib/utils'
import type { Conversation, Message } from '@/lib/types'

export const metadata: Metadata = { title: 'Inbox' }

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'awaiting_approval', label: 'Needs approval' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
] as const

export default async function InboxPage({ searchParams }: { searchParams: { status?: string } }) {
  const { supabase, workspace } = await requireWorkspace()
  const status = TABS.some(t => t.key === searchParams.status) ? searchParams.status! : 'open'

  let query = supabase
    .from('conversations')
    .select('*, customer:customers(id, name)')
    .eq('workspace_id', workspace.id)
    .order('last_message_at', { ascending: false })
    .limit(100)
  if (status !== 'all') query = query.eq('status', status)
  const { data } = await query
  const conversations = (data ?? []) as (Conversation & { customer: { id: string; name: string } | null })[]

  const latest = new Map<string, Message>()
  if (conversations.length) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', conversations.map(c => c.id))
      .neq('direction', 'internal')
      .order('created_at', { ascending: false })
      .limit(400)
    for (const m of (msgs ?? []) as Message[]) if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, m)
  }

  return (
    <>
      <PageHeader
        title="Support inbox"
        description="Customer conversations, triaged by AI. Anything risky waits for you in Approvals."
        actions={
          <ButtonLink href="/app/inbox/new">
            <Plus className="h-4 w-4" /> Log message
          </ButtonLink>
        }
      />
      <Card>
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-100 p-3">
          {TABS.map(t => (
            <Link
              key={t.key}
              href={`/app/inbox?status=${t.key}`}
              className={cn(
                'whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
                status === t.key ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100',
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {conversations.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={status === 'open' ? 'Inbox zero' : 'Nothing here'}
            description="Paste a customer message from WhatsApp, Instagram or email and StoreOS will draft a reply with full order context."
            action={
              <ButtonLink href="/app/inbox/new" variant="secondary">
                <Plus className="h-4 w-4" /> Log a message
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {conversations.map(c => {
              const m = latest.get(c.id)
              return (
                <li key={c.id}>
                  <Link href={`/app/inbox/${c.id}`} className="flex gap-3 px-4 py-3.5 hover:bg-zinc-50/70 sm:px-5">
                    <Avatar name={c.customer?.name ?? 'Unknown'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {c.customer?.name ?? 'Unknown customer'}
                          <span className="ml-2 font-normal text-zinc-500">{c.subject}</span>
                        </p>
                        <span className="shrink-0 text-xs text-zinc-400">{timeAgo(c.last_message_at)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-zinc-500">
                        {m ? `${m.direction === 'outbound' ? (m.author_type === 'ai' ? 'AI: ' : 'You: ') : ''}${m.body}` : 'No messages'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <ConversationStatusBadge status={c.status} />
                        <span className="text-xs text-zinc-400">{humanize(c.channel)}</span>
                        {c.intent ? <span className="text-xs text-zinc-400">· {humanize(c.intent)}</span> : null}
                        {c.urgency === 'high' ? <RiskBadge level="high" prefix="Urgency" /> : null}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
