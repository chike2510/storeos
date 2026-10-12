'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { WORKSPACE_COOKIE, requireUser } from '@/lib/workspace'

export async function switchWorkspace(formData: FormData) {
  const id = String(formData.get('workspace_id') ?? '')
  const { supabase, user } = await requireUser()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (data) {
    cookies().set(WORKSPACE_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  }
  redirect('/app')
}
