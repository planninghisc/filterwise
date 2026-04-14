'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) {
          setMsg('로그인이 필요합니다.')
          return
        }
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single()
        setDisplayName(data?.display_name || '')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) {
        setMsg('로그인이 필요합니다.')
        return
      }
      // 없으면 insert, 있으면 update → upsert 사용
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, display_name: displayName || '익명' }, { onConflict: 'id' })
      if (error) {
        setMsg('저장 실패: ' + error.message)
        return
      }
      setMsg('저장되었습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div>불러오는 중…</div>

  return (
    <div className="max-w-lg bg-white p-6 rounded-xl shadow border">
      <h1 className="text-xl font-bold mb-4">프로필</h1>
      <div className="mb-3">
        <label className="block text-sm mb-1">표시 이름</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder="예: 홍길동"
        />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-60"
      >
        {saving ? '저장 중…' : '저장'}
      </button>
      {msg && <p className="mt-3 text-sm text-gray-700">{msg}</p>}
    </div>
  )
}
