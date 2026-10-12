import Link from 'next/link'
import { AlertTriangle, ArrowRight, Inbox, Package, Plus, ShieldCheck, ShoppingBag, Sparkles } from 'lucide-react'
import { RevenueChart } from '@/components/app/charts'
import { Delta } from '@/components/app/delta'
import { OrderStatusBadge, RiskBadge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Avatar, EmptyState, PageHeader, StatCard, Thumb } from '@/components/ui/misc'
import { getSalesSummary, pctChange } from '@/lib/analytics'
import { requireWorkspace } from '@/lib/workspace'
import { formatMoney, formatNumber, orderLabel, timeAgo } from '@/lib/utils'
import type { Order, Product } from '@/lib/types'

export default async function OverviewPage() {
  const ctx = await requireWorkspace()
  const { supabase, workspace, user } = ctx
  const cur = workspace.currency

  const [summary, recent, lowStock, approvals, openConvs, productCount] = await Promise.all([
    getSalesSummary(ctx, 30),
    supabase
      .from('orders')
      .select('*, customer:customers(name)')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspace.id)
      .eq('is_low_stock', true)
      .eq('status', 'active')
      .order('stock_quantity', { ascending: true })
      .limit(6),
    supabase
      .from('approvals')
      .select('id, reason, created_at, decision:ai_decisions(risk_level, action, refund_amount), conversation:conversations(id, subject, customer:customers(name))')
      .eq('workspace_id', workspace.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id).eq('status', 'open'),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
  ])

  const orders = (recent.data ?? []) as (Order & { customer: { name: string } | null })[]
  const low = (lowStock.data ?? []) as Product[]
  type ApprovalRow = {
    id: string
    reason: string
    created_at: string
    decision: { risk_level: 'low' | 'medium' | 'high'; action: string | null; refund_amount: number | null } | null
    conversation: { id: string; subject: string; customer: { name: string } | null } | null
  }
  const pending = (approvals.data ?? []) as unknown as ApprovalRow[]
  const firstName = user.name?.split(' ')[0]
  const isEmpty = (productCount.count ?? 0) === 0 && orders.length === 0

  return (
    <>
      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : 'Overview'}
        description={`Here's how ${workspace.name} is doing over the last 30 days.`}
        actions={
          <ButtonLink href="/app/orders/new">
            <Plus className="h-4 w-4" /> Create order
          </ButtonLink>
        }
      />

      {isEmpty ? (
        <Card className="mb-6">
          <CardBody className="grid gap-4 sm:grid-cols-3">
            {[
              { href: '/app/products/new', icon: Package, title: 'Add your first product', body: 'Set prices and opening stock.' },
              { href: '/app/studio', icon: Sparkles, title: 'Create a listing from a photo', body: 'Let AI write it for you.' },
              { href: '/app/settings', icon: ShieldCheck, title: 'Load demo data', body: 'Explore StoreOS with sample data.' },
            ].map(s => (
              <Link key={s.href} href={s.href} className="group rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50">
                <s.icon className="h-5 w-5 text-brand-600" />
                <p className="mt-3 text-sm font-medium text-zinc-900">{s.title}</p>
                <p className="text-[13px] text-zinc-500">{s.body}</p>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(summary.revenue, cur)} sub={<Delta value={pctChange(summary.revenue, summary.prevRevenue)} suffix="vs prior 30d" />} />
        <StatCard label="Orders" value={formatNumber(summary.orders)} sub={<Delta value={pctChange(summary.orders, summary.prevOrders)} suffix="vs prior 30d" />} />
        <StatCard label="Avg. order value" value={formatMoney(summary.aov, cur)} sub="Last 30 days" />
        <StatCard
          label="Open conversations"
          value={formatNumber(openConvs.count ?? 0)}
          sub={
            pending.length ? (
              <Link href="/app/approvals" className="font-medium text-amber-700 hover:underline">
                {pending.length} awaiting approval
              </Link>
            ) : (
              'No approvals pending'
            )
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Sales"
              description="Daily revenue, last 30 days"
              action={
                <Link href="/app/analytics" className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900">
                  Analytics →
                </Link>
              }
            />
            <CardBody>
              {summary.revenue > 0 ? (
                <RevenueChart data={summary.series} currency={cur} height={200} />
              ) : (
                <p className="py-10 text-center text-sm text-zinc-500">No paid orders in the last 30 days.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent orders"
              action={
                <Link href="/app/orders" className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900">
                  View all →
                </Link>
              }
            />
            {orders.length === 0 ? (
              <EmptyState icon={<ShoppingBag />} title="No orders yet" description="Orders you record will appear here." className="py-10" />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {orders.map(o => (
                  <li key={o.id}>
                    <Link href={`/app/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50/70">
                      <span className="w-14 shrink-0 text-sm font-medium text-zinc-900">{orderLabel(o.order_number)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-600">{o.customer?.name ?? 'Walk-in'}</span>
                      <span className="hidden text-xs text-zinc-400 sm:inline">{timeAgo(o.created_at)}</span>
                      <OrderStatusBadge status={o.status} />
                      <span className="tabular w-24 text-right text-sm font-medium text-zinc-900">{formatMoney(o.total, o.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-amber-600" /> Pending approvals
                </span>
              }
            />
            {pending.length === 0 ? (
              <CardBody className="text-sm text-zinc-500">Nothing needs your sign-off.</CardBody>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {pending.map(a => (
                  <li key={a.id}>
                    <Link href="/app/approvals" className="flex gap-3 px-5 py-3 hover:bg-zinc-50/70">
                      <Avatar name={a.conversation?.customer?.name ?? '?'} className="h-7 w-7 text-[10px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900">{a.conversation?.customer?.name ?? 'Customer'}</p>
                        <p className="truncate text-xs text-zinc-500">{a.reason}</p>
                      </div>
                      {a.decision ? <RiskBadge level={a.decision.risk_level} prefix="" /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Low stock
                </span>
              }
              action={
                <Link href="/app/products?filter=low" className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900">
                  All →
                </Link>
              }
            />
            {low.length === 0 ? (
              <CardBody className="text-sm text-zinc-500">Everything is well stocked.</CardBody>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {low.map(p => (
                  <li key={p.id}>
                    <Link href={`/app/products/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-50/70">
                      <Thumb src={p.image_url} alt={p.title} className="h-8 w-8" />
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">{p.title}</span>
                      <span className="tabular text-sm font-semibold text-amber-700">{p.stock_quantity} left</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Link
            href="/app/inbox"
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-card transition-colors hover:bg-zinc-50"
          >
            <span className="flex items-center gap-3">
              <Inbox className="h-5 w-5 text-zinc-400" />
              <span>
                <span className="block text-sm font-medium text-zinc-900">Support inbox</span>
                <span className="text-xs text-zinc-500">{formatNumber(openConvs.count ?? 0)} open conversations</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-zinc-400" />
          </Link>
        </div>
      </div>
    </>
  )
}
