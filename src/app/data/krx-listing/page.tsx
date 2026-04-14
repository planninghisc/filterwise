// 코드 디렉토리: src/app/data/krx-listing/page.tsx
'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'

type Row = {
  prd_de: string
  market: string
  listed_count: number | null
  avg_capital_100b: number | null
  avg_mktcap_100b: number | null
  sum_mktcap_100b: number | null
  avg_offer_100b: number | null
  sum_offer_100b: number | null
  roll12_offer_trillion: number | null
}

const now = new Date()
const DEFAULT_YEAR = now.getFullYear()
const DEFAULT_START = `${DEFAULT_YEAR}-01`
const DEFAULT_END = `${DEFAULT_YEAR}-12`

export default function Page() {
  const [startYm, setStartYm] = useState<string>(DEFAULT_START)
  const [endYm, setEndYm] = useState<string>(DEFAULT_END)

  const [ingestLoading, setIngestLoading] = useState(false)
  const [queryLoading, setQueryLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])

  const disabled = useMemo(() => ingestLoading || queryLoading, [ingestLoading, queryLoading])

  const validateRange = useCallback(() => {
    const re = /^\d{4}-(0[1-9]|1[0-2])$/
    if (!re.test(startYm) || !re.test(endYm)) {
      return 'YYYY-MM 형식으로 선택해주세요.'
    }
    if (startYm > endYm) {
      return '시작 월이 종료 월보다 이후일 수 없습니다.'
    }
    return null
  }, [startYm, endYm])

  const onIngest = useCallback(async () => {
    try {
      setErrorMsg(null)
      const v = validateRange()
      if (v) throw new Error(v)

      setIngestLoading(true)
      const fallbackYear = endYm.slice(0, 4)

      const url = new URL('/api/ingest/krx/monthly-listing', window.location.origin)
      url.searchParams.set('year', fallbackYear)
      url.searchParams.set('startYm', startYm)
      url.searchParams.set('endYm', endYm)

      const res = await fetch(url.toString(), { method: 'GET' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.detail || data?.error || '수집 실패')
      }
      await onQuery()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      setErrorMsg(`수집 실패: ${msg}`)
    } finally {
      setIngestLoading(false)
    }
  }, [startYm, endYm, validateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const onQuery = useCallback(async () => {
    try {
      setErrorMsg(null)
      const v = validateRange()
      if (v) throw new Error(v)

      setQueryLoading(true)
      const url = new URL('/api/query/krx/monthly-listing', window.location.origin)
      url.searchParams.set('startYm', startYm)
      url.searchParams.set('endYm', endYm)
      const res = await fetch(url.toString(), { method: 'GET' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.detail || data?.error || '조회 실패')
      setRows((data.rows ?? []) as Row[])
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      setErrorMsg(`조회 실패: ${msg}`)
    } finally {
      setQueryLoading(false)
    }
  }, [startYm, endYm, validateRange])

  const fmt = (v: number | null | undefined, digits = 2) =>
    v == null ? '-' : v.toLocaleString(undefined, { maximumFractionDigits: digits })

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">KRX</div>
          <h2 className="text-2xl font-bold">월별 상장 통계 (KOSDAQ)</h2>
        </div>
        {/* 뒤로가기 */}
        <Link
          href="/data"
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm shadow-sm hover:shadow transition"
          aria-label="뒤로가기"
        >
          ← 데이터 목록
        </Link>
      </div>

      {/* 컨트롤 패널 */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1">
            <span className="text-xs text-gray-500">시작(월)</span>
            <input
              type="month"
              value={startYm}
              onChange={(e) => setStartYm(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-gray-500">종료(월)</span>
            <input
              type="month"
              value={endYm}
              onChange={(e) => setEndYm(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <div className="flex-1" />

          <button
            type="button"
            onClick={onIngest}
            disabled={disabled}
            className="rounded-lg border px-4 py-2 text-sm font-medium shadow-sm hover:shadow disabled:opacity-50"
          >
            {ingestLoading ? '수집 중…' : '수집/갱신'}
          </button>

          <button
            type="button"
            onClick={onQuery}
            disabled={queryLoading}
            className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:shadow disabled:opacity-50"
          >
            {queryLoading ? '조회 중…' : 'DB 조회'}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          기간은 자유롭게 선택할 수 있습니다. 기본값은 {DEFAULT_YEAR}년 1월~12월입니다.
        </p>

        {errorMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}
      </div>

      {/* 결과 테이블 */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">기간</th>
              <th className="px-3 py-2 text-right">상장 기업수(개)</th>
              <th className="px-3 py-2 text-right">평균 상장자본금(천억)</th>
              <th className="px-3 py-2 text-right">평균 시가총액(천억)</th>
              <th className="px-3 py-2 text-right">시가총액 합계(천억)</th>
              <th className="px-3 py-2 text-right">평균 공모금액(천억)</th>
              <th className="px-3 py-2 text-right">공모금액 합계(천억)</th>
              <th className="px-3 py-2 text-right">직전 12개월 공모총액(조)</th>
              <th className="px-3 py-2 text-left">시장</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={9}>
                  조회 결과가 없습니다. 기간을 선택 후 ‘DB 조회’를 눌러주세요.
                </td>
              </tr>
            ) : (
              rows
                .slice()
                .sort((a, b) => (a.prd_de < b.prd_de ? -1 : a.prd_de > b.prd_de ? 1 : 0))
                .map((r) => (
                  <tr key={`${r.prd_de}-${r.market}`} className="border-t">
                    <td className="px-3 py-2">{r.prd_de}</td>
                    <td className="px-3 py-2 text-right">
                      {r.listed_count == null ? '-' : r.listed_count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.avg_capital_100b == null ? '-' : r.avg_capital_100b.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.avg_mktcap_100b == null ? '-' : r.avg_mktcap_100b.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.sum_mktcap_100b == null ? '-' : r.sum_mktcap_100b.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.avg_offer_100b == null ? '-' : r.avg_offer_100b.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.sum_offer_100b == null ? '-' : r.sum_offer_100b.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.roll12_offer_trillion == null ? '-' : r.roll12_offer_trillion.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-left">{r.market}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
