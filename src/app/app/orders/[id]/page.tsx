import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { OrderStatusBadge, humanize } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Alert, Avatar, PageHeader, Thumb } from '@/components/ui/misc'
import { requireWorkspace } from '@/lib/workspace'
import { formatDateTime, formatMoney, orderLabel } from '@/lib/utils'
import type { AuditEvent, Customer, Order, OrderItem } from '@/lib/types'
import { setOrderStatus } from '../actions'
import { StatusActions } from './status-actions'

export const metadata: Metadata = { title: 'Order' }

export default async function OrderPage({ params, searchParams }: { params: { id: string }; searchParams: { created?: string } }) {
  const { supabase, workspace } = await requireWorkspace()
  const { data } = await supabase.from('orders').select('*').eq('id', params.id).eq('workspace_id', workspace.id).maybeSingle()
  if (!data) notFound()
  const order = data as Order

  const [{ data: itemRows }, { data: customerRow }, { data: events }] = await Promise.all([
    supabase.from('order_items').select('*, product:products(image_url)').eq('order_id', order.id).order('created_at'),
    order.customer_id ? supabase.from('customers').select('*').eq('id', order.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase
      .from('audit_events')
      .select('*')
      .eq('entity_type', 'order')
      .eq('entity_id', order.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  const items = (itemRows ?? []) as (OrderItem & { product: { image_url: string | null } | null })[]
  const customer = customerRow as Customer | null
  const timeline = (events ?? []) as AuditEvent[]
  const money = (n: number) => formatMoney(n, order.currency)

  return (
    <>
      <PageHeader
        back={
          <Link href="/app/orders" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Orders
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            Order {orderLabel(order.order_number)} <OrderStatusBadge status={order.status} />
          </span>
        }
        description={`${formatDateTime(order.created_at)} · via ${humanize(order.channel)}`}
      />

      {searchParams.created ? (
        <Alert tone="success" className="mb-6">
          Order created and stock updated.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Items" />
            <ul className="divide-y divide-zinc-100">
              {items.map(i => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                  <Thumb src={i.product?.image_url} alt={i.title} />
                  <div className="min-w-0 flex-1">
                    {i.product_id ? (
                      <Link href={`/app/products/${i.product_id}`} className="block truncate text-sm font-medium text-zinc-900 hover:underline">
                        {i.title}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-medium text-zinc-900">{i.title}</p>
                    )}
                    <p className="text-xs text-zinc-500">
                      {i.quantity} × {money(i.unit_price)}
                      {i.sku ? ` · ${i.sku}` : ''}
                    </p>
                  </div>
                  <p className="tabular text-sm font-medium text-zinc-900">{money(i.total)}</p>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-zinc-100 px-5 py-4 text-sm">
              <Row label="Subtotal" value={money(order.subtotal)} />
              {Number(order.discount) ? <Row label="Discount" value={`−${money(order.discount)}`} /> : null}
              {Number(order.shipping) ? <Row label="Delivery" value={money(order.shipping)} /> : null}
              <div className="flex justify-between pt-1 text-base font-semibold text-zinc-900">
                <dt>Total</dt>
                <dd className="tabular">{money(order.total)}</dd>
              </div>
              {Number(order.refunded_amount) ? <Row label="Refunded" value={`−${money(order.refunded_amount)}`} className="text-red-600" /> : null}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            {timeline.length === 0 ? (
              <CardBody className="text-sm text-zinc-500">No activity recorded.</CardBody>
            ) : (
              <ol className="space-y-0 px-5 py-4">
                {timeline.map((e, idx) => (
                  <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {idx < timeline.length - 1 ? <span className="absolute left-[5px] top-4 h-full w-px bg-zinc-200" /> : null}
                    <span className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-zinc-400 ring-1 ring-zinc-200" />
                    <div className="text-sm">
                      <p className="text-zinc-800">{describe(e)}</p>
                      <p className="text-xs text-zinc-500">
                        {formatDateTime(e.created_at)} · {e.actor_type === 'ai' ? 'StoreOS AI' : e.actor_type === 'system' ? 'System' : 'Team'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <StatusActions action={setOrderStatus} orderId={order.id} status={order.status} total={Number(order.total)} currency={order.currency} />

          <Card>
            <CardHeader title="Customer" />
            <CardBody className="text-sm">
              {customer ? (
                <div className="space-y-3">
                  <Link href={`/app/customers/${customer.id}`} className="flex items-center gap-3">
                    <Avatar name={customer.name} />
                    <span className="font-medium text-zinc-900 hover:underline">{customer.name}</span>
                  </Link>
                  <div className="space-y-1 text-zinc-600">
                    {customer.phone ? <p>{customer.phone}</p> : null}
                    {customer.email ? <p>{customer.email}</p> : null}
                    {customer.instagram_handle ? <p>{customer.instagram_handle}</p> : null}
                  </div>
                </div>
              ) : (
                <p className="text-zinc-500">Walk-in / no customer</p>
              )}
              {order.shipping_address ? (
                <div className="mt-4 border-t border-zinc-100 pt-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">Delivery address</p>
                  <p className="whitespace-pre-line text-zinc-700">{order.shipping_address}</p>
                </div>
              ) : null}
              {order.notes ? (
                <div className="mt-4 border-t border-zinc-100 pt-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">Note</p>
                  <p className="whitespace-pre-line text-zinc-700">{order.notes}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between text-zinc-600 ${className ?? ''}`}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  )
}

function describe(e: AuditEvent) {
  const m = e.metadata as Record<string, unknown>
  switch (e.action) {
    case 'order.created':
      return `Order created as ${String(m.status ?? 'pending')}`
    case 'order.status_changed':
      return `Status changed from ${String(m.from)} to ${String(m.to)}${m.note ? ` — ${String(m.note)}` : ''}`
    default:
      return humanize(e.action.replace('.', ' '))
  }
}
