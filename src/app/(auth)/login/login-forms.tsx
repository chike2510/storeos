'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Field, Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { sendMagicLink, signInWithPassword } from '../actions'

export function LoginForms({ next }: { next: string }) {
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  return (
    <div>
      <div className="mb-5 grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-[13px] font-medium">
        {(['password', 'magic'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md py-1.5 transition-colors',
              mode === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
            )}
          >
            {m === 'password' ? 'Password' : 'Email link'}
          </button>
        ))}
      </div>

      {mode === 'password' ? (
        <ActionForm action={signInWithPassword} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@store.com" />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="w-full" pendingText="Signing in…">
            Sign in
          </SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={sendMagicLink} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Email" htmlFor="magic-email" hint="We'll email you a one-time sign-in link.">
            <Input id="magic-email" name="email" type="email" autoComplete="email" required placeholder="you@store.com" />
          </Field>
          <SubmitButton className="w-full" pendingText="Sending…">
            Email me a link
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  )
}
