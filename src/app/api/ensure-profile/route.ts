import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET() {
  const res = NextResponse.json({ ok: true })
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // ▼▼▼ 수정된 부분: 타입 에러 방지를 위해 : any 추가 ▼▼▼
        setAll: (cookiesToSet: any) => {
          cookiesToSet.forEach(({ name, value, options }: any) => {
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return res

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!existing) {
    await supabase
      .from('profiles')
      .upsert({ id: user.id, display_name: '익명' }, { onConflict: 'id' })
  }

  return res
}