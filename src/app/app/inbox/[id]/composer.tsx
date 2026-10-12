'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Checkbox, Textarea } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ActionState } from '@/lib/types'

const MODES = [
  { key: 'reply', label: 'Reply' },
  { key: 'inbound', label: 'Log customer message' },
  { key: 'note', label: 'Internal note' },
] as const

export function Composer({ action, conversationId }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; conversationId: string }) {
  const [mode, setMode] = useState<(typeof MODES)[number]['key']>('reply')
  return (
    <div className={cn('rounded-xl border bg-white shadow-card', mode === 'note' ? 'border-amber-200' : 'border-zinc-200')}>
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-100 px-2 pt-2">
        {MODES.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-2.5 pb-2 text-[13px] font-medium transition-colors',
              mode === m.key ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ActionForm key={mode} action={action} resetOnSuccess className="p-3">
        <input type="hidden" name="conversation_id" value={conversationId} />
        <input type="hidden" name="kind" value={mode} />
        <Textarea
          name="body"
          rows={3}
          required
          className="border-0 px-1 shadow-none focus:ring-0"
          placeholder={
            mode === 'reply'
              ? 'Write a reply to the customer…'
              : mode === 'inbound'
                ? "Paste the customer's follow-up message…"
                : 'Add a note only your team can see…'
          }
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          {mode === 'reply' ? (
            <Checkbox name="resolve" defaultChecked label="Mark as resolved" />
          ) : mode === 'inbound' ? (
            <Checkbox name="triage" defaultChecked label="Run AI triage" />
          ) : (
            <span />
          )}
          <SubmitButton size="sm" variant={mode === 'note' ? 'secondary' : 'primary'}>
            {mode === 'reply' ? 'Send reply' : mode === 'inbound' ? 'Log message' : 'Add note'}
          </SubmitButton>
        </div>
        {mode === 'reply' ? (
          <p className="mt-2 text-xs text-zinc-400">Replies are saved to the thread. Copy them to WhatsApp/Instagram until channel sending is connected.</p>
        ) : null}
      </ActionForm>
    </div>
  )
}
