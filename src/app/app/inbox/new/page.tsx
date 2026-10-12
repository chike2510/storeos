import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardBody, CardFooter } from '@/components/ui/card'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/misc'
import { requireWorkspace } from '@/lib/workspace'
import { createConversation } from '../actions'

export const metadata: Metadata = { title: 'Log message' }

export default async function NewConversationPage({ searchParams }: { searchParams: { customer?: string } }) {
  const { supabase, workspace } = await requireWorkspace()
  const { data: customers } = await supabase.from('customers').select('id, name, phone').eq('workspace_id', workspace.id).order('name').limit(500)

  return (
    <div className="max-w-2xl">
      <PageHeader
        back={
          <Link href="/app/inbox" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Link>
        }
        title="Log a customer message"
        description="Paste a message from WhatsApp, Instagram, email or anywhere else. Direct channel connections are coming soon."
      />
      <ActionForm action={createConversation}>
        <Card>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer" htmlFor="customer_id">
                <Select id="customer_id" name="customer_id" defaultValue={searchParams.customer ?? ''}>
                  <option value="">New / unknown customer</option>
                  {(customers ?? []).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Channel" htmlFor="channel">
                <Select id="channel" name="channel" defaultValue="whatsapp">
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="email">Email</option>
                  <option value="website">Website chat</option>
                  <option value="manual">Phone / in person</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </div>
            <details className="rounded-lg border border-zinc-200 px-3 py-2 text-sm [&[open]]:pb-3">
              <summary className="cursor-pointer text-zinc-600">New customer? Add their details</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input name="new_customer_name" placeholder="Name" aria-label="New customer name" />
                <Input name="new_customer_contact" placeholder="Phone, email or @handle" aria-label="New customer contact" />
              </div>
            </details>
            <Field label="Subject" htmlFor="subject" hint="Optional — we'll use the start of the message.">
              <Input id="subject" name="subject" maxLength={200} />
            </Field>
            <Field label="Customer message" htmlFor="body">
              <Textarea id="body" name="body" rows={6} required placeholder="Hi, I ordered the linen kaftan last week (#1024) and it still hasn't arrived…" />
            </Field>
            <Checkbox
              name="triage"
              defaultChecked
              label="Run AI triage now"
              description="Classify, pull order context and draft a reply. Low-risk replies send automatically; the rest go to Approvals."
            />
          </CardBody>
          <CardFooter>
            <SubmitButton pendingText="Triaging…">Save conversation</SubmitButton>
          </CardFooter>
        </Card>
      </ActionForm>
    </div>
  )
}
