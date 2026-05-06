'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Row = {
  period: string
  wrttime_desc: string | null
  region_code: 'CBD' | 'KBD' | 'YBD'
  region_name: string | null
  value: number | null
}

const TABLE = 'rone_office_index' as const

/** KST 기준 직전 완료 분기 — 신규 분기 통계 미발표 시 기본 수집 분기 착오 방지 */
function defaultCompletedQuarterKst(): { year: number; q: 1 | 2 | 3 | 4 } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date())
  const y = Number(parts.find((p) => p.type === 'year')?.value)
  const m = Number(parts.find((p) => p.type === 'month')?.value)
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    const d = new Date()
    const cq = Math.ceil((d.getMonth() + 1) / 3)
    return {
      year: d.getFullYear(),
      q: Math.min(4, Math.max(1, cq)) as 1 | 2 | 3 | 4,
    }
  }
  const currentQ = Math.ceil(m / 3) as 1 | 2 | 3 | 4
  if (currentQ === 1) return { year: y - 1, q: 4 }
  return { year: y, q: (currentQ - 1) as 1 | 2 | 3 | 4 }
}

function qMonth(q: number): '03' | '06' | '09' | '12' {
  return ['03', '06', '09', '12'][q - 1] as '03' | '06' | '09' | '12'
}
function toDbPeriod5(y: number, q: number): string {
  // YYYY0Q 형태
  return `${y}0${q}`
}
function toDbPeriod(y: number, q: number): string {
  return `${y}${qMonth(q)}`
}
function descFromPeriod(p: string): string {
  const y = p.slice(0, 4)
  const m = p.slice(4)
  const q = ({ '03': 1, '06': 2, '09': 3, '12': 4 } as const)[m as '03' | '06' | '09' | '12']
  return `${y}년 ${q}분기`
}

export default function RoneOfficeClient(): ReactElement {
  // ----- 수집 -----
  const now = new Date()
  const ingestDefault = useMemo(() => defaultCompletedQuarterKst(), [])
  const [ingYear, setIngYear] = useState<number>(ingestDefault.year)
  const [ingQ, setIngQ] = useState<number>(ingestDefault.q)
  const [ingLoading, setIngLoading] = useState(false)
  const [ingResult, setIngResult] = useState<Row[]>([])
  const [showDetails, setShowDetails] = useState(false)

  // ----- 조회 -----
  const [startYear, setStartYear] = useState<number>(now.getFullYear())
  const [startQ, setStartQ] = useState<number>(1)
  const [endYear, setEndYear] = useState<number>(now.getFullYear())
  const [endQ, setEndQ] = useState<number>(4)
  const [region, setRegion] = useState<'ALL' | 'CBD' | 'KBD' | 'YBD'>('ALL')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  const startPeriod = useMemo(() => toDbPeriod(startYear, startQ), [startYear, startQ])
  const endPeriod = useMemo(() => toDbPeriod(endYear, endQ), [endYear, endQ])

  const ingest = async (): Promise<void> => {
    setIngLoading(true)
    setShowDetails(false)
    setIngResult([])
    try {
      const period = toDbPeriod(ingYear, ingQ)
      const resp = await fetch('/api/rone/office-index/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period }),
      })
      const data: { rows?: Row[]; error?: string } = await resp.json()
      if (!resp.ok) throw new Error(data?.error || '수집 실패')
      setIngResult((data?.rows ?? []).map((r) => ({
        period: r.period,
        wrttime_desc: r.wrttime_desc,
        region_code: r.region_code,
        region_name: r.region_name,
        value: r.value,
      })))
      setShowDetails(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(msg || '수집 실패')
    } finally {
      setIngLoading(false)
    }
  }

  /** 조회 카드의 시작~끝 분기: R-ONE 1회 수집 후 분기별 매칭·일괄 저장 (최대 48분기) */
  const ingestRange = async (): Promise<void> => {
    setIngLoading(true)
    setShowDetails(false)
    setIngResult([])
    try {
      const resp = await fetch('/api/rone/office-index/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          range: {
            startYear,
            startQ,
            endYear,
            endQ,
          },
        }),
      })
      const data = (await resp.json()) as {
        rows?: Row[]
        error?: string
        info?: {
          message?: string
          page1ResultCode?: string
          page1ResultMessage?: string
          roneRowCount?: number
        }
        perQuarter?: Array<{ year: number; quarter: number; matched: number }>
        count?: number
      }
      if (!resp.ok) throw new Error(data?.error || '수집 실패')
      const matched = data.perQuarter?.filter((p) => p.matched > 0).length ?? 0
      const totalQ = data.perQuarter?.length ?? 0
      const diag = data.info
      const diagLines =
        diag &&
        ((data.count ?? 0) === 0 || matched === 0 || totalQ === 0)
          ? [
              diag.message,
              diag.roneRowCount != null ? `R-ONE 원본 행 수: ${diag.roneRowCount}` : '',
              diag.page1ResultCode || diag.page1ResultMessage
                ? `첫 페이지 API: ${[diag.page1ResultCode, diag.page1ResultMessage].filter(Boolean).join(' — ')}`
                : '',
            ].filter((s): s is string => Boolean(s && String(s).trim()))
          : []
      const diagBlock = diagLines.length ? `\n\n${diagLines.join('\n')}` : ''
      alert(
        `기간 일괄 수집 완료: DB 반영 ${data.count ?? 0}행, 분기 중 데이터 매칭 ${matched}/${totalQ}${diagBlock}`,
      )
      setIngResult((data?.rows ?? []).map((r) => ({
        period: r.period,
        wrttime_desc: r.wrttime_desc,
        region_code: r.region_code,
        region_name: r.region_name,
        value: r.value,
      })))
      setShowDetails(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(msg || '수집 실패')
    } finally {
      setIngLoading(false)
    }
  }

  const fetchRows = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setRows([])
    try {
      let query = supabase
        .from(TABLE)
        .select('period, wrttime_desc, region_code, region_name, value')
        // YYYYMM + YYYY0Q 모두 포함
        .or(
          [
            `and(period.gte.${startPeriod},period.lte.${endPeriod})`,
            `and(period.gte.${toDbPeriod5(startYear, startQ)},period.lte.${toDbPeriod5(endYear, endQ)})`,
          ].join(',')
        )
        .order('period', { ascending: false })
        .order('region_code', { ascending: true })

      if (region !== 'ALL') query = query.eq('region_code', region)

      const { data, error: err } = await query.returns<Row[]>()
      if (err) throw err
      setRows(data ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || '조회 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const years = Array.from({ length: 20 }, (_, i) => now.getFullYear() - i)

  const downloadExcel = (): void => {
    const url = new URL('/api/rone/office-index/export', window.location.origin)
    url.searchParams.set('startYear', String(startYear))
    url.searchParams.set('startQ', String(startQ))
    url.searchParams.set('endYear', String(endYear))
    url.searchParams.set('endQ', String(endQ))
    url.searchParams.set('region', region)
    window.location.href = url.toString()
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500 whitespace-nowrap">R-ONE</div>
          <h2 className="text-2xl font-bold whitespace-nowrap">임대동향 지역별 임대가격지수(오피스)</h2>
        </div>
        <Link
          href="/data"
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap"
        >
          ← 뒤로가기
        </Link>
      </div>

      {/* 수집 카드 */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold whitespace-nowrap">API 수집</div>
          <div className="text-xs text-gray-500 whitespace-nowrap">DB 테이블: {TABLE}</div>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          단일 분기는 아래 연·분기만 수집합니다. 여러 분기는 아래 <b>「기간 일괄 수집」</b>이 조회 카드의 시작~끝 분기를 사용합니다
          (R-ONE 전체 페이지를 <code>list_total_count</code> 기준으로 가져온 뒤, 각 분기별로 CBD/KBD/YBD만 추립니다).
        </p>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <label className="text-sm">
            <div className="text-gray-600 mb-1 whitespace-nowrap">연도</div>
            <select
              value={ingYear}
              onChange={(e) => setIngYear(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 bg-white"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1 whitespace-nowrap">분기</div>
            <select
              value={ingQ}
              onChange={(e) => setIngQ(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 bg-white"
            >
              <option value={1}>1분기</option>
              <option value={2}>2분기</option>
              <option value={3}>3분기</option>
              <option value={4}>4분기</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              onClick={ingest}
              disabled={ingLoading}
              className="w-full inline-flex items-center justify-center whitespace-nowrap min-w-[96px] rounded-md bg-black text-white px-4 py-2.5 disabled:opacity-50"
            >
              {ingLoading ? '수집 중…' : '단일 분기 수집'}
            </button>
          </div>
          <div className="flex items-end">
            <button
              onClick={ingestRange}
              disabled={ingLoading}
              className="w-full inline-flex items-center justify-center whitespace-nowrap min-w-[96px] rounded-md bg-[#c2410c] text-white px-4 py-2.5 disabled:opacity-50"
              title="아래 조회 카드의 시작·끝 연도/분기 범위로 일괄 수집"
            >
              {ingLoading ? '수집 중…' : '기간 일괄 수집'}
            </button>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="w-full inline-flex items-center justify-center whitespace-nowrap min-w-[96px] rounded-md border px-4 py-2.5"
            >
              {showDetails ? '결과 숨기기' : '결과 보기'}
            </button>
          </div>
        </div>

        {showDetails && (
          <div className="mt-4">
            <div className="text-sm text-gray-600 mb-2">수집 결과</div>
            <div className="rounded-lg border overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                    <th className="whitespace-nowrap">분기(설명)</th>
                    <th className="whitespace-nowrap">시점코드</th>
                    <th className="whitespace-nowrap">지역</th>
                    <th className="whitespace-nowrap text-right">값</th>
                  </tr>
                </thead>
                <tbody>
                  {ingResult.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-gray-500">수집 결과가 없습니다.</td>
                    </tr>
                  ) : (
                    ingResult.map((r, i) => (
                      <tr key={`${r.period}-${r.region_code}-${i}`} className="odd:bg-white even:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">{r.wrttime_desc ?? descFromPeriod(r.period)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.period}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.region_name ?? r.region_code}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.value != null ? r.value.toLocaleString() : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 조회 카드 */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="font-semibold whitespace-nowrap">DB 조회 (기간: 연도/분기)</div>

        {/* 시작 ~ 끝 입력 */}
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-7 gap-3 items-end">
          {/* 시작 */}
          <label className="text-sm">
            <div className="text-gray-600 mb-1 whitespace-nowrap">시작 연도</div>
            <select
              value={startYear}
              onChange={(e) => setStartYear(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 bg-white"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1 whitespace-nowrap">시작 분기</div>
            <select
              value={startQ}
              onChange={(e) => setStartQ(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 bg-white"
            >
              <option value={1}>1분기</option>
              <option value={2}>2분기</option>
              <option value={3}>3분기</option>
              <option value={4}>4분기</option>
            </select>
          </label>

          {/* 끝 */}
          <label className="text-sm">
            <div className="text-gray-600 mb-1 whitespace-nowrap">끝 연도</div>
            <select
              value={endYear}
              onChange={(e) => setEndYear(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 bg-white"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1 whitespace-nowrap">끝 분기</div>
            <select
              value={endQ}
              onChange={(e) => setEndQ(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 bg-white"
            >
              <option value={1}>1분기</option>
              <option value={2}>2분기</option>
              <option value={3}>3분기</option>
              <option value={4}>4분기</option>
            </select>
          </label>

          {/* 지역 */}
          <label className="text-sm">
            <div className="text-gray-600 mb-1 whitespace-nowrap">지역</div>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as 'ALL' | 'CBD' | 'KBD' | 'YBD')}
              className="w-full rounded-md border px-3 py-2 bg-white"
            >
              <option value="ALL">전체</option>
              <option value="CBD">CBD</option>
              <option value="KBD">KBD</option>
              <option value="YBD">YBD</option>
            </select>
          </label>

          {/* 버튼들 */}
          <div className="flex gap-2 col-span-3 sm:col-span-2">
            <button
              onClick={fetchRows}
              disabled={loading}
              className="inline-flex items-center justify-center whitespace-nowrap min-w-[96px] rounded-md bg-black text-white px-4 py-2.5 disabled:opacity-50"
            >
              {loading ? '조회 중…' : '조회'}
            </button>
            <button
              onClick={downloadExcel}
              className="inline-flex items-center justify-center whitespace-nowrap min-w-[96px] rounded-md border px-4 py-2.5"
            >
              엑셀
            </button>
          </div>
        </div>

        {/* 결과 테이블 */}
        <div className="mt-4">
          <div className="rounded-lg border overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                  <th className="whitespace-nowrap">분기(설명)</th>
                  <th className="whitespace-nowrap">시점코드</th>
                  <th className="whitespace-nowrap">지역</th>
                  <th className="text-right whitespace-nowrap">값</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-red-600">{error}</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-gray-500">조회 결과가 없습니다.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={`${r.period}-${r.region_code}-${i}`} className="odd:bg-white even:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">{r.wrttime_desc ?? descFromPeriod(r.period)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.period}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.region_name ?? r.region_code}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {r.value != null ? r.value.toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
