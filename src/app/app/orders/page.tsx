import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Search, ShoppingBag } from 'lucide-react'
import { OrderStatusBadge, humanize } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { TD, TH, THead, TR, Table } from '@/components/ui/table'
import { requireWorkspace } from '@/lib/workspace'
import { cn, formatDate, formatMoney, orderLabel } from '@/lib/utils'
import type { Order, OrderStatus } from '@/lib/types'

export const metadata: Metadata = { title: 'Orders' }

const TABS: { key: 'all' | OrderStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
]

export default async function OrdersPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const { supabase, workspace } = await requireWorkspace()
  const status = TABS.some(t => t.key === searchParams.status) ? (searchParams.status as (typeof TABS)[number]['key']) : 'all'
  const q = (searchParams.q ?? '').replace(/[^0-9]/g, '')

  let query = supabase
    .from('orders')
    .select('*, customer:customers(id, name)')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (status !== 'all') query = query.eq('status', status)
  if (q) query = query.eq('order_number', Number(q))
  const { data } = await query
  const orders = (data ?? []) as (Order & { customer: { id: string; name: string } | null })[]

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every sale, from first message to delivery."
        actions={
          <ButtonLink href="/app/orders/new">
            <Plus className="h-4 w-4" /> Create order
          </ButtonLink>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(t => (
              <Link
                key={t.key}
                href={`/app/orders?status=${t.key}`}
                className={cn(
                  'whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
                  status === t.key ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100',
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <form className="relative sm:w-48">
            <input type="hidden" name="status" value={status} />
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input name="q" defaultValue={searchParams.q ?? ''} placeholder="Order #" className="pl-8" inputMode="numeric" />
          </form>
        </div>
        {orders.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag />}
            title={status !== 'all' || q ? 'No orders match' : 'No orders yet'}
            description={status !== 'all' || q ? 'Try another filter.' : 'Record your first sale — stock updates automatically.'}
            action={
              status === 'all' && !q ? (
                <ButtonLink href="/app/orders/new">
                  <Plus className="h-4 w-4" /> Create order
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                <TH className="hidden sm:table-cell">Date</TH>
                <TH>Customer</TH>
                <TH className="hidden md:table-cell">Channel</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
              </tr>
            </THead>
            <tbody>
              {orders.map(o => (
                <TR key={o.id} className="hover:bg-zinc-50/70">
                  <TD>
                    <Link href={`/app/orders/${o.id}`} className="font-medium text-zinc-900 hover:underline">
                      {orderLabel(o.order_number)}
                    </Link>
                  </TD>
                  <TD className="hidden text-zinc-500 sm:table-cell">{formatDate(o.created_at)}</TD>
                  <TD className="max-w-[10rem] truncate">{o.customer?.name ?? <span className="text-zinc-400">Walk-in</span>}</TD>
                  <TD className="hidden text-zinc-500 md:table-cell">{humanize(o.channel)}</TD>
                  <TD>
                    <OrderStatusBadge status={o.status} />
                  </TD>
                  <TD className="tabular text-right font-medium text-zinc-900">{formatMoney(o.total, o.currency)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
