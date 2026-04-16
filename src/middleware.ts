// src/middleware.ts
import { NextResponse, NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/** Pages + edge calls that must work without a logged-in session. */
function isPublic(req: NextRequest): boolean {
  const { pathname } = req.nextUrl

  if (pathname === '/favicon.ico' || pathname === '/robots.txt' || pathname === '/sitemap.xml') return true
  if (pathname.startsWith('/_next/') || pathname === '/_next') return true

  if (pathname === '/login' || pathname.startsWith('/login/')) return true

  if (pathname === '/news/daily-summary' || pathname.startsWith('/news/daily-summary/')) return true

  if (!pathname.startsWith('/api/')) return false

  // Auth & session bootstrap
  if (pathname.startsWith('/api/login') || pathname.startsWith('/api/logout')) return true
  if (pathname === '/api/me' || pathname.startsWith('/api/me/')) return true

  // OAuth redirect from Google (no cookie yet)
  if (pathname.startsWith('/api/google/oauth/callback')) return true

  // Telegram pushes updates here (no user cookie)
  if (pathname === '/api/telegram/webhook' && req.method === 'POST') return true

  // External schedulers (Bearer CRON_SECRET checked inside the route)
  if (pathname.startsWith('/api/cron/')) return true

  // Public briefing helper (used by /news/daily-summary without login)
  if (pathname.startsWith('/api/stock/history')) return true

  return false
}

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl

  if (isPublic(req)) {
    return NextResponse.next()
  }

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options as never)
          })
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL('/login', origin)
    url.searchParams.set('next', pathname + req.nextUrl.search)
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
