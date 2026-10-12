import {
  BarChart3,
  Inbox,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  badgeKey?: 'approvals' | 'inbox'
}

export const NAV_SECTIONS: { label?: string; items: NavItem[] }[] = [
  {
    items: [{ href: '/app', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Store',
    items: [
      { href: '/app/products', label: 'Products', icon: Package },
      { href: '/app/orders', label: 'Orders', icon: ShoppingBag },
      { href: '/app/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Support',
    items: [
      { href: '/app/inbox', label: 'Inbox', icon: Inbox, badgeKey: 'inbox' },
      { href: '/app/approvals', label: 'Approvals', icon: ShieldCheck, badgeKey: 'approvals' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { href: '/app/studio', label: 'Product Studio', icon: Sparkles },
      { href: '/app/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { href: '/app/settings', label: 'Settings', icon: Settings }
