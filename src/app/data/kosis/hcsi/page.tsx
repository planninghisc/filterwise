//src\app\data\kosis\hcsi\page.tsx
'use client'

import Link from 'next/link'
import { useMemo, useEffect, useState } from 'react'

type AttemptOk = { scope: string; ok: true; count: number; usedParams: Record<string, string> }
type AttemptFail = { scope: string; ok: false; error: string; usedParams: Record<string, string> }
type Attempt = AttemptOk | AttemptFail

type ApiOk<T> = { ok: true; status: number; data?: T; attempts?: Attempt[] }
type ApiErr = { ok: false; status: number; message: string }
type ApiResp<T> = ApiOk<T> | ApiErr

type Row = {
  prd_de: string
  region_code: string
  region_name: string | null
  itm_id: string
  itm_name: string | null
  unit: string | null
  value: number | null
  updated_at: string | null
}

function defaultYmRange(): { start: string; end: string } {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (m === 1) return { start: `${y - 1}01`, end: `${y - 1}12` }
  const prev = new Date(y, m - 2, 1) // 전월
  return { start: `${y}01`, end: `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, '0')}` }
}
function fmtNum(n: number | null): string { return n == null ? '-' : n.toLocaleString() }
function yyyymmToLabel(ym: string): string { return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}-${ym.slice(4)}` : ym }
function fmtYmdHm(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mo}-${da} ${hh}:${mi}`
}
/** 타입 가드 */
function isAttemptOk(a: Attempt): a is AttemptOk { return a.ok === true && 'count' in a }
function summarizeAttempts(attempts?: Attempt[]) {
  if (!attempts) return { successCount: 0, failCount: 0, lastSuccessMonth: '' }
  const success = attempts.filter(isAttemptOk)
  const fail = attempts.filter((a) => !a.ok)
  const successWithData = success.filter((s) => s.count > 0)
  const lastSuccessMonth =
    successWithData.length > 0
      ? successWithData.map((s) => s.scope).sort().at(-1) ?? ''
      : success.length > 0
      ? success.map((s) => s.scope).sort().at(-1) ?? ''
      : ''
  return { successCount: success.length, failCount: fail.length, lastSuccessMonth }
}

export default function Page() {
  // 수집
  const def = useMemo(defaultYmRange, [])
  const [ingStart, setIngStart] = useState(def.start)
  const [ingEnd, setIngEnd] = useState(def.end)
  const [ingLoading, setIngLoading] = useState(false)
  const [ingMsg, setIngMsg] = useState('')
  const [attempts, setAttempts] = useState<Attempt[] | undefined>(undefined)

  // 조회
  const [start, setStart] = useState(def.start)
  const [end, setEnd] = useState(def.end)
  const [regionName, setRegionName] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listUrl = useMemo(() => {
    const p = new URLSearchParams()
    p.set('start', start)
    p.set('end', end)
    if (regionName.trim()) p.set('regionName', regionName.trim())
    return `/api/kosis/hcsi/list?${p.toString()}`
  }, [start, end, regionName])

  const ingest = async (): Promise<void> => {
    setIngLoading(true)
    setIngMsg('')
    setAttempts(undefined)
    try {
      const res = await fetch('/api/kosis/ingest/hcsi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start: ingStart, end: ingEnd }),
      })
      const text = await res.text()
      let data: ApiResp<unknown>
      try { data = JSON.parse(text) } catch { data = { ok: false, status: res.status, message: text.slice(0, 300) } }
      if (!res.ok || !data.ok) throw new Error(('message' in data && data.message) || `HTTP ${res.status}`)
      const s = summarizeAttempts((data as ApiOk<unknown>).attempts)
      setAttempts((data as ApiOk<unknown>).attempts)
      setIngMsg(`완료: success=${s.successCount}, fail=${s.failCount}${s.lastSuccessMonth ? `, last=${s.lastSuccessMonth}` : ''}`)
    } catch (e) {
      setIngMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setIngLoading(false)
    }
  }

  const fetchList = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setRows([])
    try {
      const res = await fetch(listUrl)
      const text = await res.text()
      let data: ApiResp<Row[]>
      try { data = JSON.parse(text) } catch { data = { ok: false, status: res.status, message: text } }
      if (!res.ok || !data.ok) throw new Error(('message' in data && data.message) || `HTTP ${res.status}`)
      setRows((data as ApiOk<Row[]>).data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchList() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [])

  const attemptSummary = summarizeAttempts(attempts)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500 whitespace-nowrap">KOSIS</div>
          <h2 className="text-2xl font-bold whitespace-nowrap">주택시장 소비심리지수</h2>
        </div>
        <Link href="/data" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap">← 뒤로가기</Link>
      </div>

      {/* API 수집 */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold whitespace-nowrap">API 수집 (기간: 월)</div>
          <div className="text-xs text-gray-500 whitespace-nowrap">DB 테이블: kosis_hcsi</div>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시작(YYYYMM)</div>
            <input value={ingStart} onChange={(e) => setIngStart(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">끝(YYYYMM)</div>
            <input value={ingEnd} onChange={(e) => setIngEnd(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <button onClick={ingest} disabled={ingLoading} className="inline-flex items-center justify-center min-w-[96px] rounded-md bg-black text-white px-4 py-2.5 disabled:opacity-50">
              {ingLoading ? '수집 중…' : '수집'}
            </button>
            <div className="text-sm text-gray-600 self-center">{ingMsg}</div>
          </div>
        </div>

        {/* attempts 요약 */}
        <div className="mt-3 text-sm text-gray-700">
          <div className="inline-flex gap-3 rounded-md border px-3 py-2 bg-gray-50">
            <span>성공: <b>{attemptSummary.successCount}</b></span>
            <span>실패: <b>{attemptSummary.failCount}</b></span>
            {attemptSummary.lastSuccessMonth && <span>마지막 성공 월: <b>{yyyymmToLabel(attemptSummary.lastSuccessMonth)}</b></span>}
          </div>
        </div>
      </div>

      {/* DB 조회 */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="font-semibold whitespace-nowrap">DB 조회 (기간: 월 · 지역명 검색)</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-7 gap-3 items-end">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시작(YYYYMM)</div>
            <input value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">끝(YYYYMM)</div>
            <input value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm sm:col-span-3">
            <div className="text-gray-600 mb-1">지역명(부분검색)</div>
            <input value={regionName} onChange={(e) => setRegionName(e.target.value)} placeholder="예: 서울, 부산…" className="w-full rounded-md border px-3 py-2" />
          </label>
          <div className="flex gap-2 sm:col-span-1">
            <button onClick={fetchList} disabled={loading} className="inline-flex items-center justify-center min-w-[96px] rounded-md border px-4 py-2.5">
              {loading ? '조회 중…' : '조회'}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-auto rounded border">
          <table className="min-w-[880px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold whitespace-nowrap">
                <th>월</th>
                <th>지역명</th>
                <th>항목</th>
                <th className="text-right">값</th>
                <th>단위</th>
                <th>업데이트</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td className="px-3 py-6 text-red-600" colSpan={6}>{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-3 py-6 text-gray-500" colSpan={6}>조회 결과가 없습니다.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={`${r.prd_de}-${r.region_code}-${r.itm_id}`} className="odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-2">{yyyymmToLabel(r.prd_de)}</td>
                    <td className="px-3 py-2">{r.region_name ?? r.region_code}</td>
                    <td className="px-3 py-2">{r.itm_name ?? r.itm_id}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(r.value)}</td>
                    <td className="px-3 py-2">{r.unit ?? ''}</td>
                    <td className="px-3 py-2">{fmtYmdHm(r.updated_at)}</td>
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

