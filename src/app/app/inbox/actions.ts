'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireWorkspace } from '@/lib/workspace'
import { triageConversation } from '@/lib/support'
import { rateLimit } from '@/lib/rate-limit'
import { str } from '@/lib/utils'
import type { ActionState } from '@/lib/types'

const CHANNELS = ['manual', 'instagram', 'whatsapp', 'email', 'website', 'other'] as const

const newSchema = z.object({
  customer_id: z.string().uuid().nullable(),
  new_customer_name: z.string().max(160),
  new_customer_contact: z.string().max(160),
  channel: z.enum(CHANNELS),
  subject: z.string().max(200),
  body: z.string().min(1, 'Paste the customer message').max(8000),
  triage: z.boolean(),
})

async function runTriage(conversationId: string) {
  const ctx = await requireWorkspace()
  if (!rateLimit(`triage:${ctx.user.id}`, 20).allowed) throw new Error('AI rate limit reached. Try again in a minute.')
  return triageConversation(ctx, conversationId)
}

export async function createConversation(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = newSchema.safeParse({
    customer_id: str(fd.get('customer_id')) || null,
    new_customer_name: str(fd.get('new_customer_name')),
    new_customer_contact: str(fd.get('new_customer_contact')),
    channel: str(fd.get('channel')) || 'manual',
    subject: str(fd.get('subject')),
    body: str(fd.get('body')),
    triage: fd.get('triage') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const input = parsed.data
  const { supabase, workspace, user } = await requireWorkspace()

  let customerId = input.customer_id
  if (!customerId && input.new_customer_name) {
    const contact = input.new_customer_contact
    const { data: c, error } = await supabase
      .from('customers')
      .insert({
        workspace_id: workspace.id,
        name: input.new_customer_name,
        email: contact.includes('@') && !contact.startsWith('@') ? contact.toLowerCase() : null,
        instagram_handle: contact.startsWith('@') ? contact : null,
        phone: contact && !contact.includes('@') ? contact : null,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) return { error: error.message }
    customerId = c.id
  }

  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspace.id,
      customer_id: customerId,
      channel: input.channel,
      subject: input.subject || input.body.slice(0, 60),
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !conv) return { error: error?.message ?? 'Could not create the conversation' }

  const { error: msgErr } = await supabase.from('messages').insert({
    workspace_id: workspace.id,
    conversation_id: conv.id,
    direction: 'inbound',
    author_type: 'customer',
    body: input.body,
  })
  if (msgErr) return { error: msgErr.message }

  await supabase.from('audit_events').insert({
    workspace_id: workspace.id,
    actor_type: 'user',
    actor_id: user.id,
    action: 'conversation.created',
    entity_type: 'conversation',
    entity_id: conv.id,
    metadata: { channel: input.channel },
  })

  let triageError = ''
  if (input.triage) {
    try {
      await runTriage(conv.id)
    } catch (e) {
      triageError = e instanceof Error ? e.message : 'AI triage failed'
    }
  }

  revalidatePath('/app/inbox')
  redirect(`/app/inbox/${conv.id}${triageError ? `?triage_error=${encodeURIComponent(triageError)}` : ''}`)
}

export async function triage(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd.get('conversation_id'))
  try {
    const out = await runTriage(id)
    revalidatePath(`/app/inbox/${id}`)
    revalidatePath('/app/approvals')
    return {
      ok: true,
      message: out.autoSent
        ? 'Low-risk reply sent automatically.'
        : `Draft sent to Approvals${out.notes.length ? `: ${out.notes.join(', ')}` : ''}.`,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'AI triage failed' }
  }
}

export async function addMessage(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd.get('conversation_id'))
  const body = str(fd.get('body'))
  const kind = str(fd.get('kind')) // 'reply' | 'inbound' | 'note'
  if (!body) return { error: 'Write a message first' }
  if (body.length > 8000) return { error: 'Message is too long' }

  const { supabase, workspace, user } = await requireWorkspace()
  const direction = kind === 'inbound' ? 'inbound' : kind === 'note' ? 'internal' : 'outbound'
  const { error } = await supabase.from('messages').insert({
    workspace_id: workspace.id,
    conversation_id: id,
    direction,
    author_type: kind === 'inbound' ? 'customer' : 'user',
    author_id: kind === 'inbound' ? null : user.id,
    body,
  })
  if (error) return { error: error.message }

  if (kind === 'inbound') {
    await supabase.from('conversations').update({ status: 'open' }).eq('id', id)
    if (fd.get('triage') === 'on') {
      try {
        await runTriage(id)
      } catch (e) {
        revalidatePath(`/app/inbox/${id}`)
        return { error: `Message logged, but AI triage failed: ${e instanceof Error ? e.message : 'unknown error'}` }
      }
    }
  } else if (kind === 'reply' && fd.get('resolve') === 'on') {
    await supabase.from('conversations').update({ status: 'resolved' }).eq('id', id)
  }

  revalidatePath(`/app/inbox/${id}`)
  revalidatePath('/app/inbox')
  return { ok: true }
}

export async function setConversationStatus(fd: FormData) {
  const id = str(fd.get('conversation_id'))
  const status = str(fd.get('status'))
  if (!['open', 'resolved', 'closed'].includes(status)) return
  const { supabase, workspace } = await requireWorkspace()
  await supabase.from('conversations').update({ status }).eq('id', id).eq('workspace_id', workspace.id)
  revalidatePath(`/app/inbox/${id}`)
  revalidatePath('/app/inbox')
}
