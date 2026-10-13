import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, Package, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState, PageHeader, Thumb } from '@/components/ui/misc'
import { TD, TH, THead, TR, Table } from '@/components/ui/table'
import { requireWorkspace } from '@/lib/workspace'
import { cn, formatMoney, formatNumber } from '@/lib/utils'
import type { Product } from '@/lib/types'
import { catalogCurrency } from '@/lib/shopify/products'

export const metadata: Metadata = { title: 'Products' }

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'low', label: 'Low stock' },
  { key: 'archived', label: 'Archived' },
] as const

export default async function ProductsPage({ searchParams }: { searchParams: { q?: string; filter?: string } }) {
  const { supabase, workspace } = await requireWorkspace()
  const filter = searchParams.filter ?? 'all'
  const q = (searchParams.q ?? '').trim()

  let query = supabase.from('products').select('*').eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(200)
  if (filter === 'low') query = query.eq('is_low_stock', true).neq('status', 'archived')
  else if (filter === 'all') query = query.neq('status', 'archived')
  else query = query.eq('status', filter)
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, '')}%,sku.ilike.%${q.replace(/[%,()]/g, '')}%`)

  const [{ data }, currency] = await Promise.all([query, catalogCurrency(workspace)])
  const products = (data ?? []) as Product[]

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue, prices and stock levels."
        actions={
          <>
            <ButtonLink href="/app/studio" variant="secondary">
              Create with AI
            </ButtonLink>
            <ButtonLink href="/app/products/new">
              <Plus className="h-4 w-4" /> Add product
            </ButtonLink>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {FILTERS.map(f => (
              <Link
                key={f.key}
                href={`/app/products?filter=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className={cn(
                  'whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
                  filter === f.key ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100',
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <form className="relative sm:w-64">
            <input type="hidden" name="filter" value={filter} />
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input name="q" defaultValue={q} placeholder="Search title or SKU" className="pl-8" />
          </form>
        </div>

        {products.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title={q || filter !== 'all' ? 'No products match' : 'No products yet'}
            description={q || filter !== 'all' ? 'Try a different search or filter.' : 'Add your first product, or snap a photo and let Product Studio write the listing.'}
            action={
              q || filter !== 'all' ? undefined : (
                <ButtonLink href="/app/products/new">
                  <Plus className="h-4 w-4" /> Add product
                </ButtonLink>
              )
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH className="hidden md:table-cell">Status</TH>
                <TH className="text-right">Stock</TH>
                <TH className="text-right">Price</TH>
                <TH className="hidden lg:table-cell">Category</TH>
              </tr>
            </THead>
            <tbody>
              {products.map(p => (
                <TR key={p.id} className="hover:bg-zinc-50/70">
                  <TD>
                    <Link href={`/app/products/${p.id}`} className="flex items-center gap-3">
                      <Thumb src={p.image_url} alt={p.title} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-zinc-900">{p.title}</span>
                        {p.sku ? <span className="block text-xs text-zinc-500">{p.sku}</span> : null}
                      </span>
                    </Link>
                  </TD>
                  <TD className="hidden md:table-cell">
                    <Badge tone={p.status === 'active' ? 'green' : p.status === 'draft' ? 'neutral' : 'neutral'}>
                      {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                    </Badge>
                  </TD>
                  <TD className="tabular text-right">
                    {p.track_inventory ? (
                      <span className={cn('inline-flex items-center gap-1.5', p.is_low_stock && 'font-medium text-amber-700')}>
                        {p.is_low_stock ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                        {formatNumber(p.stock_quantity)}
                      </span>
                    ) : (
                      <span className="text-zinc-400">Not tracked</span>
                    )}
                  </TD>
                  <TD className="tabular text-right font-medium text-zinc-900">{formatMoney(p.price, currency)}</TD>
                  <TD className="hidden text-zinc-500 lg:table-cell">{p.category || '—'}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
