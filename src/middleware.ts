// src/middleware.ts
import { NextResponse, NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PREFIXES = [
  '/login',      // /login, /login/success 허용
  '/api',        // /api/* 허용 (로그인/로그아웃/날씨 등)
  '/_next',      // 정적 리소스
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/news',       // [추가] 뉴스 브리핑 페이지 등은 로그인 없이 접근 허용
]

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl

  // 공개 경로들은 통과
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // 기본 응답 (여기에 쿠키 갱신 세팅)
  const res = NextResponse.next()

  // Supabase 서버 클라이언트 (쿠키 자동 읽기/쓰기)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: any) => {
          cookiesToSet.forEach(({ name, value, options }: any) => {
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // 실제 유저 확인 (필요시 토큰 자동 리프레시)
  const { data: { user } } = await supabase.auth.getUser()

  // 비로그인 → 로그인으로
  if (!user) {
    const url = new URL('/login', origin)
    return NextResponse.redirect(url)
  }

  // 로그인 상태면 정상 통과 (갱신된 쿠키는 res에 실려 나감)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}