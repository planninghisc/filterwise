// src/app/login/success/page.tsx
'use client'

import { useEffect, useState } from 'react'

export default function LoginSuccessPage() {
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const res = await fetch('/api/me', {
          cache: 'no-store',
          credentials: 'include',
        })
        const json = await res.json()
        if (!mounted) return

        if (json?.user) {
          setOk(true)
          setTimeout(() => {
            // ✅ SPA push 대신 완전 페이지 이동으로 미들웨어/쿠키 싱크 보장
            window.location.replace('/')
          }, 400)
        } else {
          setTimeout(check, 300)
        }
      } catch {
        if (mounted) setTimeout(check, 300)
      }
    }

    check()
    return () => { mounted = false }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow text-center">
        <p className="text-lg font-semibold">로그인이 완료되었습니다!</p>
        <p className="text-sm text-gray-600 mt-2">
          {ok ? '메인으로 이동 중…' : '세션 확인 중…'}
        </p>
      </div>
    </div>
  )
}
