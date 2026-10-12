import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { generateListing } from '@/lib/ai/engine'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const MAX_BASE64 = 7_000_000 // ≈5 MB image

const body = z.object({
  workspaceId: z.string().uuid(),
  imageBase64: z.string().min(1).max(MAX_BASE64, 'Image too large (max ~5 MB)'),
  mimeType: z.enum(ALLOWED),
  notes: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 })

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  if (!rateLimit(`listing:${user.id}`, 10).allowed) {
    return NextResponse.json({ error: 'Rate limit reached. Try again in a minute.' }, { status: 429 })
  }

  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  // RLS: only returns the workspace if the caller is a member.
  const { data: ws } = await supabase.from('workspaces').select('id, currency').eq('id', parsed.data.workspaceId).maybeSingle()
  if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  try {
    const result = await generateListing(parsed.data.imageBase64, parsed.data.mimeType, {
      currency: ws.currency as string,
      notes: parsed.data.notes,
    })
    await supabase.from('audit_events').insert({
      workspace_id: ws.id,
      actor_type: 'ai',
      action: 'ai.listing_generated',
      entity_type: 'workspace',
      entity_id: ws.id,
      metadata: { model: result.model, mode: result.mode, title: result.listing.title },
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('Listing generation failed:', e)
    return NextResponse.json({ error: 'The AI could not generate a listing from this image. Try another photo.' }, { status: 502 })
  }
}
