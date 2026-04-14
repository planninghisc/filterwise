// src/components/LogoutButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return '알 수 없는 오류가 발생했습니다.'
  }
}

export default function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleLogout = async () => {
    if (loading) return
    setLoading(true)
    setErr(null)

    try {
      // 1) 클라이언트 세션 종료
      const { error } = await supabase.auth.signOut()
      if (error) throw error

      // 2) 서버 쿠키 삭제 (전송 보장용 keepalive)
      await fetch('/api/logout', { method: 'POST', keepalive: true, credentials: 'include' })

      // 3) 로그인 화면으로 이동
      router.replace('/login')
    } catch (e: unknown) {
      const msg = toErrorMessage(e)
      console.error('[logout error]', msg)
      setErr(msg)
      router.replace('/login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        aria-busy={loading}
        aria-disabled={loading}
        className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 active:scale-95 transition disabled:opacity-60"
        title="로그아웃"
      >
        {loading ? '로그아웃 중…' : '로그아웃'}
      </button>

      {err && (
        <span role="alert" className="text-xs text-red-600">
          {err}
        </span>
      )}
    </div>
  )
}
