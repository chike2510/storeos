import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Delta({ value, suffix = 'vs previous period' }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-zinc-500">New this period</span>
  const up = value >= 0
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-flex items-center font-medium', up ? 'text-emerald-600' : 'text-red-600')}>
        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(value).toFixed(value !== 0 && Math.abs(value) < 10 ? 1 : 0)}%
      </span>
      <span className="text-zinc-400">{suffix}</span>
    </span>
  )
}
