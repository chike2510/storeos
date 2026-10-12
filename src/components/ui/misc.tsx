import { cn, initials } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  back?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? <div className="mb-2">{back}</div> : null}
        <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  const palette = ['bg-brand-100 text-brand-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800']
  const idx = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        palette[idx],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-zinc-500">{label}</p>
        {icon ? <span className="text-zinc-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
      </div>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  )
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'error' | 'success' | 'warning'
  title?: string
  children?: React.ReactNode
  className?: string
}) {
  const styles = {
    info: 'border-brand-200 bg-brand-50 text-brand-900',
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-3.5 py-2.5 text-sm', styles, className)}>
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title && 'mt-0.5 opacity-90')}>{children}</div> : null}
    </div>
  )
}

export function Thumb({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50', className)}>
      {src ? (
        // Storage URLs are arbitrary hosts; a plain img avoids image-optimizer config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="m-auto text-[10px] font-medium uppercase text-zinc-400">{alt.slice(0, 2)}</span>
      )}
    </span>
  )
}
