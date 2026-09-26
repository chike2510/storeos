import { NextResponse } from 'next/server'
import { isDemoMode, MODELS } from '@/lib/qwen/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'storeos',
    mode: isDemoMode ? 'demo' : 'live',
    models: MODELS,
    timestamp: new Date().toISOString(),
  })
}
