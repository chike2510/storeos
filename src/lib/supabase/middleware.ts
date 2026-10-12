import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/app', '/onboarding']
const AUTH_PAGES = ['/login', '/signup']

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const path = request.nextUrl.pathname
  const isProtected = PROTECTED.some(p => path === p || path.startsWith(`${p}/`))

  if (!url || !key) {
    // Not configured: protected pages show a setup notice via /login.
    if (isProtected) {
      const to = request.nextUrl.clone()
      to.pathname = '/login'
      to.search = ''
      return NextResponse.redirect(to)
    }
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Refreshes the session token if needed. Do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && isProtected) {
    const to = request.nextUrl.clone()
    to.pathname = '/login'
    to.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`
    return NextResponse.redirect(to)
  }

  if (user && AUTH_PAGES.includes(path)) {
    const to = request.nextUrl.clone()
    to.pathname = '/app'
    to.search = ''
    return NextResponse.redirect(to)
  }

  return response
}
