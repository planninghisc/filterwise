// src/app/board/new/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default function BoardNewPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const getDisplayName = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return '익명'
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    return profile?.display_name || '익명'
  }

  const handleSubmit = async () => {
    const t = title.trim()
    const c = content.trim()
    if (!t || !c) {
      alert('제목과 내용을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) {
        alert('로그인이 필요합니다.')
        return
      }
      const author = await getDisplayName()

      const { data, error } = await supabase
        .from('posts')
        .insert({ title: t, content: c, author, user_id: user.id })
        .select('id')
        .single()
      if (error) throw error

      router.push(`/board/${data!.id}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e)
      alert(`등록 실패: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-2">
        <Link href="/board" className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50">
          ← 목록으로
        </Link>
      </div>

      <section className="bg-white p-6 rounded-xl shadow border">
        <h1 className="text-2xl font-bold mb-4">새 글 작성</h1>

        <div className="mb-3">
          <label className="block text-sm mb-1">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="제목을 입력하세요"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm mb-1">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full border rounded px-3 py-2 h-56"
            placeholder="내용을 입력하세요"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saving ? '등록 중…' : '등록'}
          </button>
          <Link
            href="/board"
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
          >
            취소
          </Link>
        </div>
      </section>
    </div>
  )
}
