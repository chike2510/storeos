import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert } from '@/components/ui/misc'
import { isSupabaseConfigured } from '@/lib/env'
import { LoginForms } from './login-forms'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const next = searchParams.next?.startsWith('/') && !searchParams.next.startsWith('//') ? searchParams.next : '/app'
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Welcome back</h1>
      <p className="mt-1 text-sm text-zinc-500">Sign in to your StoreOS workspace.</p>
      <div className="mt-6 space-y-4">
        {!isSupabaseConfigured() ? (
          <Alert tone="warning" title="Backend not configured">
            Add your Supabase URL and anon key to <code className="font-mono text-xs">.env.local</code> to enable sign-in.
          </Alert>
        ) : null}
        {searchParams.error ? <Alert tone="error">{searchParams.error}</Alert> : null}
        <LoginForms next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-zinc-500">
        New to StoreOS?{' '}
        <Link href="/signup" className="font-medium text-zinc-900 underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}
