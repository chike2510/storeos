import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { BarList, RevenueChart } from '@/components/app/charts'
import { Delta } from '@/components/app/delta'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EmptyState, PageHeader, StatCard } from '@/components/ui/misc'
import { getSalesSummary, pctChange } from '@/lib/analytics'
import { requireWorkspace } from '@/lib/workspace'
import { cn, formatMoney, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Analytics' }

const RANGES = [7, 30, 90] as const
const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-400',
  paid: 'bg-brand-500',
  fulfilled: 'bg-violet-500',
  delivered: 'bg-emerald-500',
  cancelled: 'bg-zinc-300',
  refunded: 'bg-red-400',
}

export default async function AnalyticsPage({ searchParams }: { searchParams: { range?: string } }) {
  const ctx = await requireWorkspace()
  const days = RANGES.find(r => String(r) === searchParams.range) ?? 30
  const s = await getSalesSummary(ctx, days)
  const cur = ctx.workspace.currency
  const money = (n: number) => formatMoney(n, cur)
  const totalStatus = s.byStatus.reduce((a, b) => a + b.count, 0)

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Revenue counts paid, fulfilled and delivered orders, net of refunds."
        actions={
          <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[13px] font-medium shadow-sm">
            {RANGES.map(r => (
              <Link
                key={r}
                href={`/app/analytics?range=${r}`}
                className={cn('rounded-md px-2.5 py-1', r === days ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900')}
              >
                {r}d
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Revenue" value={money(s.revenue)} sub={<Delta value={pctChange(s.revenue, s.prevRevenue)} />} />
        <StatCard label="Orders" value={formatNumber(s.orders)} sub={<Delta value={pctChange(s.orders, s.prevOrders)} />} />
        <StatCard label="Average order value" value={money(s.aov)} sub={`Last ${days} days`} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Revenue over time" description={`Daily, last ${days} days`} />
        <CardBody>
          {s.revenue > 0 ? (
            <RevenueChart data={s.series} currency={cur} />
          ) : (
            <EmptyState icon={<BarChart3 />} title="No revenue in this period" description="Paid orders will show up here." className="py-10" />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top products" description="By revenue" />
          <CardBody>
            {s.topProducts.length ? (
              <BarList
                format={money}
                items={s.topProducts.map(p => ({
                  key: p.productId ?? p.title,
                  label: p.productId ? (
                    <Link href={`/app/products/${p.productId}`} className="hover:underline">
                      {p.title}
                    </Link>
                  ) : (
                    p.title
                  ),
                  value: p.revenue,
                  sub: `${formatNumber(p.quantity)} sold`,
                }))}
              />
            ) : (
              <p className="py-6 text-center text-sm text-zinc-500">No sales yet.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Orders by status" description={`${formatNumber(totalStatus)} orders created in the last ${days} days`} />
          <CardBody>
            {totalStatus ? (
              <>
                <div className="mb-5 flex h-2.5 overflow-hidden rounded-full bg-zinc-100">
                  {s.byStatus
                    .filter(b => b.count)
                    .map(b => (
                      <div key={b.status} className={STATUS_TONE[b.status]} style={{ width: `${(b.count / totalStatus) * 100}%` }} />
                    ))}
                </div>
                <BarList
                  format={formatNumber}
                  items={s.byStatus.map(b => ({
                    key: b.status,
                    label: (
                      <Link href={`/app/orders?status=${b.status}`} className="capitalize hover:underline">
                        {b.status}
                      </Link>
                    ),
                    value: b.count,
                    tone: STATUS_TONE[b.status],
                  }))}
                />
              </>
            ) : (
              <p className="py-6 text-center text-sm text-zinc-500">No orders yet.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  )
}
