import { ImageUpload } from '@/components/app/image-upload'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import type { ActionState, Product } from '@/lib/types'

export interface ProductDefaults {
  title?: string
  description?: string
  category?: string | null
  sku?: string | null
  status?: Product['status']
  price?: number | null
  compare_at_price?: number | null
  cost?: number | null
  track_inventory?: boolean
  low_stock_threshold?: number
  image_url?: string | null
  image_path?: string | null
  tags?: string[]
}

export function ProductForm({
  action,
  workspaceId,
  currency,
  product,
  defaults = {},
  mode,
  origin,
  defaultThreshold = 5,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  workspaceId: string
  currency: string
  product?: Product
  defaults?: ProductDefaults
  mode: 'create' | 'edit'
  origin?: string
  defaultThreshold?: number
}) {
  const d: ProductDefaults = product ?? defaults
  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      {origin ? <input type="hidden" name="origin" value={origin} /> : null}
      <div className="space-y-6">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-4">
            <Field label="Title" htmlFor="title">
              <Input id="title" name="title" required maxLength={200} defaultValue={d.title ?? ''} placeholder="e.g. Ankara wrap dress" />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" rows={5} defaultValue={d.description ?? ''} placeholder="What it is, what it's made of, how it fits…" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="category">
                <Input id="category" name="category" defaultValue={d.category ?? ''} placeholder="Apparel" />
              </Field>
              <Field label="Tags" htmlFor="tags" hint="Comma separated">
                <Input id="tags" name="tags" defaultValue={(d.tags ?? []).join(', ')} placeholder="summer, linen" />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pricing" description={`All amounts in ${currency}.`} />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Field label="Price" htmlFor="price">
              <Input id="price" name="price" inputMode="decimal" required defaultValue={d.price ?? ''} placeholder="0" />
            </Field>
            <Field label="Compare-at price" htmlFor="compare_at_price" hint="Optional">
              <Input id="compare_at_price" name="compare_at_price" inputMode="decimal" defaultValue={d.compare_at_price ?? ''} />
            </Field>
            <Field label="Cost per item" htmlFor="cost" hint="Optional, for margins">
              <Input id="cost" name="cost" inputMode="decimal" defaultValue={d.cost ?? ''} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Inventory" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="SKU" htmlFor="sku">
                <Input id="sku" name="sku" defaultValue={d.sku ?? ''} />
              </Field>
              {mode === 'create' ? (
                <Field label="Opening stock" htmlFor="initial_stock">
                  <Input id="initial_stock" name="initial_stock" inputMode="numeric" defaultValue="0" />
                </Field>
              ) : null}
              <Field label="Low-stock alert at" htmlFor="low_stock_threshold">
                <Input
                  id="low_stock_threshold"
                  name="low_stock_threshold"
                  inputMode="numeric"
                  defaultValue={d.low_stock_threshold ?? defaultThreshold}
                />
              </Field>
            </div>
            <Checkbox
              name="track_inventory"
              defaultChecked={d.track_inventory ?? true}
              label="Track quantity"
              description="Orders decrement stock and can't oversell."
            />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Status" />
          <CardBody>
            <Select name="status" defaultValue={d.status ?? 'active'} aria-label="Status">
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </Select>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Image" />
          <CardBody>
            <ImageUpload workspaceId={workspaceId} defaultUrl={d.image_url} defaultPath={d.image_path} />
          </CardBody>
        </Card>
        <SubmitButton className="w-full" pendingText="Saving…">
          {mode === 'create' ? 'Create product' : 'Save changes'}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
