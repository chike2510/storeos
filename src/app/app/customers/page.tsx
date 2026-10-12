import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Search, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, EmptyState, PageHeader } from '@/components/ui/misc'
import { TD, TH, THead, TR, Table } from '@/components/ui/table'
import { requireWorkspace } from '@/lib/workspace'
import { formatMoney, formatNumber, timeAgo } from '@/lib/utils'
import type { Customer, CustomerStats } from '@/lib/types'

export const metadata: Metadata = { title: 'Customers' }

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string } }) {
  const { supabase, workspace } = await requireWorkspace()
  const q = (searchParams.q ?? '').trim().replace(/[%,()]/g, '')

  let query = supabase.from('customers').select('*').eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(200)
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,instagram_handle.ilike.%${q}%`)
  const { data } = await query
  const customers = (data ?? []) as Customer[]

  const { data: statsRows } = customers.length
    ? await supabase.from('customer_stats').select('*').in('customer_id', customers.map(c => c.id))
    : { data: [] }
  const stats = new Map(((statsRows ?? []) as CustomerStats[]).map(s => [s.customer_id, s]))

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who has bought from you or messaged you."
        actions={
          <ButtonLink href="/app/customers/new">
            <Plus className="h-4 w-4" /> Add customer
          </ButtonLink>
        }
      />
      <Card>
        <div className="border-b border-zinc-100 p-3">
          <form className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input name="q" defaultValue={searchParams.q ?? ''} placeholder="Search name, phone, email, @handle" className="pl-8" />
          </form>
        </div>
        {customers.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={q ? 'No customers match' : 'No customers yet'}
            description={q ? 'Try another search.' : 'Customers appear here when you add them or create an order for them.'}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Customer</TH>
                <TH className="hidden md:table-cell">Contact</TH>
                <TH className="text-right">Orders</TH>
                <TH className="text-right">Spent</TH>
                <TH className="hidden text-right sm:table-cell">Last order</TH>
              </tr>
            </THead>
            <tbody>
              {customers.map(c => {
                const s = stats.get(c.id)
                return (
                  <TR key={c.id} className="hover:bg-zinc-50/70">
                    <TD>
                      <Link href={`/app/customers/${c.id}`} className="flex items-center gap-3">
                        <Avatar name={c.name} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-medium text-zinc-900">
                            <span className="truncate">{c.name}</span>
                            {c.sentiment === 'negative' ? <Badge tone="red">At risk</Badge> : null}
                          </span>
                          {c.instagram_handle ? <span className="block text-xs text-zinc-500">{c.instagram_handle}</span> : null}
                        </span>
                      </Link>
                    </TD>
                    <TD className="hidden text-zinc-500 md:table-cell">{c.phone || c.email || '—'}</TD>
                    <TD className="tabular text-right">{formatNumber(Number(s?.orders_count ?? 0))}</TD>
                    <TD className="tabular text-right font-medium text-zinc-900">{formatMoney(Number(s?.total_spent ?? 0), workspace.currency)}</TD>
                    <TD className="hidden text-right text-zinc-500 sm:table-cell">{s?.last_order_at ? timeAgo(s.last_order_at) : '—'}</TD>
                  </TR>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
