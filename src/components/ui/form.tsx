'use client'

import { useEffect, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from './button'
import { Alert } from './misc'
import type { ActionState } from '@/lib/types'

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  )
}

/**
 * Form bound to a server action returning ActionState. Shows the action's
 * error/success inline. Actions may also redirect().
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  showSuccess = true,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  children: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
  showSuccess?: boolean
}) {
  const [state, formAction] = useFormState(action, null)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form ref={ref} action={formAction} className={className}>
      {state?.error ? (
        <Alert tone="error" className="mb-4">
          {state.error}
        </Alert>
      ) : null}
      {showSuccess && state?.ok && state.message ? (
        <Alert tone="success" className="mb-4">
          {state.message}
        </Alert>
      ) : null}
      {children}
    </form>
  )
}
