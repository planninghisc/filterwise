// src/app/account/AccountClient.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

function getErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return 'Unknown error'
  }
}

export default function AccountClient() {
  const router = useRouter()

  const [userId, setUserId] = useState<string>('')
  const [email, setEmail] = useState<string>('')

  // display_name
  const [displayName, setDisplayName] = useState('')

  // password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')

  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [savingPw, setSavingPw] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)

      const { data: { user }, error: uerr } = await supabase.auth.getUser()
      if (uerr) {
        setError(uerr.message)
        setLoading(false)
        return
      }
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)
      setEmail(user.email ?? '')

      const { data: profile, error: perr } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()

      if (perr) setError(perr.message)
      setDisplayName(profile?.display_name ?? '')
      setLoading(false)
    }
    load()
  }, [router])

  const saveDisplayName = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setOkMsg(null)
    setError(null)
    setSavingName(true)
    try {
      if (!userId) throw new Error('세션 정보가 없습니다.')
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: userId, display_name: displayName }, { onConflict: 'id' })
      if (error) throw error

      setOkMsg('이름이 변경되었습니다.')
      // 헤더 즉시 반영
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: { displayName } }))
    } catch (err: unknown) {
      setError(getErrMsg(err) || '이름 변경에 실패했습니다.')
    } finally {
      setSavingName(false)
    }
  }

  const savePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setOkMsg(null)
    setError(null)
    setSavingPw(true)
    try {
      if (!email) throw new Error('이메일 정보를 확인할 수 없습니다.')
      if (!newPw || newPw.length < 8) throw new Error('새 비밀번호는 8자 이상이어야 합니다.')
      if (newPw !== newPw2) throw new Error('새 비밀번호가 일치하지 않습니다.')

      // 현재 비밀번호 확인(재인증)
      if (!currentPw) throw new Error('현재 비밀번호를 입력해주세요.')
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: currentPw })
      if (authErr) throw new Error('현재 비밀번호가 올바르지 않습니다.')

      // 비밀번호 업데이트
      const { error: upErr } = await supabase.auth.updateUser({ password: newPw })
      if (upErr) throw upErr

      setCurrentPw('')
      setNewPw('')
      setNewPw2('')
      setOkMsg('비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.')
    } catch (err: unknown) {
      setError(getErrMsg(err) || '비밀번호 변경에 실패했습니다.')
    } finally {
      setSavingPw(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="h-8 w-40 bg-gray-200 animate-pulse rounded mb-4" />
        <div className="h-28 bg-gray-100 animate-pulse rounded" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold">계정 설정</h2>

      {(error || okMsg) && (
        <div className={`border rounded p-3 text-sm ${error ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-700'}`}>
          {error || okMsg}
        </div>
      )}

      {/* 프로필 이름 변경 */}
      <form onSubmit={saveDisplayName} className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">프로필</h3>
          <span className="text-xs text-gray-500">ID: {userId.slice(0, 8)}…</span>
        </div>

        <div className="grid gap-2">
          <label className="text-sm text-gray-600">표시 이름</label>
          <input
            type="text"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring focus:ring-gray-200"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="예) 홍길동"
          />
          <p className="text-xs text-gray-500">이름을 입력해주세요.</p>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 active:scale-[0.99]"
            disabled={savingName}
          >
            {savingName ? '저장 중…' : '이름 저장'}
          </button>
        </div>
      </form>

      {/* 비밀번호 변경 */}
      <form onSubmit={savePassword} className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-lg font-semibold">비밀번호 변경</h3>

        <div className="grid gap-2">
          <label className="text-sm text-gray-600">현재 비밀번호</label>
          <input
            type="password"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring focus:ring-gray-200"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm text-gray-600">새 비밀번호</label>
          <input
            type="password"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring focus:ring-gray-200"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="8자 이상"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm text-gray-600">새 비밀번호 확인</label>
          <input
            type="password"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring focus:ring-gray-200"
            value={newPw2}
            onChange={(e) => setNewPw2(e.target.value)}
            placeholder="다시 입력"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 active:scale-[0.99]"
            disabled={savingPw}
          >
            {savingPw ? '변경 중…' : '비밀번호 변경'}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          보안을 위해 현재 비밀번호로 한번 더 인증한 뒤 새 비밀번호를 적용합니다.
        </p>
      </form>
    </div>
  )
}
