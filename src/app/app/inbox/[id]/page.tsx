import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Bot, Sparkles } from 'lucide-react'
import { Badge, ConversationStatusBadge, OrderStatusBadge, RiskBadge, humanize } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Alert, Avatar, PageHeader } from '@/components/ui/misc'
import { requireWorkspace } from '@/lib/workspace'
import { aiConfig } from '@/lib/ai/config'
import { cn, formatDateTime, formatMoney, orderLabel, timeAgo } from '@/lib/utils'
import type { AIDecision, Conversation, Customer, Message, Order } from '@/lib/types'
import { addMessage, setConversationStatus, triage } from '../actions'
import { Composer } from './composer'

export const metadata: Metadata = { title: 'Conversation' }

export default async function ConversationPage({ params, searchParams }: { params: { id: string }; searchParams: { triage_error?: string } }) {
  const { supabase, workspace } = await requireWorkspace()
  const { data } = await supabase.from('conversations').select('*').eq('id', params.id).eq('workspace_id', workspace.id).maybeSingle()
  if (!data) notFound()
  const conv = data as Conversation

  const [{ data: msgRows }, { data: decRows }, { data: customerRow }, { data: orderRows }, { data: approvalRow }] = await Promise.all([
    supabase.from('messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true }),
    supabase.from('ai_decisions').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(5),
    conv.customer_id ? supabase.from('customers').select('*').eq('id', conv.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    conv.customer_id
      ? supabase.from('orders').select('*').eq('customer_id', conv.customer_id).order('created_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
    supabase.from('approvals').select('id, status').eq('conversation_id', conv.id).eq('status', 'pending').maybeSingle(),
  ])
  const messages = (msgRows ?? []) as Message[]
  const decisions = (decRows ?? []) as AIDecision[]
  const decision = decisions[0]
  const customer = customerRow as Customer | null
  const orders = (orderRows ?? []) as Order[]
  const ai = aiConfig()
  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
  const triagedLatest = decision && lastInbound && decision.message_id === lastInbound.id

  return (
    <>
      <PageHeader
        back={
          <Link href="/app/inbox" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Link>
        }
        title={conv.subject || 'Conversation'}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ConversationStatusBadge status={conv.status} />
            <span>{humanize(conv.channel)}</span>
            {conv.intent ? <span>· {humanize(conv.intent)}</span> : null}
          </span>
        }
        actions={
          <form action={setConversationStatus}>
            <input type="hidden" name="conversation_id" value={conv.id} />
            <input type="hidden" name="status" value={conv.status === 'resolved' || conv.status === 'closed' ? 'open' : 'resolved'} />
            <Button type="submit" variant="secondary" size="sm">
              {conv.status === 'resolved' || conv.status === 'closed' ? 'Reopen' : 'Mark resolved'}
            </Button>
          </form>
        }
      />

      {searchParams.triage_error ? (
        <Alert tone="warning" className="mb-4" title="AI triage didn't run">
          {searchParams.triage_error}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <div className="space-y-4 p-4 sm:p-5">
              {messages.length === 0 ? <p className="text-sm text-zinc-500">No messages yet.</p> : null}
              {messages.map(m => (
                <MessageBubble key={m.id} m={m} name={customer?.name} />
              ))}
            </div>
          </Card>
          <Composer action={addMessage} conversationId={conv.id} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-brand-600" /> AI triage
                </span>
              }
              description={ai.mode === 'demo' ? 'Demo AI (no key configured)' : `${ai.provider} · ${ai.model}`}
            />
            <CardBody className="space-y-4 text-sm">
              {decision ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="blue">{humanize(decision.intent)}</Badge>
                    {decision.urgency ? <RiskBadge level={decision.urgency} prefix="Urgency" /> : null}
                    <RiskBadge level={decision.risk_level} />
                  </div>
                  <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
                    <dt className="text-zinc-500">Action</dt>
                    <dd className="text-right font-medium text-zinc-800">{humanize(decision.action)}</dd>
                    <dt className="text-zinc-500">Confidence</dt>
                    <dd className="text-right font-medium text-zinc-800">{Math.round(Number(decision.confidence ?? 0) * 100)}%</dd>
                    {decision.refund_amount !== null ? (
                      <>
                        <dt className="text-zinc-500">Refund</dt>
                        <dd className="tabular text-right font-medium text-zinc-800">{formatMoney(decision.refund_amount, workspace.currency)}</dd>
                      </>
                    ) : null}
                    <dt className="text-zinc-500">Outcome</dt>
                    <dd className="text-right font-medium text-zinc-800">{humanize(decision.status)}</dd>
                  </dl>
                  {decision.reasoning ? <p className="rounded-lg bg-zinc-50 p-3 text-[13px] leading-relaxed text-zinc-600">{decision.reasoning}</p> : null}
                  {decision.policy_notes.length ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Policy checks</p>
                      <ul className="space-y-1 text-[13px] text-amber-800">
                        {decision.policy_notes.map(n => (
                          <li key={n}>• {n}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {approvalRow ? (
                    <Link href="/app/approvals" className="block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900 hover:bg-amber-100">
                      Waiting in Approvals →
                    </Link>
                  ) : null}
                  <p className="text-xs text-zinc-400">{formatDateTime(decision.created_at)} · {decision.model}</p>
                </>
              ) : (
                <p className="text-zinc-500">Not triaged yet.</p>
              )}
              {lastInbound && !triagedLatest && !approvalRow ? (
                <ActionForm action={triage}>
                  <input type="hidden" name="conversation_id" value={conv.id} />
                  <SubmitButton className="w-full" variant={decision ? 'secondary' : 'primary'} pendingText="Thinking…">
                    <Bot className="h-4 w-4" /> {decision ? 'Triage latest message' : 'Run AI triage'}
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <CardBody className="text-sm">
              {customer ? (
                <div className="space-y-3">
                  <Link href={`/app/customers/${customer.id}`} className="flex items-center gap-3">
                    <Avatar name={customer.name} />
                    <span>
                      <span className="block font-medium text-zinc-900 hover:underline">{customer.name}</span>
                      <span className="text-xs text-zinc-500">{customer.phone || customer.instagram_handle || customer.email}</span>
                    </span>
                  </Link>
                  {customer.sentiment === 'negative' ? <Badge tone="red">Negative sentiment — always reviewed</Badge> : null}
                </div>
              ) : (
                <p className="text-zinc-500">No customer linked.</p>
              )}
            </CardBody>
            {orders.length ? (
              <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                {orders.map(o => (
                  <li key={o.id}>
                    <Link href={`/app/orders/${o.id}`} className={cn('flex items-center justify-between gap-2 px-5 py-2.5 text-[13px] hover:bg-zinc-50', o.id === conv.order_id && 'bg-brand-50/50')}>
                      <span>
                        <span className="font-medium text-zinc-900">{orderLabel(o.order_number)}</span>
                        <span className="ml-2 text-zinc-500">{timeAgo(o.created_at)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular text-zinc-700">{formatMoney(o.total, o.currency)}</span>
                        <OrderStatusBadge status={o.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  )
}

function MessageBubble({ m, name }: { m: Message; name?: string }) {
  if (m.direction === 'internal') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
        <p className="mb-0.5 text-xs font-medium">Internal note · {timeAgo(m.created_at)}</p>
        <p className="whitespace-pre-line">{m.body}</p>
      </div>
    )
  }
  const inbound = m.direction === 'inbound'
  return (
    <div className={cn('flex gap-2.5', !inbound && 'flex-row-reverse')}>
      {inbound ? (
        <Avatar name={name ?? 'Customer'} className="h-7 w-7 text-[10px]" />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
          {m.author_type === 'ai' ? <Sparkles className="h-3.5 w-3.5" /> : <span className="text-[10px] font-semibold">You</span>}
        </span>
      )}
      <div className={cn('max-w-[85%] sm:max-w-[75%]', !inbound && 'text-right')}>
        <div
          className={cn(
            'inline-block whitespace-pre-line rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed',
            inbound ? 'rounded-tl-sm bg-zinc-100 text-zinc-800' : 'rounded-tr-sm bg-zinc-900 text-white',
          )}
        >
          {m.body}
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">
          {inbound ? name ?? 'Customer' : m.author_type === 'ai' ? 'Sent by StoreOS AI' : 'Team'} · {timeAgo(m.created_at)}
        </p>
      </div>
    </div>
  )
}
