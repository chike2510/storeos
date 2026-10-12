'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export const PRODUCT_BUCKET = 'product-images'
const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function uploadProductImage(workspaceId: string, file: File) {
  if (!TYPES.includes(file.type)) throw new Error('Use a JPG, PNG, WebP or GIF image')
  if (file.size > MAX_BYTES) throw new Error('Images must be 5 MB or smaller')
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`
  const supabase = createClient()
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path }
}

/** Uploads straight to Supabase Storage and exposes image_url / image_path as hidden form fields. */
export function ImageUpload({
  workspaceId,
  defaultUrl,
  defaultPath,
  className,
}: {
  workspaceId: string
  defaultUrl?: string | null
  defaultPath?: string | null
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(defaultUrl ?? '')
  const [path, setPath] = useState(defaultPath ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const res = await uploadProductImage(workspaceId, file)
      setUrl(res.url)
      setPath(res.path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className={className}>
      <input type="hidden" name="image_url" value={url} />
      <input type="hidden" name="image_path" value={path} />
      <div
        className={cn(
          'relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50',
          url && 'border-solid border-zinc-200',
        )}
      >
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Product" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => {
                setUrl('')
                setPath('')
              }}
              className="absolute right-2 top-2 rounded-md bg-white/90 p-1 text-zinc-600 shadow-sm hover:text-zinc-900"
              aria-label="Remove image"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-zinc-500 hover:text-zinc-800"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            {busy ? 'Uploading…' : 'Upload image'}
            <span className="text-xs text-zinc-400">JPG, PNG or WebP · up to 5 MB</span>
          </button>
        )}
      </div>
      {url ? (
        <button type="button" onClick={() => input.current?.click()} className="mt-2 text-xs font-medium text-zinc-600 hover:text-zinc-900">
          {busy ? 'Uploading…' : 'Replace image'}
        </button>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <input ref={input} type="file" accept={TYPES.join(',')} className="hidden" onChange={e => onFile(e.target.files?.[0])} />
    </div>
  )
}
