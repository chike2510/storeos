import { NextResponse } from 'next/server'
import { aiConfig } from '@/lib/ai/config'
import { isSupabaseConfigured } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ai = aiConfig()
  return NextResponse.json({
    ok: true,
    service: 'storeos',
    version: '1.0.0',
    supabase: isSupabaseConfigured() ? 'configured' : 'missing',
    ai: { mode: ai.mode, provider: ai.provider, model: ai.model, visionModel: ai.visionModel },
    timestamp: new Date().toISOString(),
  })
}
