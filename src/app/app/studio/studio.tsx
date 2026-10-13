'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { uploadProductImage } from '@/components/app/image-upload'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/misc'
import { ProductForm } from '../products/product-form'
import type { ActionState } from '@/lib/types'

interface Listing {
  title: string
  description: string
  category: string
  suggestedPrice: number | null
  tags: string[]
  highlights: string[]
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read the image'))
    reader.readAsDataURL(file)
  })
}

export function Studio({
  workspaceId,
  currency,
  saveAction,
  aiLabel,
  demo,
  publishTo,
}: {
  workspaceId: string
  currency: string
  saveAction: (s: ActionState, fd: FormData) => Promise<ActionState>
  aiLabel: string
  demo: boolean
  publishTo?: { shopName: string | null }
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<{ url: string; path: string } | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ listing: Listing; image: { url: string; path: string }; n: number } | null>(null)

  function pick(f: File | undefined) {
    if (!f) return
    setError(null)
    setResult(null)
    setUploaded(null)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function generate() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const [image, base64] = await Promise.all([uploaded ?? uploadProductImage(workspaceId, file), toBase64(file)])
      setUploaded(image)
      const res = await fetch('/api/ai/listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, imageBase64: base64, mimeType: file.type, notes: notes || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Generation failed')
      setResult(r => ({ listing: json.listing as Listing, image, n: (r?.n ?? 0) + 1 }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const l = result?.listing
  const description = l
    ? [l.description, l.highlights.length ? '\n\n' + l.highlights.map(h => `• ${h}`).join('\n') : ''].join('').trim()
    : ''

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-800"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              pick(e.dataTransfer.files?.[0])
            }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Selected product" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 px-4 text-center">
                <ImagePlus className="h-6 w-6" />
                Drop a product photo or click to upload
                <span className="text-xs text-zinc-400">JPG, PNG or WebP · up to 5 MB</span>
              </span>
            )}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={e => pick(e.target.files?.[0])}
          />
          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">Photo → listing</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Upload a clear photo. StoreOS writes the title, description, category, tags and a suggested price in {currency}. You
                  review everything before it’s saved.
                </p>
              </div>
              <Field label="Anything the AI should know?" htmlFor="notes" hint="Optional: material, sizes, who it's for.">
                <Input
                  id="notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  maxLength={500}
                  placeholder="100% linen, one size, handmade in Lagos"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={generate} disabled={!file || busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : result ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {busy ? 'Generating…' : result ? 'Regenerate' : 'Generate listing'}
              </Button>
              <span className="text-xs text-zinc-400">{aiLabel}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      {demo ? (
        <Alert tone="info">Demo AI is active (no AI key configured), so every photo returns the same sample listing.</Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {l && result ? (
        <div key={result.n} className="animate-fade-in">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Review & save</h2>
          <ProductForm
            action={saveAction}
            workspaceId={workspaceId}
            currency={currency}
            mode="create"
            origin="studio"
            publishTo={publishTo}
            defaults={{
              title: l.title,
              description,
              category: l.category,
              price: l.suggestedPrice,
              tags: l.tags,
              status: 'draft',
              image_url: result.image.url,
              image_path: result.image.path,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
