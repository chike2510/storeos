import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'

export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = createClient()
    await supabase.auth.signOut()
  }
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
