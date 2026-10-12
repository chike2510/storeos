'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronsUpDown, LogOut, Menu, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/ui/logo'
import { Avatar } from '@/components/ui/misc'
import { NAV_SECTIONS, SETTINGS_ITEM, type NavItem } from './nav'
import type { MemberRole } from '@/lib/types'

export interface ShellProps {
  workspace: { id: string; name: string; currency: string }
  workspaces: { id: string; name: string; role: MemberRole }[]
  user: { email: string | null; name: string | null }
  role: MemberRole
  badges: { approvals: number; inbox: number }
  switchWorkspace: (formData: FormData) => Promise<void>
}

function isActive(pathname: string, href: string) {
  if (href === '/app') return pathname === '/app'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLink({ item, pathname, badge, onNavigate }: { item: NavItem; pathname: string; badge?: number; onNavigate?: () => void }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors focus-ring',
        active ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900',
      )}
    >
      <Icon className={cn('h-4 w-4', active ? 'text-zinc-900' : 'text-zinc-400 group-hover:text-zinc-600')} />
      <span className="flex-1 truncate">{item.label}</span>
      {badge ? (
        <span
          className={cn(
            'tabular min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5',
            item.badgeKey === 'approvals' ? 'bg-amber-100 text-amber-800' : 'bg-zinc-200 text-zinc-700',
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  )
}

function WorkspaceSwitcher({ workspace, workspaces, switchWorkspace }: Pick<ShellProps, 'workspace' | 'workspaces' | 'switchWorkspace'>) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-200/50 focus-ring"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
          {workspace.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-zinc-900">{workspace.name}</span>
          <span className="block text-[11px] text-zinc-500">{workspace.currency} workspace</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-400" />
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-40 mt-1 animate-fade-in rounded-lg border border-zinc-200 bg-white p-1 shadow-pop">
            <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Workspaces</p>
            {workspaces.map(w => (
              <form key={w.id} action={switchWorkspace}>
                <input type="hidden" name="workspace_id" value={w.id} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-zinc-700 hover:bg-zinc-100"
                >
                  <span className="flex-1 truncate">{w.name}</span>
                  <span className="text-[11px] capitalize text-zinc-400">{w.role}</span>
                  {w.id === workspace.id ? <Check className="h-3.5 w-3.5 text-zinc-900" /> : null}
                </button>
              </form>
            ))}
            <div className="my-1 h-px bg-zinc-100" />
            <Link
              href="/onboarding?new=1"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-100"
            >
              <Plus className="h-3.5 w-3.5" /> New workspace
            </Link>
          </div>
        </>
      ) : null}
    </div>
  )
}

function SidebarContent({ props, pathname, onNavigate }: { props: ShellProps; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn('px-3 pb-2 pt-3', onNavigate && 'pr-11')}>
        <WorkspaceSwitcher workspace={props.workspace} workspaces={props.workspaces} switchWorkspace={props.switchWorkspace} />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main">
        {NAV_SECTIONS.map((section, i) => (
          <div key={i} className="space-y-0.5">
            {section.label ? (
              <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">{section.label}</p>
            ) : null}
            {section.items.map(item => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
                badge={item.badgeKey ? props.badges[item.badgeKey] : undefined}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t border-zinc-200/80 px-3 py-3">
        <NavLink item={SETTINGS_ITEM} pathname={pathname} onNavigate={onNavigate} />
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar name={props.user.name || props.user.email} className="h-7 w-7 text-[11px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-zinc-900">{props.user.name || props.user.email}</p>
            <p className="text-[11px] capitalize text-zinc-500">{props.role}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 focus-ring"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export function AppShell({ children, ...props }: ShellProps & { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => setMobileOpen(false), [pathname])

  return (
    <div className="min-h-screen bg-zinc-50/40">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-zinc-200/80 bg-zinc-50 lg:block">
        <SidebarContent props={props} pathname={pathname} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <Link href="/app" aria-label="StoreOS home">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 focus-ring"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <AnimatePresence>
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-zinc-900/30 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-zinc-200 bg-zinc-50 shadow-pop"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-2 top-3 z-10 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/60"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent props={props} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  )
}
