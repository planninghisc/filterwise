// src\app\data\fsc-press\page.tsx

'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

type PressItem = {
  content_id?: string | null
  title: string
  department?: string | null
  views?: number | string | null
  date: string // YYYY-MM-DD
  url: string
  attachments?: { name: string; url: string }[] | null
}

type ApiResponse = {
  ok: boolean
  resultCnt: number
  result: PressItem[]
  period: { startDate: string; endDate: string }
  saved?: number
}

function formatDateInput(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toKoreanDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return iso
  }
}

export default function FscPressPage() {
  // 기본 기간: 오늘 ~ 3일 전
  const today = useMemo(() => new Date(), [])
  const defEnd = useMemo(() => formatDateInput(today), [today])
  const defStart = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 3)
    return formatDateInput(d)
  }, [today])

  const [startDate, setStartDate] = useState(defStart)
  const [endDate, setEndDate] = useState(defEnd)
  const [subject, setSubject] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [syncInfo, setSyncInfo] = useState<string | null>(null)

  const disabled = useMemo(() => !startDate || !endDate, [startDate, endDate])

  // DB 조회: 조회 시작일 ~ 조회 종료일 그대로 사용
  const onSearchDb = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setData(null)

      const qs = new URLSearchParams()
      qs.set('start', startDate)
      qs.set('end', endDate)
      if (subject.trim()) qs.set('subject', subject.trim())

      const res = await fetch(`/api/fsc/press/db?${qs.toString()}`, { method: 'GET', cache: 'no-store' })
      const json: unknown = await res.json()
      if (!res.ok) {
        const errMsg = (json as { error?: string }).error ?? 'DB query error'
        throw new Error(errMsg)
      }
      setData(json as ApiResponse)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '조회 중 오류가 발생했습니다.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, subject])

  // API 수집(저장): 조회 시작일 ~ 조회 종료일 그대로 크롤링/업서트
  const onSync = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setSyncInfo(null)

      const qs = new URLSearchParams()
      qs.set('start', startDate)
      qs.set('end', endDate)
      qs.set('pages', '5') // 필요 시 조정

      const res = await fetch(`/api/fsc/press/sync?${qs.toString()}`, { method: 'GET', cache: 'no-store' })
      const json: unknown = await res.json()
      if (!res.ok) {
        const errMsg = (json as { error?: string }).error ?? 'API sync error'
        throw new Error(errMsg)
      }
      const saved = (json as { saved?: number }).saved ?? 0
      setSyncInfo(`수집/저장 완료: ${saved}건`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '수집 중 오류가 발생했습니다.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  const onReset = useCallback(() => {
    setStartDate(defStart)
    setEndDate(defEnd)
    setSubject('')
    setData(null)
    setError(null)
    setSyncInfo(null)
  }, [defStart, defEnd])

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">금융위원회</div>
          <h1 className="text-2xl font-bold">보도자료(크롤링/DB 조회)</h1>
          <p className="text-sm text-gray-600 mt-1">조회 기간은 “조회 시작일 ~ 조회 종료일”을 기준으로 적용됩니다.</p>
        </div>
        <Link href="/data" className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">← 뒤로가기</Link>
      </header>

      {/* 필터 & 액션 */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm mb-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col">
            <label className="text-sm mb-1">조회 시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm mb-1">조회 종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div className="flex flex-col md:col-span-2">
            <label className="text-sm mb-1">제목(선택)</label>
            <input
              type="text"
              placeholder="제목 키워드(선택)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white"
            />
          </div>
        </div>

        {/* 버튼 순서/스타일: DB에서 조회(강조) → API 데이터 수집(저장) → 초기화 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onSearchDb}
            disabled={disabled || loading}
            className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-40"
          >
            {loading ? '조회 중…' : 'DB에서 조회'}
          </button>

          <button
            onClick={onSync}
            disabled={disabled || loading}
            className="px-4 py-2 rounded-lg border"
          >
            API 데이터 수집(저장)
          </button>

          <button
            onClick={onReset}
            disabled={loading}
            className="px-4 py-2 rounded-lg border"
          >
            초기화
          </button>

          {data?.period && (
            <span className="text-xs text-gray-500 ml-auto">
              기간: {data.period.startDate} ~ {data.period.endDate} · 결과 {data.resultCnt}건
            </span>
          )}
        </div>

        {/* 안내 문구(요청 문구로 교체) */}
        <p className="mt-3 text-xs text-gray-600">
          * API 데이터 수집은 해당 웹사이트에서 데이터를 최초 크롤링해올 때 사용합니다. 이후 조회는 <b>DB에서 조회</b>해주세요.
        </p>

        {syncInfo && <div className="mt-2 text-sm text-emerald-700">{syncInfo}</div>}
      </section>

      {error && <div className="mb-4 text-sm text-red-600">오류: {error}</div>}

      {/* 결과 리스트 */}
      <section className="space-y-3">
        {data?.result?.map((item) => {
          const dateText = item.date ? toKoreanDate(item.date) : ''
          const views =
            typeof item.views === 'number' ? item.views.toLocaleString() : String(item.views ?? '')
          return (
            <article key={item.url} className="border rounded-xl p-4 bg-white">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-1">
                <span>{item.department || '담당부서 미기재'}</span>
                <span>·</span>
                <time>{dateText}</time>
                <span>·</span>
                <span>조회수 {views}</span>
              </div>

              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block text-base md:text-lg font-semibold hover:underline break-words"
              >
                {item.title || '(제목 없음)'}
              </a>

              {!!item.attachments?.length && (
                <div className="mt-2 text-sm">
                  <div className="font-medium mb-1">첨부</div>
                  <ul className="list-disc ml-5">
                    {item.attachments.map((f, idx) => (
                      <li key={`${item.url}#att-${idx}`}>
                        {f.url ? (
                          <a href={f.url} target="_blank" rel="noreferrer" className="underline break-all">
                            {f.name || f.url}
                          </a>
                        ) : (
                          <span>{f.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )
        })}

        {data && data.resultCnt === 0 && !error && (
          <div className="text-sm text-gray-500">조회 결과가 없습니다.</div>
        )}
      </section>
    </main>
  )
}

