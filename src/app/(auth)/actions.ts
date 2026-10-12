'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured, siteUrl } from '@/lib/env'
import { rateLimit } from '@/lib/rate-limit'
import type { ActionState } from '@/lib/types'

const email = z.string().trim().toLowerCase().email('Enter a valid email address')

function clientKey() {
  return headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

function safeNext(n: FormDataEntryValue | null) {
  const s = typeof n === 'string' ? n : ''
  return s.startsWith('/') && !s.startsWith('//') ? s : '/app'
}

function notConfigured(): ActionState {
  return { error: 'Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' }
}

export async function signInWithPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured()
  if (!rateLimit(`login:${clientKey()}`, 10).allowed) return { error: 'Too many attempts. Wait a minute and try again.' }

  const parsed = z.object({ email, password: z.string().min(1, 'Enter your password') }).safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message }

  await supabase.rpc('accept_pending_invitations')
  redirect(safeNext(formData.get('next')))
}

export async function sendMagicLink(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured()
  if (!rateLimit(`magic:${clientKey()}`, 5).allowed) return { error: 'Too many requests. Wait a minute and try again.' }

  const parsed = email.safeParse(formData.get('email'))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const next = safeNext(formData.get('next'))
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  })
  if (error) return { error: error.message }
  return { ok: true, message: `Check ${parsed.data} — we sent you a sign-in link.` }
}

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return notConfigured()
  if (!rateLimit(`signup:${clientKey()}`, 5).allowed) return { error: 'Too many attempts. Wait a minute and try again.' }

  const parsed = z
    .object({
      name: z.string().trim().min(1, 'Enter your name').max(80),
      email,
      password: z.string().min(8, 'Use at least 8 characters for your password'),
    })
    .safeParse({ name: formData.get('name'), email: formData.get('email'), password: formData.get('password') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/onboarding`,
    },
  })
  if (error) return { error: error.message }

  if (data.session) {
    await supabase.rpc('accept_pending_invitations')
    redirect('/onboarding')
  }
  return { ok: true, message: `Almost there — confirm your email from the link we sent to ${parsed.data.email}.` }
}
