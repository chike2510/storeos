import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react'
import { Badge, humanize } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Input, Select } from '@/components/ui/input'
import { Alert, PageHeader } from '@/components/ui/misc'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { cn, formatDateTime, formatNumber } from '@/lib/utils'
import type { InventoryMovement, Product } from '@/lib/types'
import { catalogCurrency, getShopifyStoreInfo } from '@/lib/shopify/products'
import { shopifyAdminProductUrl } from '@/lib/shopify/product-writes'
import { adjustStock, deleteProduct, publishProduct, updateProduct } from '../actions'
import { ProductForm } from '../product-form'

export const metadata: Metadata = { title: 'Product' }

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { created?: string; published?: string; publish_error?: string }
}) {
  const { supabase, workspace, role } = await requireWorkspace()
  const { data } = await supabase.from('products').select('*').eq('id', params.id).eq('workspace_id', workspace.id).maybeSingle()
  if (!data) notFound()
  const product = data as Product

  const { data: mv } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('product_id', product.id)
    .order('created_at', { ascending: false })
    .limit(15)
  const movements = (mv ?? []) as InventoryMovement[]

  const fromShopify = product.source === 'shopify'
  const [shop, currency] = await Promise.all([getShopifyStoreInfo(workspace.id), catalogCurrency(workspace)])
  const shopifyUrl = fromShopify ? shopifyAdminProductUrl(shop.shopDomain, product.external_id) : null
  const canPublish = product.source === 'storeos' && shop.connected && canManage(role)
  const { data: vr } = fromShopify
    ? await supabase
        .from('product_variants')
        .select('id, title, stock_quantity, track_inventory')
        .eq('product_id', product.id)
        .order('created_at')
    : { data: null }
  const variants = ((vr ?? []) as { id: string; title: string; stock_quantity: number; track_inventory: boolean }[]).filter(
    v => v.track_inventory,
  )

  return (
    <>
      <PageHeader
        back={
          <Link href="/app/products" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Products
          </Link>
        }
        title={product.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={product.status === 'active' ? 'green' : 'neutral'}>{humanize(product.status)}</Badge>
            {product.is_low_stock ? <Badge tone="amber">Low stock</Badge> : null}
            {product.source !== 'storeos' ? <Badge tone="violet">Synced from {product.source}</Badge> : null}
            {shopifyUrl ? (
              <a href={shopifyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                View in Shopify <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </span>
        }
        actions={
          canManage(role) ? (
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={product.id} />
              <ConfirmButton variant="ghost" size="sm" message={`Delete "${product.title}"? This can't be undone.`} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-4 w-4" /> Delete
              </ConfirmButton>
            </form>
          ) : null
        }
      />

      {searchParams.created ? (
        <Alert tone="success" className="mb-6">
          {searchParams.published ? 'Product created and published to Shopify as a draft.' : 'Product created.'}
        </Alert>
      ) : null}
      {searchParams.publish_error ? (
        <Alert tone="error" className="mb-6" title="Not published to Shopify">
          {searchParams.publish_error}
        </Alert>
      ) : null}
      {fromShopify && !canManage(role) ? (
        <Alert tone="info" className="mb-6">
          This product is synced with Shopify. Only owners and admins can change its title, description, prices, status or tags.
        </Alert>
      ) : null}

      <ProductForm
        action={updateProduct}
        workspaceId={workspace.id}
        currency={currency}
        product={product}
        mode="edit"
        shopifyManaged={fromShopify}
      />

      {canPublish ? (
        <Card className="mt-6">
          <CardHeader
            title="Publish to Shopify"
            description={`Create this product in ${shop.shopName || shop.shopDomain || 'your Shopify store'}. Prices are sent as entered, in ${shop.currency || currency}. After publishing, Shopify owns its title, description, prices, status and tags, and edits here are pushed there.`}
          />
          <CardBody>
            <ActionForm action={publishProduct} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input type="hidden" name="product_id" value={product.id} />
              <Select name="status" defaultValue="draft" aria-label="Status in Shopify" className="sm:w-56">
                <option value="draft">As a draft (hidden)</option>
                <option value="active">As active (visible)</option>
              </Select>
              <SubmitButton variant="secondary" pendingText="Publishing…">
                Publish to Shopify
              </SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      {product.track_inventory ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            <CardHeader title="Stock history" description="Every change to on-hand quantity." />
            {movements.length === 0 ? (
              <CardBody className="text-sm text-zinc-500">No stock movements yet.</CardBody>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {movements.map(m => (
                  <li key={m.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-800">
                        {humanize(m.reason)}
                        {m.reference_type === 'order' && m.reference_id ? (
                          <Link href={`/app/orders/${m.reference_id}`} className="ml-1.5 font-normal text-brand-700 hover:underline">
                            View order
                          </Link>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {formatDateTime(m.created_at)}
                        {m.note ? ` · ${m.note}` : ''}
                      </p>
                    </div>
                    <span className={cn('tabular font-semibold', m.delta > 0 ? 'text-emerald-700' : 'text-zinc-700')}>
                      {m.delta > 0 ? '+' : ''}
                      {formatNumber(m.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="h-fit">
            <CardHeader
              title="Adjust stock"
              description={fromShopify ? `On hand: ${formatNumber(product.stock_quantity)} · changes are pushed to Shopify` : `On hand: ${formatNumber(product.stock_quantity)}`}
            />
            <CardBody>
              <ActionForm action={adjustStock} className="space-y-3" resetOnSuccess>
                <input type="hidden" name="product_id" value={product.id} />
                {fromShopify && variants.length > 1 ? (
                  <Select name="variant_id" aria-label="Variant" required defaultValue="">
                    <option value="" disabled>
                      Choose a variant
                    </option>
                    {variants.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.title} · {formatNumber(v.stock_quantity)} on hand
                      </option>
                    ))}
                  </Select>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Select name="mode" defaultValue="add" aria-label="Adjustment type">
                    <option value="add">Add</option>
                    <option value="remove">Remove</option>
                    <option value="set">Set to</option>
                  </Select>
                  <Input name="quantity" inputMode="numeric" placeholder="Qty" aria-label="Quantity" required />
                </div>
                <Input name="note" placeholder="Note (optional)" aria-label="Note" />
                <SubmitButton variant="secondary" className="w-full">
                  Update stock
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </>
  )
}
