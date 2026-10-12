import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** OAuth / magic-link / email-confirmation PKCE code exchange. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await supabase.rpc('accept_pending_invitations')
      return NextResponse.redirect(`${origin}${next}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('That sign-in link is invalid or has expired.')}`)
}

function safeNext(n: string | null) {
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/app'
}
