// src/app/news/alerts/page.tsx

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { BASE_KEYWORDS, alertConditionOf } from '@/lib/news/keywords'

// --- 키워드 시각화 컴포넌트 ---
const KeywordVisualizer = ({ text }: { text: string }) => {
  // `,` 와 `|` 는 OR (알림 조건 문법과 동일)
  if (/[|,，]/.test(text)) {
    const parts = text.split(/[|,，]+/).map(t => t.trim()).filter(Boolean)
    return (
      <div className="flex flex-wrap gap-2 items-center">
        {parts.map((part, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {idx > 0 && <span className="text-xs font-bold text-orange-500 bg-orange-50 px-1 rounded">OR</span>}
            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-md text-sm font-medium border border-orange-200">
              {part}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const parts = text.split(/\s+/).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {parts.map((part, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {idx > 0 && <span className="text-xs font-bold text-blue-300">+</span>}
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm font-medium border border-blue-200">
            {part}
          </span>
        </div>
      ))}
    </div>
  )
}

interface PersonalKeyword {
  id: string
  chat_id: string
  keyword: string
  created_at: string
  first_name: string | null
  username: string | null
  is_active: boolean
}

// --- 개인 키워드 현황: 검색 + 사용자별/키워드별 보기 ---
const PersonalKeywordPanel = ({
  items,
  onDelete,
}: {
  items: PersonalKeyword[]
  onDelete: (item: PersonalKeyword) => void
}) => {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'user' | 'keyword'>('user')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      [item.first_name, item.username, item.chat_id, item.keyword].some((v) => (v ?? '').toLowerCase().includes(q)),
    )
  }, [items, query])

  const byUser = useMemo(() => {
    const map = new Map<string, { chat_id: string; first_name: string | null; username: string | null; is_active: boolean; items: PersonalKeyword[] }>()
    for (const item of filtered) {
      const g = map.get(item.chat_id) ?? { chat_id: item.chat_id, first_name: item.first_name, username: item.username, is_active: item.is_active, items: [] }
      g.items.push(item)
      map.set(item.chat_id, g)
    }
    return Array.from(map.values()).sort((a, b) => (a.first_name ?? '').localeCompare(b.first_name ?? ''))
  }, [filtered])

  const byKeyword = useMemo(() => {
    const map = new Map<string, { keyword: string; items: PersonalKeyword[] }>()
    for (const item of filtered) {
      const key = item.keyword.trim().toLowerCase()
      const g = map.get(key) ?? { keyword: item.keyword, items: [] }
      g.items.push(item)
      map.set(key, g)
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length || a.keyword.localeCompare(b.keyword))
  }, [filtered])

  const userLabel = (u: { first_name: string | null; username: string | null }) =>
    `${u.first_name || '(이름 없음)'}${u.username ? ` @${u.username}` : ''}`

  if (items.length === 0) {
    return <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-500">등록된 개인 키워드가 없습니다.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름, @아이디, chat_id, 키워드로 검색"
          className="flex-1 rounded-xl border border-gray-300 p-3 text-sm"
        />
        <div className="flex rounded-xl border border-gray-200 bg-white p-1 text-sm">
          {([['user', '사용자별'], ['keyword', '키워드별']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-4 py-2 font-semibold ${view === v ? 'bg-[#ea580c] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500">
        구독자 {byUser.length}명 · 키워드 {filtered.length}개{query.trim() && ` (전체 ${items.length}개 중)`}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-500">검색 결과가 없습니다.</p>
      ) : view === 'user' ? (
        <ul className="grid gap-2">
          {byUser.map((u) => (
            <li key={u.chat_id} className="rounded-xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-gray-800">{u.first_name || '(이름 없음)'}</span>
                {u.username && <span className="text-gray-400">@{u.username}</span>}
                <span className="text-xs text-gray-400">{u.chat_id}</span>
                {!u.is_active && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">구독 중지</span>}
                <span className="ml-auto text-xs text-gray-500">{u.items.length}개</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {u.items.map((item) => (
                  <span key={item.id} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 py-1 pl-2 pr-1">
                    <KeywordVisualizer text={item.keyword} />
                    <button onClick={() => onDelete(item)} title="삭제" className="px-1 text-gray-400 hover:text-red-500">✕</button>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-2">
          {byKeyword.map((g) => (
            <li key={g.keyword} className="rounded-xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <KeywordVisualizer text={g.keyword} />
                <span className="ml-auto text-xs text-gray-500">{g.items.length}명</span>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {g.items.map((item) => (
                  <span key={item.id} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 py-1 pl-2 pr-1 text-gray-700">
                    {userLabel(item)}
                    {!item.is_active && <span className="text-xs text-gray-400">(중지)</span>}
                    <button onClick={() => onDelete(item)} title="삭제" className="px-1 text-gray-400 hover:text-red-500">✕</button>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface AlertKeyword {
  id: string
  keyword: string
  alert_filter: string | null
  created_at: string
}

export default function NewsAlertPage() {
  const [keywords, setKeywords] = useState<AlertKeyword[]>([])
  
  // 키워드 등록/수정용 State
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editKeyword, setEditKeyword] = useState('')

  // 공지 발송용 State
  const [announcement, setAnnouncement] = useState('')
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false)
  const [startMessageTemplate, setStartMessageTemplate] = useState('')
  const [savingStartMessage, setSavingStartMessage] = useState(false)

  const [subCount, setSubCount] = useState(0)
  const [personalKeywords, setPersonalKeywords] = useState<PersonalKeyword[]>([])
  const [suggested, setSuggested] = useState<Array<{ id: string; keyword: string }>>([])
  const [suggestedInput, setSuggestedInput] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchData = useCallback(async () => {
    const keyRes = await fetch('/api/news/alert-keywords', { cache: 'no-store' })
    const keyJson = await keyRes.json().catch(() => ({ ok: false }))
    if (keyRes.ok && keyJson.ok && Array.isArray(keyJson.list)) {
      setKeywords(keyJson.list as AlertKeyword[])
    }

    const personalRes = await fetch('/api/news/alert-keywords/personal', { cache: 'no-store' })
    const personalJson = await personalRes.json().catch(() => ({ ok: false }))
    if (personalRes.ok && personalJson.ok && Array.isArray(personalJson.list)) {
      setPersonalKeywords(personalJson.list as PersonalKeyword[])
    }

    const suggestedRes = await fetch('/api/news/alert-keywords/suggested', { cache: 'no-store' })
    const suggestedJson = await suggestedRes.json().catch(() => ({ ok: false }))
    if (suggestedRes.ok && suggestedJson.ok && Array.isArray(suggestedJson.list)) {
      setSuggested(suggestedJson.list)
    }

    const countRes = await fetch('/api/telegram/subscribers/count', { cache: 'no-store' })
    const countJson = await countRes.json().catch(() => ({ ok: false }))
    if (countRes.ok && typeof countJson.count === 'number') {
      setSubCount(countJson.count)
    } else {
      // Fallback: keep previous behavior if API auth/session is unavailable.
      const { count } = await supabase
        .from('telegram_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
      if (count !== null) setSubCount(count)
    }

    const settingsRes = await fetch('/api/telegram/settings', { cache: 'no-store' })
    const settingsJson = await settingsRes.json().catch(() => ({ ok: false }))
    if (settingsRes.ok && settingsJson.ok) {
      const template = String(settingsJson.item?.start_message_template ?? '').trim()
      if (template) setStartMessageTemplate(template)
    }
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // --- 키워드 관련 함수들 ---
  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const res = await fetch('/api/news/alert-keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: input.trim() }),
    })
    const json = await res.json().catch(() => ({ ok: false, error: '요청 실패' }))
    if (!res.ok || !json.ok) {
      if (json.code === '23505') alert('이미 등록된 키워드입니다.')
      else alert('오류: ' + (json.error || '등록 실패'))
      return
    }
    setInput('')
    fetchData()
  }

  const addSuggested = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!suggestedInput.trim()) return
    const res = await fetch('/api/news/alert-keywords/suggested', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: suggestedInput.trim() }),
    })
    const json = await res.json().catch(() => ({ ok: false, error: '요청 실패' }))
    if (!res.ok || !json.ok) {
      if (json.code === '23505') alert('이미 등록된 추천 키워드입니다.')
      else alert('오류: ' + (json.error || '등록 실패'))
      return
    }
    setSuggestedInput('')
    fetchData()
  }

  const deleteSuggested = async (item: { id: string; keyword: string }) => {
    if (!confirm(`추천 키워드 "${item.keyword}" 를 삭제하시겠습니까?\n(이미 등록한 구독자의 개인 키워드는 유지됩니다)`)) return
    await fetch(`/api/news/alert-keywords/suggested?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    fetchData()
  }

  const deletePersonalKeyword = async (item: PersonalKeyword) => {
    if (!confirm(`${item.first_name || item.chat_id} 님의 개인 키워드 "${item.keyword}" 를 삭제하시겠습니까?`)) return
    await fetch(`/api/news/alert-keywords/personal?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    fetchData()
  }

  const deleteKeyword = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/news/alert-keywords?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    fetchData()
  }

  const startEditing = (item: AlertKeyword) => {
    setEditingId(item.id); setEditKeyword(alertConditionOf(item))
  }

  const saveEdit = async () => {
    if (!editingId) return alert('수정 대상이 없습니다.')
    if (!editKeyword.trim()) return alert('키워드 필수')
    const res = await fetch('/api/news/alert-keywords', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        keyword: editKeyword.trim(),
      }),
    })
    const json = await res.json().catch(() => ({ ok: false, error: '요청 실패' }))
    if (!res.ok || !json.ok) {
      alert('실패: ' + (json.error || '수정 실패'))
      return
    }
    setEditingId(null)
    fetchData()
  }

  const sendAnnouncement = async () => {
    if (!announcement.trim()) return alert('공지 내용을 입력해주세요.')
    if (subCount === 0) return alert('구독자가 없습니다.')
    
    if (!confirm(`📢 정말로 ${subCount}명의 구독자에게 공지를 발송하시겠습니까?\n\n내용:\n${announcement}`)) return

    setIsSendingAnnouncement(true)
    try {
      const res = await fetch('/api/telegram/manual-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: announcement })
      })
      const json = await res.json()
      
      if (res.ok) {
        alert(`발송 성공! (성공: ${json.sent} / 전체: ${json.total})`)
        setAnnouncement('')
      } else {
        alert(`발송 실패: ${json.error}`)
      }
    } catch (e: any) {
      alert('오류 발생: ' + e.message)
    }
    setIsSendingAnnouncement(false)
  }

  const saveStartMessageTemplate = async () => {
    if (!startMessageTemplate.trim()) return alert('초기 구독 메시지를 입력해주세요.')
    setSavingStartMessage(true)
    try {
      const res = await fetch('/api/telegram/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_message_template: startMessageTemplate }),
      })
      const json = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !json.ok) {
        alert(`저장 실패: ${json.error || '알 수 없는 오류'}`)
        return
      }
      alert('초기 구독 메시지를 저장했습니다.')
    } finally {
      setSavingStartMessage(false)
    }
  }

  const sendTestBroadcast = async () => {
    if (!confirm(`테스트 메시지를 보내시겠습니까?`)) return
    setSendingTest(true)
    try {
      const res = await fetch('/api/telegram/test-broadcast', { method: 'POST' })
      if (res.ok) alert('성공')
      else alert('실패')
    } catch (e) { alert('오류') }
    setSendingTest(false)
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-10">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-[#c2410c]">📰 뉴스 키워드 관리</h1>
          <p className="text-gray-600">현재 <b>{subCount}명</b>의 구독자가 있습니다.</p>
        </div>
        
        {/* 버튼 그룹 */}
        <div className="flex gap-2">
          {/* ✅ 데일리 요약 페이지 이동 버튼 추가 */}
          <button 
            onClick={sendTestBroadcast} 
            disabled={sendingTest || subCount === 0} 
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm transition"
          >
            {sendingTest ? '...' : '🔔 연결 테스트 (Ping)'}
          </button>
        </div>
      </div>

      {/* 1. 키워드 관리 섹션 */}
      <section>
        <h2 className="mb-4 border-l-4 border-orange-500 pl-3 text-xl font-bold text-gray-800">뉴스 키워드 관리</h2>
        
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs bg-gray-100 px-2 py-1 rounded font-bold">수집 (고정)</span>
            {BASE_KEYWORDS.map((k) => (
              <span key={k} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-sm font-medium text-blue-700">{k}</span>
            ))}
          </div>
          <p className="mt-2 text-sm text-gray-500">위 키워드로 검색된 기사는 모두 수집됩니다. 그중 아래 알림 키워드가 들어간 기사만 텔레그램으로 발송됩니다.</p>
        </div>

        <div className="mb-6 rounded-2xl border border-orange-100 bg-orange-50 p-5">
          <form onSubmit={addKeyword} className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="알림 키워드 (예: 전산장애, 전산오류 = OR / 공백 = AND)" className="w-full p-3 border border-gray-300 rounded-xl" />
            </div>
            <button type="submit" className="whitespace-nowrap rounded-xl bg-[#ea580c] px-6 py-3 font-bold text-white hover:bg-[#c2410c]">등록</button>
          </form>
        </div>

        <ul className="grid gap-3">
          {keywords.map((item) => (
            <li key={item.id} className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm">
              {editingId === item.id ? (
                <div className="flex flex-col gap-3">
                  <input value={editKeyword} onChange={(e) => setEditKeyword(e.target.value)} placeholder="알림 키워드" className="w-full p-2 border rounded" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-gray-100 rounded">취소</button>
                    <button onClick={saveEdit} className="rounded bg-[#ea580c] px-3 py-1 text-white hover:bg-[#c2410c]">저장</button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-xs font-bold px-2 py-1 rounded text-green-700 bg-green-100">알림</span>
                    <KeywordVisualizer text={alertConditionOf(item)} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEditing(item)} className="p-2 text-gray-400 hover:text-[#ea580c]">✏️</button>
                    <button onClick={() => deleteKeyword(item.id)} className="p-2 text-gray-400 hover:text-red-500">🗑️</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 1-2. 개인 키워드 현황 (텔레그램 /add 로 등록) */}
      <section>
        <h2 className="mb-2 border-l-4 border-orange-500 pl-3 text-xl font-bold text-gray-800">개인 키워드 현황</h2>
        <p className="mb-4 text-sm text-gray-500">구독자가 텔레그램에서 <code>/add</code> 로 등록한 키워드입니다. 해당 구독자에게만 알림이 갑니다.</p>
        <PersonalKeywordPanel items={personalKeywords} onDelete={deletePersonalKeyword} />
      </section>

      {/* 1-3. 추천 키워드 (텔레그램 "➕ 키워드 추가" 버튼에 노출) */}
      <section>
        <h2 className="mb-2 border-l-4 border-orange-500 pl-3 text-xl font-bold text-gray-800">추천 키워드</h2>
        <p className="mb-4 text-sm text-gray-500">
          텔레그램에서 <b>➕ 키워드 추가</b>를 누르면 버튼으로 보여주는 키워드입니다. 구독자가 누르면 바로 개인 키워드로 등록됩니다.
        </p>
        <form onSubmit={addSuggested} className="mb-3 flex gap-3">
          <input
            type="text"
            value={suggestedInput}
            onChange={(e) => setSuggestedInput(e.target.value)}
            placeholder="추천 키워드 (예: IPO, 리테일, 금감원)"
            className="flex-1 rounded-xl border border-gray-300 p-3"
          />
          <button type="submit" className="whitespace-nowrap rounded-xl bg-[#ea580c] px-6 py-3 font-bold text-white hover:bg-[#c2410c]">추가</button>
        </form>
        {suggested.length === 0 ? (
          <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-500">등록된 추천 키워드가 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2 rounded-xl border border-gray-100 bg-white p-4">
            {suggested.map((item) => (
              <span key={item.id} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 py-1 pl-3 pr-1 text-sm text-gray-800">
                {item.keyword}
                <button onClick={() => deleteSuggested(item)} title="삭제" className="px-1 text-gray-400 hover:text-red-500">✕</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 2. 전체 공지 발송 섹션 */}
      <section className="pt-6 border-t border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-4 border-l-4 border-red-500 pl-3">
          📢 전체 구독자 공지 발송
        </h2>
        
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
          <p className="text-sm text-red-600 mb-3 font-semibold">
            * 주의: 현재 활성화된 {subCount}명의 구독자 전원에게 메시지가 발송됩니다.
          </p>
          
          <textarea
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="공지 내용을 입력하세요... (HTML 태그 사용 가능: <b>굵게</b>, <i>기울임</i> 등)"
            className="w-full h-32 p-4 border border-red-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none mb-3 resize-none bg-white"
          />
          
          <div className="flex justify-end">
            <button
              onClick={sendAnnouncement}
              disabled={isSendingAnnouncement || !announcement.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              {isSendingAnnouncement ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  전송 중...
                </>
              ) : (
                '📢 공지 보내기'
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 3. /start 초기 구독 메시지 템플릿 */}
      <section className="pt-6 border-t border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-4 border-l-4 border-blue-500 pl-3">
          ✉️ 최초 구독 메시지 템플릿
        </h2>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <p className="mb-3 text-sm font-semibold text-blue-700">
            * 텔레그램에서 <code>/start</code>를 보낸 사용자에게 발송되는 메시지입니다. (HTML 태그 사용 가능)
          </p>
          <textarea
            value={startMessageTemplate}
            onChange={(e) => setStartMessageTemplate(e.target.value)}
            placeholder="최초 구독 메시지를 입력하세요..."
            className="w-full h-56 p-4 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none mb-3 resize-y bg-white"
          />
          <div className="flex justify-end">
            <button
              onClick={saveStartMessageTemplate}
              disabled={savingStartMessage || !startMessageTemplate.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              {savingStartMessage ? '저장 중...' : '초기 메시지 저장'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}