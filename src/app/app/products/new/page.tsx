import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/misc'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { catalogCurrency, getShopifyStoreInfo } from '@/lib/shopify/products'
import { createProduct } from '../actions'
import { ProductForm } from '../product-form'

export const metadata: Metadata = { title: 'New product' }

export default async function NewProductPage() {
  const { supabase, workspace, role } = await requireWorkspace()
  const [{ data: policy }, shop, currency] = await Promise.all([
    supabase.from('policies').select('default_low_stock_threshold').eq('workspace_id', workspace.id).maybeSingle(),
    getShopifyStoreInfo(workspace.id),
    catalogCurrency(workspace),
  ])
  return (
    <>
      <PageHeader
        back={
          <Link href="/app/products" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Products
          </Link>
        }
        title="Add product"
      />
      <ProductForm
        action={createProduct}
        workspaceId={workspace.id}
        currency={currency}
        mode="create"
        publishTo={shop.connected && canManage(role) ? { shopName: shop.shopName } : undefined}
        defaultThreshold={policy?.default_low_stock_threshold ?? 5}
      />
    </>
  )
}
