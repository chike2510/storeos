import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const CURRENCIES = [
  { code: 'NGN', label: 'Nigerian Naira (₦)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GHS', label: 'Ghanaian Cedi (GH₵)' },
  { code: 'KES', label: 'Kenyan Shilling (KSh)' },
  { code: 'ZAR', label: 'South African Rand (R)' },
  { code: 'CAD', label: 'Canadian Dollar (CA$)' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
] as const

export function formatMoney(amount: number | string | null | undefined, currency = 'NGN', opts: { compact?: boolean } = {}) {
  const value = typeof amount === 'string' ? Number(amount) : amount ?? 0
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.compact ? 1 : value % 1 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0)
  } catch {
    return `${currency} ${(value || 0).toLocaleString()}`
  }
}

export function formatNumber(n: number | null | undefined) {
  return new Intl.NumberFormat('en').format(n ?? 0)
}

export function formatDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en', opts).format(new Date(d))
}

export function formatDateTime(d: string | Date | null | undefined) {
  return formatDate(d, { dateStyle: 'medium', timeStyle: 'short' })
}

export function timeAgo(d: string | Date | null | undefined) {
  if (!d) return '—'
  const diff = (Date.now() - new Date(d).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return formatDate(d)
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('')
}

export function orderLabel(n: number | null | undefined) {
  return n ? `#${n}` : '#—'
}

/** Parse a number from a form field; returns null for blank/invalid. */
export function num(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).replace(/,/g, '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function str(v: FormDataEntryValue | null): string {
  return v === null ? '' : String(v).trim()
}
