'use client'

import { Button } from '@/components/ui/button'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <h1 className="text-lg font-semibold text-zinc-900">Something went wrong</h1>
      <p className="mt-1 max-w-md text-sm text-zinc-500">{error.message || 'An unexpected error occurred.'}</p>
      <Button variant="secondary" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
