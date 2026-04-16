// src/app/login/page.tsx
'use client'

// (선택) 항상 동적 처리
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Lock, User } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  // ✅ 훅은 최상단에서만/항상 동일 순서로 호출
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!email || !password) {
      setErrorMsg('이메일과 비밀번호를 입력하세요.')
      return
    }

    setLoading(true)
    try {
      // 1) Supabase 로그인 (클라이언트 세션은 SDK가 자동 저장)
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setErrorMsg(error.message)
        return
      }
      const session = data.session
      if (!session) {
        setErrorMsg('세션 정보를 받지 못했습니다. 다시 시도해 주세요.')
        return
      }

      // 2) 서버 쿠키 저장 (미들웨어 인증용)
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
        credentials: 'include',
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setErrorMsg(`서버 세션 저장 실패: ${text || res.statusText}`)
        return
      }

      // 3) 서버 쿠키 적용 확인 페이지로 이동 (hydration 안전)
      window.location.replace('/login/success')
    } catch (err) {
      console.error('[login error]', err)
      setErrorMsg('알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[380px] rounded-[2rem] bg-white p-8 shadow-xl sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="mb-4 font-anchangho text-5xl font-bold text-[#ea580c]">FilterWise</h1>
          <p className="text-sm font-medium text-gray-500">The power of properly accumulated data</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <label className="sr-only" htmlFor="email">이메일</label>
            <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-full border border-gray-300 bg-white py-3.5 pl-11 pr-4 text-sm text-gray-900 transition-colors focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
              placeholder="Enter your ID"
              autoComplete="email"
              required
            />
          </div>

          <div className="relative">
            <label className="sr-only" htmlFor="password">비밀번호</label>
            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-full border border-gray-300 bg-white py-3.5 pl-11 pr-4 text-sm text-gray-900 transition-colors focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#ea580c] py-4 text-sm font-bold text-white shadow-md transition-all hover:bg-[#c2410c] active:scale-[0.98] disabled:bg-gray-400"
            >
              {loading ? '로그인 중...' : 'Login'}
            </button>
          </div>

          {errorMsg && (
            <p className="pt-1 text-center text-sm text-red-600">
              {errorMsg}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
