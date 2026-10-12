import { cn, formatMoney } from '@/lib/utils'

/** Lightweight SVG bar chart (server-rendered, no client JS). */
export function RevenueChart({
  data,
  currency,
  height = 220,
}: {
  data: { key: string; label: string; revenue: number; orders: number }[]
  currency: string
  height?: number
}) {
  const max = Math.max(...data.map(d => d.revenue), 1)
  const nice = niceCeil(max)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * nice)
  const labelEvery = Math.max(1, Math.ceil(data.length / 8))

  return (
    <div className="flex gap-3">
      <div className="flex shrink-0 flex-col justify-between pb-6 text-right text-[11px] text-zinc-400" style={{ height }}>
        {[...ticks].reverse().map(t => (
          <span key={t} className="tabular leading-none">
            {formatMoney(t, currency, { compact: true })}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height: height - 24 }}>
          {ticks.map(t => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-zinc-100" style={{ bottom: `${(t / nice) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px] sm:gap-1">
            {data.map(d => (
              <div key={d.key} className="group relative flex h-full flex-1 items-end">
                <div
                  className="w-full rounded-t-[3px] bg-brand-500/85 transition-colors group-hover:bg-brand-600"
                  style={{ height: `${Math.max((d.revenue / nice) * 100, d.revenue > 0 ? 1.5 : 0)}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white shadow-pop group-hover:block">
                  <span className="font-medium">{d.label}</span> · {formatMoney(d.revenue, currency)} · {d.orders} order{d.orders === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-[2px] text-[10px] text-zinc-400 sm:gap-1">
          {data.map((d, i) => (
            <span key={d.key} className="flex-1 truncate text-center">
              {i % labelEvery === 0 ? d.label : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function BarList({
  items,
  format,
  className,
}: {
  items: { label: React.ReactNode; value: number; sub?: React.ReactNode; key: string; tone?: string }[]
  format: (n: number) => string
  className?: string
}) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <ul className={cn('space-y-2.5', className)}>
      {items.map(i => (
        <li key={i.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-zinc-700">{i.label}</span>
            <span className="tabular shrink-0 font-medium text-zinc-900">
              {format(i.value)}
              {i.sub ? <span className="ml-1.5 text-xs font-normal text-zinc-400">{i.sub}</span> : null}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className={cn('h-full rounded-full', i.tone ?? 'bg-brand-500')} style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function niceCeil(n: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(n)))
  const f = n / exp
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nf * exp
}
