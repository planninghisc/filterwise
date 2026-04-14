// src/app/data/FssPressCard.tsx
'use client'

import { useCallback, useMemo, useState } from 'react'

type PressItem = {
  contentId: string
  subject: string
  publishOrg: string
  originUrl: string
  viewCnt: string
  regDate: string
  atchfileUrl?: string
  atchfileNm?: string
  contentsKor?: string
}

type ApiResponse = {
  resultCode: string
  resultMsg: string
  resultCnt: number
  result: PressItem[]
  period: { startDate: string; endDate: string }
}

const SUGGEST_ORGS = ['금융감독원']

function formatDateInput(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function FssPressCard() {
  const today = useMemo(() => new Date(), [])
  const defEnd = useMemo(() => formatDateInput(today), [today])
  const defStart = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 30)
    return formatDateInput(d)
  }, [today])

  const [startDate, setStartDate] = useState(defStart)
  const [endDate, setEndDate] = useState(defEnd)
  const [subject, setSubject] = useState('')
  const [publishOrg, setPublishOrg] = useState<string>('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ApiResponse | null>(null)

  const disabled = useMemo(() => !startDate || !endDate, [startDate, endDate])

  const onSearch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setData(null)

      const qs = new URLSearchParams()
      qs.set('startDate', startDate)
      qs.set('endDate', endDate)
      if (subject.trim()) qs.set('subject', subject.trim())
      if (publishOrg.trim()) qs.set('publishOrg', publishOrg.trim())

      const res = await fetch(`/api/fss/press?${qs.toString()}`, { method: 'GET', cache: 'no-store' })
      const json: unknown = await res.json()
      if (!res.ok) {
        const errMsg = (json as { error?: string }).error ?? 'API error'
        throw new Error(errMsg)
      }
      setData(json as ApiResponse)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, subject, publishOrg])

  const onReset = useCallback(() => {
    setStartDate(defStart)
    setEndDate(defEnd)
    setSubject('')
    setPublishOrg('')
    setData(null)
    setError(null)
  }, [defStart, defEnd])

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow p-5 w-full xl:w-[720px]">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">금융감독원 · 보도자료(실적보고)</h2>
        <p className="text-sm text-zinc-500 mt-1">금융감독원 보도자료를 기간·제목·발행기관으로 조회합니다.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col">
          <label className="text-sm mb-1">조회 시작일</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                 className="border rounded-lg px-3 py-2 bg-white dark:bg-zinc-800" />
        </div>
        <div className="flex flex-col">
          <label className="text-sm mb-1">조회 종료일</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                 className="border rounded-lg px-3 py-2 bg-white dark:bg-zinc-800" />
        </div>
        <div className="flex flex-col">
          <label className="text-sm mb-1">제목</label>
          <input type="text" placeholder="제목 키워드" value={subject} onChange={(e) => setSubject(e.target.value)}
                 className="border rounded-lg px-3 py-2 bg-white dark:bg-zinc-800" />
        </div>
        <div className="flex flex-col">
          <label className="text-sm mb-1">발행기관</label>
          <input list="fss-orgs" placeholder="예: 금융감독원" value={publishOrg}
                 onChange={(e) => setPublishOrg(e.target.value)}
                 className="border rounded-lg px-3 py-2 bg-white dark:bg-zinc-800" />
          <datalist id="fss-orgs">
            {SUGGEST_ORGS.map((o) => (<option key={o} value={o} />))}
          </datalist>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={onSearch} disabled={disabled || loading}
                className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-40">
          {loading ? '조회 중…' : '조회'}
        </button>
        <button onClick={onReset} disabled={loading} className="px-4 py-2 rounded-lg border">초기화</button>
        {data?.period && (
          <span className="text-xs text-zinc-500 ml-auto">
            기간: {data.period.startDate} ~ {data.period.endDate} · 결과 {data.resultCnt}건
          </span>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-red-600">오류: {error}</div>}

      <div className="space-y-3">
        {data?.result?.map((item) => (
          <article key={item.contentId} className="border rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
              <span>{item.publishOrg || '발행기관 미기재'}</span><span>·</span>
              <time>{item.regDate}</time><span>·</span>
              <span>조회수 {item.viewCnt}</span>
            </div>
            <a href={item.originUrl} target="_blank" rel="noreferrer"
               className="block text-base md:text-lg font-semibold hover:underline">
              {item.subject || '(제목 없음)'}
            </a>
          </article>
        ))}
      </div>
    </div>
  )
}
