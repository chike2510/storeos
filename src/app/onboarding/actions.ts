'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { WORKSPACE_COOKIE, requireUser } from '@/lib/workspace'
import { CURRENCIES } from '@/lib/utils'
import type { ActionState } from '@/lib/types'

const schema = z.object({
  name: z.string().trim().min(1, 'Give your store a name').max(80),
  currency: z.enum(CURRENCIES.map(c => c.code) as [string, ...string[]]),
  business_type: z.enum(['standalone', 'shopify']),
  demo: z.boolean(),
})

export async function createWorkspace(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    name: formData.get('name'),
    currency: formData.get('currency'),
    business_type: formData.get('business_type') ?? 'standalone',
    demo: formData.get('demo') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase } = await requireUser()
  const { data: workspaceId, error } = await supabase.rpc('create_workspace', {
    p_name: parsed.data.name,
    p_currency: parsed.data.currency,
    p_business_type: parsed.data.business_type,
  })
  if (error || !workspaceId) return { error: error?.message ?? 'Could not create the workspace' }

  cookies().set(WORKSPACE_COOKIE, String(workspaceId), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  if (parsed.data.demo) {
    const { error: seedError } = await supabase.rpc('seed_demo_workspace', { p_workspace: workspaceId })
    if (seedError) console.error('Demo seed failed:', seedError.message)
  }

  redirect('/app')
}
