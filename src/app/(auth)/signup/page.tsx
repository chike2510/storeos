import type { Metadata } from 'next'
import Link from 'next/link'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Field, Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/misc'
import { isSupabaseConfigured } from '@/lib/env'
import { signUp } from '../actions'

export const metadata: Metadata = { title: 'Create your account' }

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Create your account</h1>
      <p className="mt-1 text-sm text-zinc-500">Set up your store in under two minutes. No card needed.</p>
      <div className="mt-6 space-y-4">
        {!isSupabaseConfigured() ? (
          <Alert tone="warning" title="Backend not configured">
            Add your Supabase URL and anon key to <code className="font-mono text-xs">.env.local</code> to enable sign-up.
          </Alert>
        ) : null}
        <ActionForm action={signUp} className="space-y-4">
          <Field label="Your name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required placeholder="Ada Lovelace" />
          </Field>
          <Field label="Work email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@store.com" />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <SubmitButton className="w-full" pendingText="Creating account…">
            Create account
          </SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-6 text-center text-sm text-zinc-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-zinc-900 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
