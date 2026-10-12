import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/misc'
import { requireWorkspace } from '@/lib/workspace'
import { aiConfig } from '@/lib/ai/config'
import { createProduct } from '../products/actions'
import { Studio } from './studio'

export const metadata: Metadata = { title: 'Product Studio' }

export default async function StudioPage() {
  const { workspace } = await requireWorkspace()
  const ai = aiConfig()
  return (
    <>
      <PageHeader title="Product Studio" description="Turn a product photo into a ready-to-sell listing." />
      <Studio
        workspaceId={workspace.id}
        currency={workspace.currency}
        saveAction={createProduct}
        demo={ai.mode === 'demo'}
        aiLabel={ai.mode === 'demo' ? 'Demo AI' : `${ai.provider} · ${ai.visionModel}`}
      />
    </>
  )
}
