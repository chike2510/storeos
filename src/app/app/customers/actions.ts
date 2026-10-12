'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { canManage, requireWorkspace } from '@/lib/workspace'
import { str } from '@/lib/utils'
import type { ActionState } from '@/lib/types'

const schema = z.object({
  name: z.string().min(1, 'Enter a name').max(160),
  email: z.string().email('Enter a valid email').nullable(),
  phone: z.string().max(40).nullable(),
  instagram_handle: z.string().max(60).nullable(),
  address: z.string().max(500).nullable(),
  notes: z.string().max(4000),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  tags: z.array(z.string()),
})

function parse(fd: FormData) {
  const ig = str(fd.get('instagram_handle'))
  return schema.safeParse({
    name: str(fd.get('name')),
    email: str(fd.get('email')).toLowerCase() || null,
    phone: str(fd.get('phone')) || null,
    instagram_handle: ig ? (ig.startsWith('@') ? ig : `@${ig}`) : null,
    address: str(fd.get('address')) || null,
    notes: str(fd.get('notes')),
    sentiment: str(fd.get('sentiment')) || 'neutral',
    tags: str(fd.get('tags'))
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20),
  })
}

export async function createCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parse(fd)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, workspace, user } = await requireWorkspace()
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...parsed.data, workspace_id: workspace.id })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) return { error: error?.message ?? 'Could not save the customer' }
  await supabase.from('audit_events').insert({
    workspace_id: workspace.id,
    actor_type: 'user',
    actor_id: user.id,
    action: 'customer.created',
    entity_type: 'customer',
    entity_id: data.id,
  })
  revalidatePath('/app/customers')
  const back = str(fd.get('return_to'))
  if (back.startsWith('/app/')) redirect(`${back}${back.includes('?') ? '&' : '?'}customer=${data.id}`)
  redirect(`/app/customers/${data.id}`)
}

export async function updateCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd.get('id'))
  const parsed = parse(fd)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, workspace } = await requireWorkspace()
  const { error } = await supabase.from('customers').update(parsed.data).eq('id', id).eq('workspace_id', workspace.id)
  if (error) return { error: error.message }
  revalidatePath(`/app/customers/${id}`)
  return { ok: true, message: 'Customer saved.' }
}

export async function deleteCustomer(fd: FormData) {
  const id = str(fd.get('id'))
  const { supabase, workspace, role, user } = await requireWorkspace()
  if (!canManage(role)) throw new Error('Only owners and admins can delete customers')
  await supabase.from('customers').delete().eq('id', id).eq('workspace_id', workspace.id)
  await supabase.from('audit_events').insert({
    workspace_id: workspace.id,
    actor_type: 'user',
    actor_id: user.id,
    action: 'customer.deleted',
    entity_type: 'customer',
    entity_id: id,
  })
  revalidatePath('/app/customers')
  redirect('/app/customers')
}
