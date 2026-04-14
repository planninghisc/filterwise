// src/app/data/spgi-infra/page.tsx
'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'

type AttemptOk = { scope: string; ok: true; count: number; usedParams: Record<string, string> }
type AttemptFail = { scope: string; ok: false; error: string; usedParams: Record<string, string>; httpStatus?: number; url?: string }
type Attempt = AttemptOk | AttemptFail

type ApiOk<T> = { ok: true; status: number; data?: T; inserted?: number; upserted?: number; attempts?: Attempt[] }
type ApiErr = { ok: false; status: number; message: string }
type ApiResp<T> = ApiOk<T> | ApiErr

type Row = {
  date: string
  value: number
  currency: string | null
  provider: string
  index_code: string
  updated_at: string | null
}

/** 이번 달 1일 ~ 이번 달 말일 */
function defaultDateRange(): { start: string; end: string } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1 // 1..12
  const mm = String(m).padStart(2, '0')
  const first = `${y}-${mm}-01`
  // UTC 기준 이번 달 마지막 날짜
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const end = `${y}-${mm}-${String(lastDay).padStart(2, '0')}`
  return { start: first, end }
}
function fmtUpdated(s: string | null): string { return s ? s.slice(0, 16) : '' }
function fmtNum(n: number): string { return Number.isFinite(n) ? n.toLocaleString() : String(n) }

function isAttemptOk(a: Attempt): a is AttemptOk { return a.ok === true && typeof (a as AttemptOk).count === 'number' }
function summarizeAttempts(attempts?: Attempt[]) {
  if (!attempts) return { success: 0, fail: 0, last: '' }
  const success = attempts.filter(isAttemptOk)
  const fail = attempts.filter((a) => !a.ok)
  const last = success.length > 0 ? success.map((s) => s.scope).sort().at(-1) ?? '' : ''
  return { success: success.length, fail: fail.length, last }
}

export default function Page(): ReactElement {
  // 수집 (시트 CSV)
  const def = useMemo(defaultDateRange, [])
  const [ingStart, setIngStart] = useState(def.start)
  const [ingEnd, setIngEnd] = useState(def.end)
  const [ingLoading, setIngLoading] = useState(false)
  const [ingMsg, setIngMsg] = useState('')
  const [attempts, setAttempts] = useState<Attempt[] | undefined>(undefined)
  const [showAttempts, setShowAttempts] = useState(true)

  // 조회
  const [start, setStart] = useState(def.start)
  const [end, setEnd] = useState(def.end)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ingest = async (): Promise<void> => {
    setIngLoading(true); setIngMsg(''); setAttempts(undefined); setShowAttempts(true)
    try {
      const res = await fetch('/api/indexes/spgi/sheets-ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 시트 자체가 Today()로 최신까지 퍼블리시되므로, 보통 start/end 생략해도 OK
        body: JSON.stringify({
          /* csvUrl 생략 시 서버가 DEFAULT 사용 */
          start: ingStart,
          end: ingEnd,
        }),
      })
      const text = await res.text()
      let data: ApiResp<unknown>
      try { data = JSON.parse(text) } catch { data = { ok: false, status: res.status, message: text.slice(0, 300) } }
      if (!res.ok || !data.ok) throw new Error(('message' in data && data.message) || `HTTP ${res.status}`)

      const at = (data as ApiOk<unknown>).attempts ?? []
      setAttempts(at)

      const firstFail = at.find((a) => !a.ok) as AttemptFail | undefined
      const s = summarizeAttempts(at)
      const failNote = firstFail
        ? ` | 첫 실패: [${firstFail.httpStatus ?? '-'}] ${firstFail.error}${firstFail.url ? ` @ ${firstFail.url}` : ''}`
        : ''
      setIngMsg(`완료: success=${s.success}, fail=${s.fail}${s.last ? `, last=${s.last}` : ''}${failNote}`)
    } catch (e) {
      setIngMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setIngLoading(false)
    }
  }

  const fetchList = async (): Promise<void> => {
    setLoading(true); setError(null); setRows([])
    try {
      const p = new URLSearchParams({ start, end })
      const res = await fetch(`/api/indexes/spgi/list?${p.toString()}`)
      const text = await res.text()
      let data: ApiResp<Row[]>
      try { data = JSON.parse(text) } catch { data = { ok: false, status: res.status, message: text } }
      if (!res.ok || !data.ok) throw new Error(('message' in data && data.message) || `HTTP ${res.status}`)
      setRows(((data as ApiOk<Row[]>).data ?? []).sort((a, b) => a.date.localeCompare(b.date)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500 whitespace-nowrap">S&P DJI (시트 연동)</div>
          <h2 className="text-2xl font-bold whitespace-nowrap">S&P Global Infrastructure Index</h2>
        </div>
        <Link href="/data" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap">← 뒤로가기</Link>
      </div>

      {/* API 수집(시트 CSV) */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold whitespace-nowrap">시트 CSV 수집 (기간: 일)</div>
          <div className="text-xs text-gray-500 whitespace-nowrap">DB 테이블: index_series</div>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시작(YYYY-MM-DD)</div>
            <input value={ingStart} onChange={(e) => setIngStart(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">끝(YYYY-MM-DD)</div>
            <input value={ingEnd} onChange={(e) => setIngEnd(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <button onClick={ingest} disabled={ingLoading} className="inline-flex items-center justify-center min-w-[96px] rounded-md bg-black text-white px-4 py-2.5 disabled:opacity-50">
              {ingLoading ? '수집 중…' : '수집'}
            </button>
            <button onClick={() => setShowAttempts((v) => !v)} className="inline-flex items-center justify-center min-w-[96px] rounded-md border px-4 py-2.5">
              {showAttempts ? '시도 숨기기' : '시도 보기'}
            </button>
            <div className="text-sm text-gray-600 self-center">{ingMsg}</div>
          </div>
        </div>

        {/* attempts 표 */}
        {showAttempts && attempts && attempts.length > 0 && (
          <div className="mt-3 rounded-lg border overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                  <th>범위</th>
                  <th>결과</th>
                  <th>건수</th>
                  <th>HTTP</th>
                  <th>방법</th>
                  <th>URL</th>
                  <th>메시지</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a, i) => (
                  <tr key={`${a.scope}-${i}`} className="odd:bg-white even:bg-gray-50 align-top">
                    <td className="px-2 py-2 whitespace-nowrap">{a.scope}</td>
                    {a.ok ? (
                      <>
                        <td className="px-2 py-2 text-green-700">성공</td>
                        <td className="px-2 py-2">{a.count}</td>
                        <td className="px-2 py-2">-</td>
                        <td className="px-2 py-2">{a.usedParams?.method ?? '-'}</td>
                        <td className="px-2 py-2 break-all">{a.usedParams?.url ?? '-'}</td>
                        <td className="px-2 py-2 text-gray-500">-</td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-2 text-red-700">실패</td>
                        <td className="px-2 py-2">-</td>
                        <td className="px-2 py-2">{(a as AttemptFail).httpStatus ?? ''}</td>
                        <td className="px-2 py-2">{a.usedParams?.method ?? '-'}</td>
                        <td className="px-2 py-2 break-all">{(a as AttemptFail).url ?? '-'}</td>
                        <td className="px-2 py-2 text-gray-600">{a.error}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DB 조회 */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="font-semibold whitespace-nowrap">DB 조회 (기간: 일)</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시작(YYYY-MM-DD)</div>
            <input value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">끝(YYYY-MM-DD)</div>
            <input value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button onClick={fetchList} disabled={loading} className="inline-flex items-center justify-center min-w-[96px] rounded-md border px-4 py-2.5">
              {loading ? '조회 중…' : '조회'}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded border overflow-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                <th>일자</th>
                <th className="text-right">지수</th>
                <th>통화</th>
                <th>제공자</th>
                <th>업데이트</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td className="px-3 py-6 text-red-600" colSpan={5}>{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-3 py-6 text-gray-500" colSpan={5}>조회 결과가 없습니다.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.date} className="odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(r.value)}</td>
                    <td className="px-3 py-2">{r.currency ?? ''}</td>
                    <td className="px-3 py-2">{r.provider}</td>
                    <td className="px-3 py-2">{fmtUpdated(r.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
