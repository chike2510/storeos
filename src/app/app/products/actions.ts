'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { num, str } from '@/lib/utils'
import type { ActionState } from '@/lib/types'

const productSchema = z.object({
  title: z.string().min(1, 'Give the product a title').max(200),
  description: z.string().max(5000),
  category: z.string().max(80).nullable(),
  sku: z.string().max(80).nullable(),
  status: z.enum(['active', 'draft', 'archived']),
  price: z.number({ required_error: 'Enter a price', invalid_type_error: 'Enter a price' }).min(0, 'Price cannot be negative'),
  compare_at_price: z.number().min(0).nullable(),
  cost: z.number().min(0).nullable(),
  track_inventory: z.boolean(),
  low_stock_threshold: z.number().int().min(0),
  image_url: z.string().url().nullable(),
  image_path: z.string().nullable(),
  tags: z.array(z.string()),
})

function parseProduct(fd: FormData) {
  return productSchema.safeParse({
    title: str(fd.get('title')),
    description: str(fd.get('description')),
    category: str(fd.get('category')) || null,
    sku: str(fd.get('sku')) || null,
    status: str(fd.get('status')) || 'active',
    price: num(fd.get('price')) ?? undefined,
    compare_at_price: num(fd.get('compare_at_price')),
    cost: num(fd.get('cost')),
    track_inventory: fd.get('track_inventory') === 'on',
    low_stock_threshold: Math.max(0, Math.floor(num(fd.get('low_stock_threshold')) ?? 5)),
    image_url: str(fd.get('image_url')) || null,
    image_path: str(fd.get('image_path')) || null,
    tags: str(fd.get('tags'))
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20),
  })
}

export async function createProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseProduct(fd)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, workspace, user } = await requireWorkspace()

  const { data, error } = await supabase
    .from('products')
    .insert({ ...parsed.data, workspace_id: workspace.id, created_by: user.id })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) return { error: error?.message ?? 'Could not create the product' }

  const initial = Math.floor(num(fd.get('initial_stock')) ?? 0)
  if (initial !== 0) {
    await supabase.rpc('adjust_stock', { p_product: data.id, p_delta: initial, p_reason: 'initial', p_note: 'Opening stock' })
  }
  await supabase.from('audit_events').insert({
    workspace_id: workspace.id,
    actor_type: 'user',
    actor_id: user.id,
    action: 'product.created',
    entity_type: 'product',
    entity_id: data.id,
    metadata: { title: parsed.data.title, source: str(fd.get('origin')) || 'manual' },
  })

  revalidatePath('/app/products')
  redirect(`/app/products/${data.id}?created=1`)
}

export async function updateProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd.get('id'))
  const parsed = parseProduct(fd)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, workspace, user } = await requireWorkspace()

  const { error } = await supabase.from('products').update(parsed.data).eq('id', id).eq('workspace_id', workspace.id)
  if (error) return { error: error.message }

  await supabase.from('audit_events').insert({
    workspace_id: workspace.id,
    actor_type: 'user',
    actor_id: user.id,
    action: 'product.updated',
    entity_type: 'product',
    entity_id: id,
  })
  revalidatePath('/app/products')
  revalidatePath(`/app/products/${id}`)
  return { ok: true, message: 'Product saved.' }
}

export async function adjustStock(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd.get('product_id'))
  const qty = Math.floor(num(fd.get('quantity')) ?? 0)
  const mode = str(fd.get('mode')) // 'add' | 'remove' | 'set'
  const note = str(fd.get('note')) || null
  if (!qty && mode !== 'set') return { error: 'Enter a quantity' }
  if (qty < 0) return { error: 'Use a positive number' }

  const { supabase, workspace } = await requireWorkspace()
  const { data: product } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', id)
    .eq('workspace_id', workspace.id)
    .single<{ stock_quantity: number }>()
  if (!product) return { error: 'Product not found' }

  const delta = mode === 'set' ? qty - product.stock_quantity : mode === 'remove' ? -qty : qty
  if (delta === 0) return { ok: true, message: 'Stock unchanged.' }
  const reason = mode === 'add' ? 'restock' : 'adjustment'

  const { data: newStock, error } = await supabase.rpc('adjust_stock', { p_product: id, p_delta: delta, p_reason: reason, p_note: note })
  if (error) return { error: error.message }

  revalidatePath(`/app/products/${id}`)
  revalidatePath('/app/products')
  return { ok: true, message: `Stock is now ${newStock}.` }
}

export async function deleteProduct(fd: FormData) {
  const id = str(fd.get('id'))
  const { supabase, workspace, role, user } = await requireWorkspace()
  if (!canManage(role)) throw new Error('Only owners and admins can delete products')

  const { data } = await supabase
    .from('products')
    .select('image_path, title')
    .eq('id', id)
    .eq('workspace_id', workspace.id)
    .single<{ image_path: string | null; title: string }>()
  await supabase.from('products').delete().eq('id', id).eq('workspace_id', workspace.id)
  if (data?.image_path) await supabase.storage.from('product-images').remove([data.image_path])
  await supabase.from('audit_events').insert({
    workspace_id: workspace.id,
    actor_type: 'user',
    actor_id: user.id,
    action: 'product.deleted',
    entity_type: 'product',
    entity_id: id,
    metadata: { title: data?.title },
  })
  revalidatePath('/app/products')
  redirect('/app/products')
}
