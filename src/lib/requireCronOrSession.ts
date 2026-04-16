// src/lib/requireCronOrSession.ts
// Protect server routes: cron secret (external schedulers) OR logged-in Supabase session (browser).
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

export function isValidCronSecret(request: Request): boolean {
  const expected = (process.env.CRON_SECRET_KEY ?? '').trim()
  if (!expected) return false
  const authHeader = (request.headers.get('authorization') ?? '').trim()
  const xCron = (request.headers.get('x-cron-secret') ?? '').trim()
  const candidates = [
    authHeader,
    authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '',
    xCron,
  ].filter(Boolean)
  return candidates.some((v) => v === expected)
}

export async function getSessionUser(): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null

  const cookieStore = await cookies()
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
          })
        } catch {
          // Route handlers may run where cookie mutation is limited; read-only check still works.
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** null = authorized; otherwise return this Response from the route handler. */
export async function requireCronOrSession(request: Request): Promise<NextResponse | null> {
  if (isValidCronSecret(request)) return null
  const user = await getSessionUser()
  if (user) return null
  return NextResponse.json(
    { ok: false, error: 'Unauthorized', hint: 'Sign in, or send Authorization: Bearer <CRON_SECRET_KEY> or X-Cron-Secret' },
    { status: 401 },
  )
}
