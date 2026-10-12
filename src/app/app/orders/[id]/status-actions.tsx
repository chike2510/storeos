'use client'

import { useState } from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Checkbox, Field, Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import type { ActionState, OrderStatus } from '@/lib/types'

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'fulfilled', 'cancelled'],
  paid: ['fulfilled', 'delivered', 'cancelled', 'refunded'],
  fulfilled: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

const LABEL: Record<OrderStatus, string> = {
  pending: 'Mark pending',
  paid: 'Mark as paid',
  fulfilled: 'Mark as fulfilled',
  delivered: 'Mark as delivered',
  cancelled: 'Cancel order',
  refunded: 'Refund',
}

export function StatusActions({
  action,
  orderId,
  status,
  total,
  currency,
  managedBy = null,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  orderId: string
  status: OrderStatus
  total: number
  currency: string
  /** 'shopify': status is synced from Shopify; only refunds (via Shopify) are offered here. */
  managedBy?: 'shopify' | null
}) {
  const [refunding, setRefunding] = useState(false)
  const shopify = managedBy === 'shopify'
  const options: OrderStatus[] = shopify
    ? ['paid', 'fulfilled', 'delivered', 'refunded'].includes(status) && total > 0
      ? ['refunded']
      : []
    : NEXT[status]
  const forward = options.filter(s => s !== 'cancelled' && s !== 'refunded')

  if (shopify && options.length === 0) {
    return (
      <Card>
        <CardHeader title="Status" />
        <CardBody className="text-sm text-zinc-500">Synced from Shopify. Fulfil, cancel or edit this order in Shopify — StoreOS updates automatically.</CardBody>
      </Card>
    )
  }

  if (options.length === 0) {
    return (
      <Card>
        <CardHeader title="Status" />
        <CardBody className="text-sm text-zinc-500">This order is {status}. No further changes are possible.</CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Update status" />
      <CardBody className="space-y-2">
        {forward.map((s, i) => (
          <ActionForm key={s} action={action}>
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="status" value={s} />
            <SubmitButton className="w-full" variant={i === 0 ? 'primary' : 'secondary'}>
              {LABEL[s]}
            </SubmitButton>
          </ActionForm>
        ))}

        {options.includes('cancelled') ? (
          <ActionForm action={action}>
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="status" value="cancelled" />
            <SubmitButton
              className="w-full"
              variant="ghost"
              onClick={e => {
                if (!window.confirm('Cancel this order? Items go back into stock.')) e.preventDefault()
              }}
            >
              Cancel order
            </SubmitButton>
          </ActionForm>
        ) : null}

        {options.includes('refunded') ? (
          refunding ? (
            <ActionForm action={action} className="space-y-3 rounded-lg border border-zinc-200 p-3">
              <input type="hidden" name="order_id" value={orderId} />
              <input type="hidden" name="status" value="refunded" />
              <Field
                label="Refund amount"
                htmlFor="refund_amount"
                hint={shopify ? `Up to ${formatMoney(total, currency)} · refunded to the customer through Shopify` : `Order total ${formatMoney(total, currency)}`}
              >
                <Input id="refund_amount" name="refund_amount" inputMode="decimal" defaultValue={total} />
              </Field>
              <Input name="note" placeholder="Reason (optional)" aria-label="Reason" />
              {shopify ? null : <Checkbox name="restock" defaultChecked label="Return items to stock" />}
              <div className="flex gap-2">
                <SubmitButton variant="danger" className="flex-1">
                  Refund
                </SubmitButton>
                <button type="button" onClick={() => setRefunding(false)} className="px-3 text-sm text-zinc-500 hover:text-zinc-900">
                  Cancel
                </button>
              </div>
            </ActionForm>
          ) : (
            <button
              type="button"
              onClick={() => setRefunding(true)}
              className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Refund…
            </button>
          )
        ) : null}
        <p className="pt-1 text-xs text-zinc-400">
          {shopify
            ? 'Synced from Shopify. Fulfil or cancel in Shopify; refunds here move money through Shopify (owners and admins).'
            : 'Refunds are recorded here; send the money back through your payment provider.'}
        </p>
      </CardBody>
    </Card>
  )
}
