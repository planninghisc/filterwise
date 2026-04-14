// src/app/news/alerts/page.tsx

'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link' // ✅ Link 컴포넌트 추가

// --- 키워드 시각화 컴포넌트 ---
const KeywordVisualizer = ({ text }: { text: string }) => {
  if (text.includes('|')) {
    const parts = text.split('|').map(t => t.trim())
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
  const [filterInput, setFilterInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editKeyword, setEditKeyword] = useState('')
  const [editFilter, setEditFilter] = useState('')

  // 공지 발송용 State
  const [announcement, setAnnouncement] = useState('')
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false)

  const [subCount, setSubCount] = useState(0)
  const [sendingTest, setSendingTest] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchData = useCallback(async () => {
    const { data: kData } = await supabase.from('alert_keywords').select('*').order('created_at', { ascending: false })
    if (kData) setKeywords(kData as AlertKeyword[])

    const { count } = await supabase.from('telegram_subscribers').select('*', { count: 'exact', head: true }).eq('is_active', true)
    if (count !== null) setSubCount(count)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // --- 키워드 관련 함수들 ---
  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return alert('관리자 로그인이 필요합니다.')

    const { error } = await supabase.from('alert_keywords').insert({ 
      keyword: input.trim(), alert_filter: filterInput.trim() || null, created_by: session.user.id 
    })
    
    if (error) {
      if (error.code === '23505') alert('이미 등록된 키워드입니다.')
      else alert('오류: ' + error.message)
    } else {
      setInput(''); setFilterInput(''); fetchData()
    }
  }

  const deleteKeyword = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('alert_keywords').delete().eq('id', id)
    fetchData()
  }

  const startEditing = (item: AlertKeyword) => {
    setEditingId(item.id); setEditKeyword(item.keyword); setEditFilter(item.alert_filter || '')
  }

  const saveEdit = async () => {
    if (!editKeyword.trim()) return alert('키워드 필수')
    const { error } = await supabase.from('alert_keywords').update({ keyword: editKeyword.trim(), alert_filter: editFilter.trim() || null }).eq('id', editingId)
    if (error) alert('실패: ' + error.message)
    else { setEditingId(null); fetchData() }
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">📢 뉴스 브리핑 센터</h1>
          <p className="text-gray-600">현재 <b>{subCount}명</b>의 구독자가 있습니다.</p>
        </div>
        
        {/* 버튼 그룹 */}
        <div className="flex gap-2">
          {/* ✅ 데일리 요약 페이지 이동 버튼 추가 */}
          <Link href="/news/daily-summary">
            <button className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-semibold border border-blue-200 transition">
              🗞️ 데일리 요약 보기
            </button>
          </Link>
          
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
        <h2 className="text-xl font-bold text-gray-800 mb-4 border-l-4 border-blue-500 pl-3">뉴스 키워드 관리</h2>
        
        <div className="bg-blue-50 p-5 rounded-2xl mb-6 border border-blue-100">
          <form onSubmit={addKeyword} className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="수집 검색어 (예: 한화투자증권)" className="w-full p-3 border border-gray-300 rounded-xl" />
            </div>
            <div className="flex-1">
              <input type="text" value={filterInput} onChange={(e) => setFilterInput(e.target.value)} placeholder="알림 조건 (예: 이벤트, 실적)" className="w-full p-3 border border-gray-300 rounded-xl" />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 whitespace-nowrap">등록</button>
          </form>
        </div>

        <ul className="grid gap-3">
          {keywords.map((item) => (
            <li key={item.id} className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm">
              {editingId === item.id ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <input value={editKeyword} onChange={(e) => setEditKeyword(e.target.value)} className="flex-1 p-2 border rounded" />
                    <input value={editFilter} onChange={(e) => setEditFilter(e.target.value)} placeholder="조건 없음" className="flex-1 p-2 border rounded" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-gray-100 rounded">취소</button>
                    <button onClick={saveEdit} className="px-3 py-1 bg-blue-600 text-white rounded">저장</button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div className="flex flex-col gap-2">
                     <div className="flex items-center gap-2"><span className="text-xs bg-gray-100 px-2 py-1 rounded font-bold">수집</span> <KeywordVisualizer text={item.keyword} /></div>
                     <div className="flex items-center gap-2 text-sm">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${item.alert_filter ? 'text-green-700 bg-green-100' : 'text-gray-500 bg-gray-100'}`}>알림</span>
                        {item.alert_filter ? <span className="font-semibold text-green-700">{item.alert_filter}</span> : <span className="text-gray-500">전체 발송</span>}
                     </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEditing(item)} className="p-2 text-gray-400 hover:text-blue-500">✏️</button>
                    <button onClick={() => deleteKeyword(item.id)} className="p-2 text-gray-400 hover:text-red-500">🗑️</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
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
    </div>
  )
}