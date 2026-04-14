// src/app/api/me/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET() {
  // 응답 객체를 먼저 만들고, setAll이 여기에 Set-Cookie를 심도록 연결
  const res = NextResponse.json({ ok: true })

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: any) => {
          cookiesToSet.forEach(({ name, value, options }:any) => {
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data, error } = await supabase.auth.getUser()

  return NextResponse.json(
    { user: data.user ?? null, error: error ?? null },
    { headers: res.headers }
  )
}
