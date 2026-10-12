import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Instagram, Store } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { requireUser } from '@/lib/workspace'
import { CURRENCIES } from '@/lib/utils'
import { createWorkspace } from './actions'

export const metadata: Metadata = { title: 'Set up your store' }
export const dynamic = 'force-dynamic'

export default async function OnboardingPage({ searchParams }: { searchParams: { new?: string } }) {
  const { supabase, user } = await requireUser()
  const isNew = searchParams.new === '1'

  if (!isNew) {
    await supabase.rpc('accept_pending_invitations')
    const { count } = await supabase
      .from('workspace_members')
      .select('workspace_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((count ?? 0) > 0) redirect('/app')
  }

  return (
    <div className="min-h-screen bg-zinc-50/60">
      <header className="flex h-16 items-center justify-between px-6">
        <Link href="/">
          <Logo />
        </Link>
        {isNew ? (
          <Link href="/app" className="text-sm text-zinc-500 hover:text-zinc-900">
            Cancel
          </Link>
        ) : (
          <form action="/auth/signout" method="post">
            <button className="text-sm text-zinc-500 hover:text-zinc-900">Sign out</button>
          </form>
        )}
      </header>
      <main className="mx-auto max-w-lg px-6 pb-16 pt-6 sm:pt-12">
        <p className="text-sm font-medium text-brand-700">{isNew ? 'New workspace' : 'Welcome to StoreOS'}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Tell us about your store</h1>
        <p className="mt-1 text-sm text-zinc-500">You can change all of this later in Settings.</p>

        <ActionForm action={createWorkspace} className="mt-8 space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card">
          <Field label="Store name" htmlFor="name">
            <Input id="name" name="name" required maxLength={80} placeholder="e.g. Ada's Closet" autoFocus />
          </Field>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-[13px] font-medium text-zinc-700">How do you sell today?</legend>
            {[
              { value: 'standalone', icon: Instagram, title: 'Social & direct', body: 'Instagram, WhatsApp, my own site or in person. StoreOS is my system of record.' },
              { value: 'shopify', icon: Store, title: 'Shopify', body: 'I run a Shopify store and want StoreOS on top. (Shopify sync is coming soon.)' },
            ].map(opt => (
              <label
                key={opt.value}
                className="flex cursor-pointer gap-3 rounded-lg border border-zinc-200 p-3 transition-colors has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50"
              >
                <input type="radio" name="business_type" value={opt.value} defaultChecked={opt.value === 'standalone'} className="mt-1" />
                <opt.icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">{opt.title}</span>
                  <span className="block text-xs text-zinc-500">{opt.body}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <Field label="Currency" htmlFor="currency" hint="Used for prices, orders and reports.">
            <Select id="currency" name="currency" defaultValue="NGN">
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Checkbox
            name="demo"
            defaultChecked={!isNew}
            label="Load sample data"
            description="Fill the workspace with demo products, customers, orders and support conversations. You can clear it any time."
          />

          <SubmitButton className="w-full" size="lg" pendingText="Setting things up…">
            Create workspace
          </SubmitButton>
        </ActionForm>
      </main>
    </div>
  )
}
