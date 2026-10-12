'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireWorkspace } from '@/lib/workspace'
import { num, str } from '@/lib/utils'
import type { ActionState, OrderStatus } from '@/lib/types'

const itemSchema = z.union([
  z.object({ product_id: z.string().uuid(), quantity: z.number().int().positive(), unit_price: z.number().min(0).optional() }),
  z.object({ title: z.string().min(1).max(200), quantity: z.number().int().positive(), unit_price: z.number().min(0) }),
])

const CHANNELS = ['manual', 'instagram', 'whatsapp', 'website', 'walk_in', 'other'] as const

export async function createOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  let items: unknown
  try {
    items = JSON.parse(str(fd.get('items')) || '[]')
  } catch {
    return { error: 'Invalid line items' }
  }
  const parsedItems = z.array(itemSchema).min(1, 'Add at least one item').safeParse(items)
  if (!parsedItems.success) return { error: parsedItems.error.issues[0].message }

  const status = str(fd.get('status')) as OrderStatus
  if (!['pending', 'paid', 'fulfilled', 'delivered'].includes(status)) return { error: 'Choose a valid status' }
  const channel = str(fd.get('channel'))
  if (!(CHANNELS as readonly string[]).includes(channel)) return { error: 'Choose a valid channel' }

  const discount = num(fd.get('discount')) ?? 0
  const shipping = num(fd.get('shipping')) ?? 0
  if (discount < 0 || shipping < 0) return { error: 'Discount and shipping cannot be negative' }

  const { supabase, workspace } = await requireWorkspace()
  const { data, error } = await supabase.rpc('create_order', {
    p_workspace: workspace.id,
    p_customer: str(fd.get('customer_id')) || null,
    p_items: parsedItems.data,
    p_status: status,
    p_channel: channel,
    p_discount: discount,
    p_shipping: shipping,
    p_notes: str(fd.get('notes')),
    p_shipping_address: str(fd.get('shipping_address')) || null,
  })
  if (error || !data) return { error: error?.message ?? 'Could not create the order' }

  revalidatePath('/app/orders')
  revalidatePath('/app/products')
  redirect(`/app/orders/${data}?created=1`)
}

export async function setOrderStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd.get('order_id'))
  const status = str(fd.get('status')) as OrderStatus
  const restock = fd.get('restock') === 'on'
  const amount = num(fd.get('refund_amount'))
  const note = str(fd.get('note')) || null
  if (status === 'refunded' && amount !== null && amount <= 0) return { error: 'Refund amount must be greater than zero' }

  const { supabase } = await requireWorkspace()
  const { error } = await supabase.rpc('set_order_status', {
    p_order: id,
    p_status: status,
    p_restock: status === 'cancelled' ? true : restock,
    p_refund_amount: amount,
    p_note: note,
  })
  if (error) return { error: error.message }

  revalidatePath(`/app/orders/${id}`)
  revalidatePath('/app/orders')
  revalidatePath('/app')
  return { ok: true, message: `Order marked ${status}.` }
}
