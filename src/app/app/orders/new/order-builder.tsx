'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import type { ActionState } from '@/lib/types'

interface ProductOption {
  id: string
  title: string
  price: number
  stock: number
  track: boolean
}

type Line =
  | { key: number; kind: 'product'; productId: string; quantity: number; unitPrice: string }
  | { key: number; kind: 'custom'; title: string; quantity: number; unitPrice: string }

export function OrderBuilder({
  action,
  currency,
  products,
  customers,
  defaultCustomer,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  currency: string
  products: ProductOption[]
  customers: { id: string; name: string; phone: string | null }[]
  defaultCustomer?: string
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [nextKey, setNextKey] = useState(1)
  const [discount, setDiscount] = useState('')
  const [shipping, setShipping] = useState('')
  const [picker, setPicker] = useState('')

  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products])

  const addProduct = (id: string) => {
    const p = byId.get(id)
    if (!p) return
    const existing = lines.find(l => l.kind === 'product' && l.productId === id)
    if (existing) {
      setLines(ls => ls.map(l => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l)))
    } else {
      setLines(ls => [...ls, { key: nextKey, kind: 'product', productId: id, quantity: 1, unitPrice: String(p.price) }])
      setNextKey(k => k + 1)
    }
    setPicker('')
  }

  const addCustom = () => {
    setLines(ls => [...ls, { key: nextKey, kind: 'custom', title: '', quantity: 1, unitPrice: '' }])
    setNextKey(k => k + 1)
  }

  const update = (key: number, patch: Partial<Line>) =>
    setLines(ls => ls.map(l => (l.key === key ? ({ ...l, ...patch } as Line) : l)))

  const subtotal = lines.reduce((sum, l) => sum + (Number(l.unitPrice) || 0) * l.quantity, 0)
  const total = Math.max(subtotal - (Number(discount) || 0), 0) + (Number(shipping) || 0)

  const payload = JSON.stringify(
    lines.map(l =>
      l.kind === 'product'
        ? { product_id: l.productId, quantity: l.quantity, unit_price: Number(l.unitPrice) || 0 }
        : { title: l.title, quantity: l.quantity, unit_price: Number(l.unitPrice) || 0 },
    ),
  )

  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <input type="hidden" name="items" value={payload} />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Items" description="Stock is reserved as soon as the order is created." />
          <CardBody className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={picker} onChange={e => addProduct(e.target.value)} aria-label="Add a product" className="flex-1">
                <option value="">Add a product…</option>
                {products.map(p => (
                  <option key={p.id} value={p.id} disabled={p.track && p.stock <= 0}>
                    {p.title} — {formatMoney(p.price, currency)}
                    {p.track ? ` (${p.stock} in stock)` : ''}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={addCustom}>
                <Plus className="h-4 w-4" /> Custom item
              </Button>
            </div>

            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
                No items yet. Pick a product above or add a custom item.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {lines.map(l => {
                  const p = l.kind === 'product' ? byId.get(l.productId) : undefined
                  const over = p?.track && l.quantity > p.stock
                  return (
                    <li key={l.key} className="grid grid-cols-[1fr_auto] gap-3 p-3 sm:grid-cols-[1fr_80px_120px_auto] sm:items-center">
                      <div className="min-w-0">
                        {l.kind === 'product' ? (
                          <>
                            <p className="truncate text-sm font-medium text-zinc-900">{p?.title}</p>
                            {p?.track ? (
                              <p className={over ? 'text-xs text-red-600' : 'text-xs text-zinc-500'}>{p.stock} in stock</p>
                            ) : null}
                          </>
                        ) : (
                          <Input
                            value={l.title}
                            onChange={e => update(l.key, { title: e.target.value })}
                            placeholder="Item name"
                            aria-label="Item name"
                            required
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}
                        className="justify-self-end rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 sm:order-last"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <Input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={e => update(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        aria-label="Quantity"
                      />
                      <Input
                        inputMode="decimal"
                        value={l.unitPrice}
                        onChange={e => update(l.key, { unitPrice: e.target.value })}
                        aria-label="Unit price"
                        placeholder="Price"
                        required
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Delivery & notes" />
          <CardBody className="space-y-4">
            <Field label="Delivery address" htmlFor="shipping_address">
              <Textarea id="shipping_address" name="shipping_address" rows={2} />
            </Field>
            <Field label="Internal note" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} placeholder="Only your team sees this" />
            </Field>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Customer" />
          <CardBody className="space-y-3">
            <Select name="customer_id" defaultValue={defaultCustomer ?? ''} aria-label="Customer">
              <option value="">Walk-in / no customer</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </Select>
            <Link href="/app/customers/new?return_to=/app/orders/new" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
              <Plus className="h-3 w-3" /> New customer
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Order" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Channel" htmlFor="channel">
                <Select id="channel" name="channel" defaultValue="instagram">
                  <option value="instagram">Instagram</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="website">Website</option>
                  <option value="walk_in">Walk-in</option>
                  <option value="manual">Manual</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue="paid">
                  <option value="pending">Pending payment</option>
                  <option value="paid">Paid</option>
                  <option value="fulfilled">Fulfilled</option>
                  <option value="delivered">Delivered</option>
                </Select>
              </Field>
              <Field label="Discount" htmlFor="discount">
                <Input id="discount" name="discount" inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Delivery fee" htmlFor="shipping">
                <Input id="shipping" name="shipping" inputMode="decimal" value={shipping} onChange={e => setShipping(e.target.value)} placeholder="0" />
              </Field>
            </div>
            <dl className="space-y-1.5 border-t border-zinc-100 pt-4 text-sm">
              <div className="flex justify-between text-zinc-600">
                <dt>Subtotal</dt>
                <dd className="tabular">{formatMoney(subtotal, currency)}</dd>
              </div>
              {Number(discount) ? (
                <div className="flex justify-between text-zinc-600">
                  <dt>Discount</dt>
                  <dd className="tabular">−{formatMoney(Number(discount), currency)}</dd>
                </div>
              ) : null}
              {Number(shipping) ? (
                <div className="flex justify-between text-zinc-600">
                  <dt>Delivery</dt>
                  <dd className="tabular">{formatMoney(Number(shipping), currency)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between pt-1 text-base font-semibold text-zinc-900">
                <dt>Total</dt>
                <dd className="tabular">{formatMoney(total, currency)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <SubmitButton className="w-full" disabled={lines.length === 0} pendingText="Creating order…">
          Create order
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
