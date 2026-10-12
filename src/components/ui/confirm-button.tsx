'use client'

import { useFormStatus } from 'react-dom'
import { Button, type ButtonProps } from './button'

/** Submit button that asks for confirmation first. Place inside a <form action={...}>. */
export function ConfirmButton({ message, children, ...props }: ButtonProps & { message: string }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      onClick={e => {
        if (!window.confirm(message)) e.preventDefault()
      }}
      {...props}
    >
      {children}
    </Button>
  )
}
