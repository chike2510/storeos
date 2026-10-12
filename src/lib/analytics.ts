import 'server-only'
import type { OrderStatus } from '@/lib/types'
import type { WorkspaceContext } from '@/lib/workspace'

const COUNTED: OrderStatus[] = ['paid', 'fulfilled', 'delivered', 'refunded']

export interface SalesPoint {
  key: string
  label: string
  revenue: number
  orders: number
}

export interface SalesSummary {
  days: number
  series: SalesPoint[]
  revenue: number
  orders: number
  aov: number
  prevRevenue: number
  prevOrders: number
  byStatus: { status: OrderStatus; count: number }[]
  topProducts: { productId: string | null; title: string; quantity: number; revenue: number }[]
}

function dayKey(d: Date, tz: string) {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export async function getSalesSummary(ctx: WorkspaceContext, days: number): Promise<SalesSummary> {
  const { supabase, workspace } = ctx
  const tz = workspace.timezone || 'UTC'
  const now = new Date()
  const start = new Date(now.getTime() - days * 86400_000)
  const prevStart = new Date(now.getTime() - 2 * days * 86400_000)

  const [{ data: orderRows }, { data: itemRows }] = await Promise.all([
    supabase
      .from('orders')
      .select('created_at, total, refunded_amount, status')
      .eq('workspace_id', workspace.id)
      .gte('created_at', prevStart.toISOString())
      .order('created_at', { ascending: true })
      .limit(10000),
    supabase
      .from('order_items')
      .select('title, product_id, quantity, total, orders!inner(created_at, status)')
      .eq('workspace_id', workspace.id)
      .gte('orders.created_at', start.toISOString())
      .in('orders.status', COUNTED)
      .limit(10000),
  ])

  const orders = (orderRows ?? []) as { created_at: string; total: number; refunded_amount: number; status: OrderStatus }[]

  const series: SalesPoint[] = []
  const index = new Map<string, SalesPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000)
    const key = dayKey(d, tz)
    if (index.has(key)) continue
    const p = {
      key,
      label: new Intl.DateTimeFormat('en', { timeZone: tz, month: 'short', day: 'numeric' }).format(d),
      revenue: 0,
      orders: 0,
    }
    index.set(key, p)
    series.push(p)
  }

  let revenue = 0
  let count = 0
  let prevRevenue = 0
  let prevOrders = 0
  const statusCounts = new Map<OrderStatus, number>()

  for (const o of orders) {
    const created = new Date(o.created_at)
    const value = Number(o.total) - Number(o.refunded_amount)
    const counted = COUNTED.includes(o.status)
    if (created >= start) {
      statusCounts.set(o.status, (statusCounts.get(o.status) ?? 0) + 1)
      if (counted) {
        revenue += value
        count += 1
        const p = index.get(dayKey(created, tz))
        if (p) {
          p.revenue += value
          p.orders += 1
        }
      }
    } else if (counted) {
      prevRevenue += value
      prevOrders += 1
    }
  }

  const top = new Map<string, { productId: string | null; title: string; quantity: number; revenue: number }>()
  for (const i of (itemRows ?? []) as { title: string; product_id: string | null; quantity: number; total: number }[]) {
    const k = i.product_id ?? `custom:${i.title}`
    const cur = top.get(k) ?? { productId: i.product_id, title: i.title, quantity: 0, revenue: 0 }
    cur.quantity += Number(i.quantity)
    cur.revenue += Number(i.total)
    top.set(k, cur)
  }

  const ORDER: OrderStatus[] = ['pending', 'paid', 'fulfilled', 'delivered', 'cancelled', 'refunded']
  return {
    days,
    series,
    revenue,
    orders: count,
    aov: count ? revenue / count : 0,
    prevRevenue,
    prevOrders,
    byStatus: ORDER.map(s => ({ status: s, count: statusCounts.get(s) ?? 0 })),
    topProducts: Array.from(top.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8),
  }
}

export function pctChange(cur: number, prev: number) {
  if (!prev) return cur ? null : 0
  return ((cur - prev) / prev) * 100
}
