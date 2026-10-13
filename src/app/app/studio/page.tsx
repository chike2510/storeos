import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/misc'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { catalogCurrency, getShopifyStoreInfo } from '@/lib/shopify/products'
import { aiConfig } from '@/lib/ai/config'
import { createProduct } from '../products/actions'
import { Studio } from './studio'

export const metadata: Metadata = { title: 'Product Studio' }

export default async function StudioPage() {
  const { workspace, role } = await requireWorkspace()
  const ai = aiConfig()
  const [shop, currency] = await Promise.all([getShopifyStoreInfo(workspace.id), catalogCurrency(workspace)])
  return (
    <>
      <PageHeader title="Product Studio" description="Turn a product photo into a ready-to-sell listing." />
      <Studio
        workspaceId={workspace.id}
        currency={currency}
        publishTo={shop.connected && canManage(role) ? { shopName: shop.shopName } : undefined}
        saveAction={createProduct}
        demo={ai.mode === 'demo'}
        aiLabel={ai.mode === 'demo' ? 'Demo AI' : `${ai.provider} · ${ai.visionModel}`}
      />
    </>
  )
}
