import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/misc'
import { requireWorkspace } from '@/lib/workspace'
import { createOrder } from '../actions'
import { OrderBuilder } from './order-builder'

export const metadata: Metadata = { title: 'New order' }

export default async function NewOrderPage({ searchParams }: { searchParams: { customer?: string } }) {
  const { supabase, workspace } = await requireWorkspace()
  const [{ data: products }, { data: customers }] = await Promise.all([
    supabase
      .from('products')
      .select('id, title, price, stock_quantity, track_inventory')
      .eq('workspace_id', workspace.id)
      .eq('status', 'active')
      .order('title')
      .limit(500),
    supabase.from('customers').select('id, name, phone').eq('workspace_id', workspace.id).order('name').limit(500),
  ])

  return (
    <>
      <PageHeader
        back={
          <Link href="/app/orders" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Orders
          </Link>
        }
        title="Create order"
        description="Record a sale from Instagram, WhatsApp, your site or in person."
      />
      <OrderBuilder
        action={createOrder}
        currency={workspace.currency}
        defaultCustomer={searchParams.customer}
        customers={(customers ?? []) as { id: string; name: string; phone: string | null }[]}
        products={(products ?? []).map(p => ({
          id: p.id as string,
          title: p.title as string,
          price: Number(p.price),
          stock: Number(p.stock_quantity),
          track: Boolean(p.track_inventory),
        }))}
      />
    </>
  )
}
