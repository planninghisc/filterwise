// src/app/login/page.tsx
'use client'

// (선택) 항상 동적 처리
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Lock, User } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabaseClient'
import LoginWaveBackground from './LoginWaveBackground'

const easeOut = [0.22, 1, 0.36, 1] as const

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0 },
  },
}

/** 제목 영역: 부모는 페이드 없이 바로 보이게 → 폰트만 스왑되면 됨 */
const containerHeader = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0 },
  },
}

const item = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeOut },
  },
}

/** 제목은 폰트 스왑과 겹치지 않게 투명도 애니메이션 없음 (FOUT 완화) */
const itemTitle = {
  hidden: { opacity: 1, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: easeOut },
  },
}

export default function LoginPage() {
  const reduceMotion = useReducedMotion()
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

      const nextRaw = new URL(window.location.href).searchParams.get('next')
      const safeNext =
        nextRaw &&
        nextRaw.startsWith('/') &&
        !nextRaw.startsWith('//') &&
        !nextRaw.startsWith('/login')
          ? nextRaw
          : '/login/success'
      window.location.replace(safeNext)
    } catch (err) {
      console.error('[login error]', err)
      setErrorMsg('알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  const cardMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 1, y: 16, scale: 0.99 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: { duration: 0.38, ease: easeOut },
      }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-white">
      <LoginWaveBackground />
      <div className="relative z-10 flex w-full items-center justify-center p-4">
      <motion.div
        className="w-full max-w-[380px] rounded-[2rem] bg-white p-8 shadow-xl sm:p-10"
        {...cardMotion}
      >
        <motion.div
          className="mb-8 flex flex-col items-center text-center"
          variants={reduceMotion ? undefined : containerHeader}
          initial={reduceMotion ? false : 'hidden'}
          animate={reduceMotion ? false : 'show'}
        >
          <motion.h1
            variants={reduceMotion ? undefined : itemTitle}
            className="mb-4 font-anchangho text-5xl font-bold text-[#ea580c]"
          >
            FilterWise
          </motion.h1>
          <motion.p
            variants={reduceMotion ? undefined : item}
            className="text-sm font-medium text-gray-500"
          >
            The power of properly accumulated data
          </motion.p>
        </motion.div>

        <motion.form
          onSubmit={handleLogin}
          className="space-y-4"
          variants={reduceMotion ? undefined : container}
          initial={reduceMotion ? false : 'hidden'}
          animate={reduceMotion ? false : 'show'}
        >
          <motion.div variants={reduceMotion ? undefined : item} className="relative">
            <label className="sr-only" htmlFor="email">
              이메일
            </label>
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
          </motion.div>

          <motion.div variants={reduceMotion ? undefined : item} className="relative">
            <label className="sr-only" htmlFor="password">
              비밀번호
            </label>
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
          </motion.div>

          <motion.div variants={reduceMotion ? undefined : item} className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#ea580c] py-4 text-sm font-bold text-white shadow-md transition-all hover:bg-[#c2410c] active:scale-[0.98] disabled:bg-gray-400"
            >
              {loading ? '로그인 중...' : 'Login'}
            </button>
          </motion.div>

          {errorMsg && (
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="pt-1 text-center text-sm text-red-600"
            >
              {errorMsg}
            </motion.p>
          )}
        </motion.form>
      </motion.div>
      </div>
    </div>
  )
}
