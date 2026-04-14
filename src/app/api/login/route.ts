import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const access_token = body?.access_token as string | undefined
  const refresh_token = body?.refresh_token as string | undefined

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'missing tokens' }, { status: 400 })
  }

  // 응답 객체(여기에 setSession이 심을 Set-Cookie를 담아 보냄)
  const res = NextResponse.json({ ok: true })
  const cookieStore = await cookies()

  // SSR 서버 클라이언트 (쿠키 읽기/쓰기 연결)
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

  // ✅ 서버에서 세션을 “정식으로” 세팅 → 쿠키를 올바른 형식/옵션으로 굽는다
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return res
}
