import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { Badge, ConversationStatusBadge, OrderStatusBadge, humanize } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Avatar, PageHeader, StatCard } from '@/components/ui/misc'
import { TD, TH, THead, TR, Table } from '@/components/ui/table'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { formatDate, formatMoney, formatNumber, orderLabel, timeAgo } from '@/lib/utils'
import type { Conversation, Customer, CustomerStats, Order } from '@/lib/types'
import { deleteCustomer, updateCustomer } from '../actions'
import { CustomerFields } from '../customer-fields'

export const metadata: Metadata = { title: 'Customer' }

export default async function CustomerPage({ params }: { params: { id: string } }) {
  const { supabase, workspace, role } = await requireWorkspace()
  const { data } = await supabase.from('customers').select('*').eq('id', params.id).eq('workspace_id', workspace.id).maybeSingle()
  if (!data) notFound()
  const customer = data as Customer

  const [{ data: s }, { data: o }, { data: cv }] = await Promise.all([
    supabase.from('customer_stats').select('*').eq('customer_id', customer.id).maybeSingle(),
    supabase.from('orders').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('conversations').select('*').eq('customer_id', customer.id).order('last_message_at', { ascending: false }).limit(10),
  ])
  const stats = s as CustomerStats | null
  const orders = (o ?? []) as Order[]
  const conversations = (cv ?? []) as Conversation[]
  const count = Number(stats?.orders_count ?? 0)
  const spent = Number(stats?.total_spent ?? 0)

  return (
    <>
      <PageHeader
        back={
          <Link href="/app/customers" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Customers
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={customer.name} className="h-10 w-10 text-sm" />
            {customer.name}
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Customer since {formatDate(customer.created_at)}</span>
            <Badge tone={customer.sentiment === 'negative' ? 'red' : customer.sentiment === 'positive' ? 'green' : 'neutral'}>
              {humanize(customer.sentiment)}
            </Badge>
            {customer.tags.map(t => (
              <Badge key={t}>{t}</Badge>
            ))}
          </span>
        }
        actions={
          <ButtonLink href={`/app/orders/new?customer=${customer.id}`}>
            <Plus className="h-4 w-4" /> New order
          </ButtonLink>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Orders" value={formatNumber(count)} />
        <StatCard label="Total spent" value={formatMoney(spent, workspace.currency)} />
        <StatCard
          label="Average order"
          value={formatMoney(count ? spent / count : 0, workspace.currency)}
          sub={stats?.last_order_at ? `Last order ${timeAgo(stats.last_order_at)}` : 'No orders yet'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Order history" />
            {orders.length === 0 ? (
              <CardBody className="text-sm text-zinc-500">No orders yet.</CardBody>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Order</TH>
                    <TH>Date</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Total</TH>
                  </tr>
                </THead>
                <tbody>
                  {orders.map(order => (
                    <TR key={order.id} className="hover:bg-zinc-50/70">
                      <TD>
                        <Link href={`/app/orders/${order.id}`} className="font-medium text-zinc-900 hover:underline">
                          {orderLabel(order.order_number)}
                        </Link>
                      </TD>
                      <TD className="text-zinc-500">{formatDate(order.created_at)}</TD>
                      <TD>
                        <OrderStatusBadge status={order.status} />
                      </TD>
                      <TD className="tabular text-right font-medium text-zinc-900">{formatMoney(order.total, order.currency)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Conversations"
              action={
                <ButtonLink href={`/app/inbox/new?customer=${customer.id}`} variant="secondary" size="sm">
                  <MessageSquare className="h-3.5 w-3.5" /> Log message
                </ButtonLink>
              }
            />
            {conversations.length === 0 ? (
              <CardBody className="text-sm text-zinc-500">No conversations yet.</CardBody>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {conversations.map(c => (
                  <li key={c.id}>
                    <Link href={`/app/inbox/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-zinc-50/70">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-900">{c.subject || 'Conversation'}</span>
                        <span className="text-xs text-zinc-500">
                          {humanize(c.channel)} · {timeAgo(c.last_message_at)}
                        </span>
                      </span>
                      <ConversationStatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <ActionForm action={updateCustomer}>
            <input type="hidden" name="id" value={customer.id} />
            <Card>
              <CardHeader title="Details" />
              <CardBody>
                <CustomerFields customer={customer} />
              </CardBody>
              <CardFooter>
                <SubmitButton size="sm" pendingText="Saving…">
                  Save
                </SubmitButton>
              </CardFooter>
            </Card>
          </ActionForm>
          {canManage(role) ? (
            <form action={deleteCustomer}>
              <input type="hidden" name="id" value={customer.id} />
              <ConfirmButton
                variant="ghost"
                size="sm"
                message={`Delete ${customer.name}? Their orders are kept but unlinked.`}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" /> Delete customer
              </ConfirmButton>
            </form>
          ) : null}
        </div>
      </div>
    </>
  )
}
