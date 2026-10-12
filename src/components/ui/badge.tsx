import { cn } from '@/lib/utils'
import type { ConversationStatus, OrderStatus, RiskLevel, ApprovalStatus } from '@/lib/types'

export type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'teal'

const tones: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  blue: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
}

export function Badge({
  tone = 'neutral',
  dot,
  className,
  children,
}: {
  tone?: Tone
  dot?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  )
}

const ORDER: Record<OrderStatus, { tone: Tone; label: string }> = {
  pending: { tone: 'amber', label: 'Pending' },
  paid: { tone: 'blue', label: 'Paid' },
  fulfilled: { tone: 'violet', label: 'Fulfilled' },
  delivered: { tone: 'green', label: 'Delivered' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
  refunded: { tone: 'red', label: 'Refunded' },
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER[status] ?? ORDER.pending
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  )
}

const RISK: Record<RiskLevel, Tone> = { low: 'green', medium: 'amber', high: 'red' }

export function RiskBadge({ level, prefix = 'Risk' }: { level: RiskLevel; prefix?: string }) {
  return (
    <Badge tone={RISK[level]}>
      {prefix ? `${prefix}: ` : ''}
      {level}
    </Badge>
  )
}

const CONV: Record<ConversationStatus, { tone: Tone; label: string }> = {
  open: { tone: 'blue', label: 'Open' },
  awaiting_approval: { tone: 'amber', label: 'Needs approval' },
  resolved: { tone: 'green', label: 'Resolved' },
  closed: { tone: 'neutral', label: 'Closed' },
}

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  const s = CONV[status] ?? CONV.open
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  )
}

const APPROVAL: Record<ApprovalStatus, { tone: Tone; label: string }> = {
  pending: { tone: 'amber', label: 'Pending' },
  approved: { tone: 'green', label: 'Approved' },
  rejected: { tone: 'red', label: 'Rejected' },
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const s = APPROVAL[status]
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  )
}

export function humanize(s: string | null | undefined) {
  if (!s) return '—'
  return s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}
