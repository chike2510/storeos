import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('h-7 w-7', className)}>
      <rect width="32" height="32" rx="8" className="fill-zinc-900" />
      <path d="M9 12.5 16 8.5l7 4v7l-7 4-7-4v-7Z" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" />
      <path d="m9 12.5 7 4 7-4M16 16.5v7" fill="none" stroke="#93b4fd" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-zinc-900">StoreOS</span>
    </span>
  )
}
