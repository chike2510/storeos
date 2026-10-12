import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardBody, CardFooter } from '@/components/ui/card'
import { ActionForm, SubmitButton } from '@/components/ui/form'
import { PageHeader } from '@/components/ui/misc'
import { createCustomer } from '../actions'
import { CustomerFields } from '../customer-fields'

export const metadata: Metadata = { title: 'New customer' }

export default function NewCustomerPage({ searchParams }: { searchParams: { return_to?: string } }) {
  const returnTo = searchParams.return_to?.startsWith('/app/') ? searchParams.return_to : ''
  return (
    <div className="max-w-2xl">
      <PageHeader
        back={
          <Link href={returnTo || '/app/customers'} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        }
        title="Add customer"
      />
      <ActionForm action={createCustomer}>
        <input type="hidden" name="return_to" value={returnTo} />
        <Card>
          <CardBody>
            <CustomerFields />
          </CardBody>
          <CardFooter>
            <SubmitButton pendingText="Saving…">Save customer</SubmitButton>
          </CardFooter>
        </Card>
      </ActionForm>
    </div>
  )
}
