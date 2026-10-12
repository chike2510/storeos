'use client'

import { useRef } from 'react'
import { Check, X } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Field, Input, Textarea } from '@/components/ui/input'
import type { ActionState } from '@/lib/types'

export function ApprovalDecisionForm({
  action,
  approvalId,
  draft,
  canDecide,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  approvalId: string
  draft: string
  canDecide: boolean
}) {
  const decision = useRef<HTMLInputElement>(null)
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="approval_id" value={approvalId} />
      <input ref={decision} type="hidden" name="decision" value="approved" />
      <Field label="Reply to send" htmlFor={`reply-${approvalId}`} hint="Edit before approving if needed.">
        <Textarea id={`reply-${approvalId}`} name="final_reply" rows={4} defaultValue={draft} disabled={!canDecide} />
      </Field>
      <Field label="Rationale" htmlFor={`why-${approvalId}`}>
        <Input
          id={`why-${approvalId}`}
          name="rationale"
          required
          disabled={!canDecide}
          placeholder="e.g. Photo confirms damage; valid refund"
        />
      </Field>
      {canDecide ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <SubmitButton
            variant="secondary"
            onClick={() => {
              if (decision.current) decision.current.value = 'rejected'
            }}
          >
            <X className="h-4 w-4" /> Reject
          </SubmitButton>
          <SubmitButton
            onClick={() => {
              if (decision.current) decision.current.value = 'approved'
            }}
          >
            <Check className="h-4 w-4" /> Approve & send
          </SubmitButton>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Only owners and admins can approve or reject.</p>
      )}
    </ActionForm>
  )
}
