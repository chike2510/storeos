import { ButtonLink } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">We couldn’t find that page</h1>
      <p className="mt-2 text-sm text-zinc-500">It may have been moved or deleted.</p>
      <ButtonLink href="/app" variant="secondary" className="mt-6">
        Back to StoreOS
      </ButtonLink>
    </div>
  )
}
