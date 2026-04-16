// src/app/dart-financial-raw/page.tsx
// XBRL 시트코드 기준 원장행 뷰 (DS320005/DS220005/DS220000/DS320000)
'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatDartCorpLabel, mergeDartCorpsFromDb, type MergedDartCorp } from '@/data/dartCorpRows'
import { Table2 } from 'lucide-react'

type CorpItem = MergedDartCorp

type FnlttLine = {
  sheet_code: string
  sheet_name: string
  account_nm: string | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
  ord: number | null
  currency: string | null
}

const REPRTS = [
  { code: '11011', name: '사업보고서(연간)' },
  { code: '11014', name: '3분기보고서' },
  { code: '11012', name: '반기보고서' },
  { code: '11013', name: '1분기보고서' },
] as const

type ReprtCode = (typeof REPRTS)[number]['code']

type XbrlSheetJson = {
  ok?: boolean
  rows?: FnlttLine[]
  headcount?: number | null
  headcount_source?: string | null
  saved_count?: number
  headcount_saved?: boolean
  error?: string
}

const BATCH_GAP_MS = 400

const UNITS = [
  { label: '원', value: 1 },
  { label: '천원', value: 1_000 },
  { label: '백만원', value: 1_000_000 },
  { label: '억원', value: 100_000_000 },
] as const

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export default function DartFinancialRawPage() {
  const defaultYear = new Date().getFullYear() - 1
  const [year, setYear] = useState(defaultYear)
  const [reprt, setReprt] = useState<ReprtCode>('11011')
  const [unit, setUnit] = useState(100_000_000)

  const [corps, setCorps] = useState<CorpItem[]>([])
  const [corpCode, setCorpCode] = useState('')
  const [loadingCorps, setLoadingCorps] = useState(false)

  const [loading, setLoading] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; label: string } | null>(null)
  const [batchSummary, setBatchSummary] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [rows, setRows] = useState<FnlttLine[]>([])
  const [headcount, setHeadcount] = useState<number | null>(null)
  const [empNote, setEmpNote] = useState<string | undefined>(undefined)
  const [saveNote, setSaveNote] = useState<string | undefined>(undefined)

  const [filterDs320005, setFilterDs320005] = useState('')
  const [filterDs220005, setFilterDs220005] = useState('')
  const [filterDs220000, setFilterDs220000] = useState('')
  const [filterDs320000, setFilterDs320000] = useState('')

  const corpName = useMemo(
    () => corps.find((c) => c.corp_code === corpCode)?.corp_name ?? corpCode,
    [corps, corpCode],
  )

  useEffect(() => {
    const load = async () => {
      setLoadingCorps(true)
      try {
        const res = await fetch('/api/dart/corps')
        const data = (await res.json()) as {
          list?: { corp_code: string; corp_name: string; tier?: string | null; is_peer?: boolean | null }[]
        }
        const list = mergeDartCorpsFromDb(data?.list ?? [])
        setCorps(list)
        setCorpCode((prev) => {
          if (prev && list.some((c) => c.corp_code === prev)) return prev
          return list[0]?.corp_code ?? ''
        })
      } finally {
        setLoadingCorps(false)
      }
    }
    load()
  }, [])

  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })

  const filterRows = (rows: FnlttLine[], q: string) => {
    const ordered = [...rows].sort((a, b) => {
      const ao = a.ord ?? 1e12
      const bo = b.ord ?? 1e12
      if (ao !== bo) return ao - bo
      return String(a.account_nm ?? '').localeCompare(String(b.account_nm ?? ''), 'ko')
    })
    const s = q.trim().toLowerCase()
    if (!s) return ordered
    return ordered.filter((r) => {
      const nm = (r.account_nm ?? '').toLowerCase()
      return nm.includes(s)
    })
  }

  const ds320005Rows = useMemo(
    () => filterRows(rows.filter((r) => r.sheet_code === 'DS320005'), filterDs320005),
    [rows, filterDs320005],
  )
  const ds220005Rows = useMemo(
    () => filterRows(rows.filter((r) => r.sheet_code === 'DS220005'), filterDs220005),
    [rows, filterDs220005],
  )
  const ds220000Rows = useMemo(
    () => filterRows(rows.filter((r) => r.sheet_code === 'DS220000'), filterDs220000),
    [rows, filterDs220000],
  )
  const ds320000Rows = useMemo(
    () => filterRows(rows.filter((r) => r.sheet_code === 'DS320000'), filterDs320000),
    [rows, filterDs320000],
  )

  const applySheetJsonToUi = useCallback((fnJson: XbrlSheetJson) => {
    setRows(fnJson.rows ?? [])
    setHeadcount(fnJson.headcount ?? null)
    setEmpNote(
      fnJson.headcount != null
        ? `XBRL source: ${fnJson.headcount_source ?? 'dart-gcd_NumberOfEmployee'}`
        : 'XBRL에서 인원수 항목을 찾지 못했습니다. (fnltt + XBRL ZIP 검사)',
    )
    setSaveNote(
      `DB 저장 완료: dart_fnltt ${fnJson.saved_count ?? 0}행` +
        (fnJson.headcount_saved ? `, dart_headcount 반영(인원수)` : ''),
    )
  }, [])

  const fetchSheetRows = useCallback(
    async (cc: string): Promise<XbrlSheetJson> => {
      const q = new URLSearchParams({
        corp_code: cc,
        year: String(year),
        reprt,
      })
      const fnRes = await fetch(`/api/dart/xbrl-sheet-rows?` + q.toString())
      const fnJson = (await fnRes.json()) as XbrlSheetJson
      if (!fnRes.ok || !fnJson.ok) throw new Error(fnJson.error ?? '원장 조회 실패')
      return fnJson
    },
    [year, reprt],
  )

  const loadAll = useCallback(async () => {
    if (!corpCode) return
    setLoading(true)
    setError('')
    setBatchSummary(null)
    try {
      const fnJson = await fetchSheetRows(corpCode)
      applySheetJsonToUi(fnJson)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류')
      setRows([])
      setHeadcount(null)
      setEmpNote(undefined)
      setSaveNote(undefined)
    } finally {
      setLoading(false)
    }
  }, [corpCode, fetchSheetRows, applySheetJsonToUi])

  const loadBatch = useCallback(async () => {
    if (corps.length === 0 || batchBusy) return
    const ok = window.confirm(
      `목록의 ${corps.length}개 회사에 대해 연도 ${year}, 보고서 ${REPRTS.find((r) => r.code === reprt)?.name ?? reprt} 기준으로 순차 조회·저장합니다.\n` +
        `OpenDART 호출이 많아 수 분 이상 걸릴 수 있습니다. 계속할까요?`,
    )
    if (!ok) return

    setBatchBusy(true)
    setBatchSummary(null)
    setError('')
    setBatchProgress({ current: 0, total: corps.length, label: '' })

    let success = 0
    let failed = 0
    const failures: string[] = []

    try {
      for (let i = 0; i < corps.length; i++) {
        const c = corps[i]
        setBatchProgress({ current: i + 1, total: corps.length, label: c.corp_name })
        try {
          await fetchSheetRows(c.corp_code)
          success++
        } catch (e: unknown) {
          failed++
          const msg = e instanceof Error ? e.message : '오류'
          failures.push(`${c.corp_name} (${c.corp_code}): ${msg}`)
        }
        if (i < corps.length - 1) {
          await new Promise((r) => setTimeout(r, BATCH_GAP_MS))
        }
      }

      setBatchSummary(
        `일괄 저장 완료: 성공 ${success}건, 실패 ${failed}건 · 연도 ${year} · 보고서 ${reprt}` +
          (failures.length > 0 ? `\n실패: ${failures.slice(0, 8).join(' · ')}${failures.length > 8 ? ` 외 ${failures.length - 8}건` : ''}` : ''),
      )

      if (corpCode) {
        try {
          const fnJson = await fetchSheetRows(corpCode)
          applySheetJsonToUi(fnJson)
        } catch {
          setRows([])
          setHeadcount(null)
          setEmpNote(undefined)
          setSaveNote(undefined)
        }
      }
    } finally {
      setBatchProgress(null)
      setBatchBusy(false)
    }
  }, [corps, year, reprt, batchBusy, corpCode, fetchSheetRows, applySheetJsonToUi])

  const ctrlCls =
    'h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-[var(--fw-text)] focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200'

  const unitLabel = UNITS.find((u) => u.value === unit)?.label ?? '원'
  const div = unit || 1

  const LineTable = ({
    title,
    rows,
    icon,
  }: {
    title: string
    rows: FnlttLine[]
    icon: ReactNode
  }) => (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-100">
        {icon}
        <h3 className="font-semibold text-sm">{title}</h3>
        <span className="text-xs text-zinc-500">({rows.length}행)</span>
      </div>
      <div className="overflow-auto max-h-[min(55vh,480px)]">
        <table className="min-w-[720px] w-full text-[11px] md:text-[12px]">
          <thead className="bg-zinc-50/90 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold border-b w-12">ord</th>
              <th className="px-2 py-1.5 text-left font-semibold border-b w-[220px]">계정명</th>
              <th className="px-2 py-1.5 text-right font-semibold border-b">당기 ({unitLabel})</th>
              <th className="px-2 py-1.5 text-right font-semibold border-b">전기 ({unitLabel})</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                  행이 없습니다. 대상 공시가 맞는지 확인한 뒤 다시 불러오세요.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={`${r.ord}-${r.account_nm}-${idx}`} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                  <td className="px-2 py-1 text-right text-zinc-500">{r.ord ?? '—'}</td>
                  <td className="px-2 py-1 max-w-[200px] truncate" title={r.account_nm ?? ''}>
                    {r.account_nm ?? '—'}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(round2((r.thstrm_amount ?? 0) / div))}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-zinc-600">{fmt(round2((r.frmtrm_amount ?? 0) / div))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 text-[var(--fw-text)] md:space-y-5">
      <div className="flex items-start gap-2">
        <Table2 className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">DART BS/PL 원시 (XBRL 시트코드 기준)</h1>
          <p className="text-[13px] text-zinc-600 mt-1 leading-relaxed">
            요청하신 시트코드 <code className="text-[11px] bg-zinc-100 px-1 rounded">DS320005</code>,{' '}
            <code className="text-[11px] bg-zinc-100 px-1 rounded">DS220005</code>,{' '}
            <code className="text-[11px] bg-zinc-100 px-1 rounded">DS220000</code>,{' '}
            <code className="text-[11px] bg-zinc-100 px-1 rounded">DS320000</code> 에 해당하는 계정행만 표시합니다.
          </p>
          <p className="text-[13px] text-zinc-600 mt-2 leading-relaxed">
            데이터는 OpenDART 재무제표 API를 조회해 표시하며, 필요하면 임직원(<code className="text-[11px] bg-zinc-100 px-1 rounded">empSttus</code>)을 함께 보여줍니다.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3 md:p-4 shadow-sm space-y-3">
        <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 items-end">
          <div className="flex flex-col gap-1 min-w-0 col-span-2 lg:col-span-1">
            <label className="text-[11px] text-zinc-600">회사</label>
            <select value={corpCode} onChange={(e) => setCorpCode(e.target.value)} className={ctrlCls} disabled={loadingCorps}>
              {loadingCorps ? (
                <option>Loading…</option>
              ) : (
                corps.map((c) => (
                  <option key={c.corp_code} value={c.corp_code}>
                    {c.corp_name} · {formatDartCorpLabel(c.tier, c.is_peer)} ({c.corp_code})
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[11px] text-zinc-600">연도</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value || '0', 10))}
              className={ctrlCls}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[11px] text-zinc-600">보고서</label>
            <select value={reprt} onChange={(e) => setReprt(e.target.value as ReprtCode)} className={ctrlCls}>
              {REPRTS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[11px] text-zinc-600">금액 단위</label>
            <select value={unit} onChange={(e) => setUnit(parseInt(e.target.value, 10))} className={ctrlCls}>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0 col-span-2 lg:col-span-4 xl:col-span-2">
            <label className="text-[11px] text-transparent select-none">실행</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={loadAll}
                disabled={!corpCode || loading || batchBusy}
                className="h-10 flex-1 rounded-md bg-[#ea580c] px-4 text-sm text-white hover:bg-[#c2410c] disabled:opacity-50"
              >
                {loading ? '불러오는 중…' : '불러오기'}
              </button>
              <button
                type="button"
                onClick={loadBatch}
                disabled={corps.length === 0 || loading || batchBusy}
                className="h-10 flex-1 rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                {batchBusy ? '일괄 처리 중…' : '일괄 불러오기'}
              </button>
            </div>
          </div>
        </div>
        {batchProgress ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="tabular-nums font-medium">
              {batchProgress.current} / {batchProgress.total}
            </span>
            {batchProgress.label ? (
              <span className="ml-2 text-amber-800">
                {batchProgress.label}
                <span className="text-amber-600 font-mono ml-1">
                  ({corps[batchProgress.current - 1]?.corp_code ?? ''})
                </span>
              </span>
            ) : null}
          </div>
        ) : null}
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
        {batchSummary ? (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 whitespace-pre-wrap">{batchSummary}</div>
        ) : null}
        {saveNote ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{saveNote}</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wide">회사</div>
          <div className="text-base font-semibold mt-1">{corpName}</div>
          <div className="text-xs text-zinc-500 font-mono mt-0.5">{corpCode}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:col-span-2">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wide">임직원 (정기보고 empSttus)</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">
            {headcount != null ? headcount.toLocaleString() : '—'}
            <span className="text-sm font-normal text-zinc-500 ml-2">명</span>
          </div>
          {empNote ? <div className="text-xs text-amber-700 mt-1">{empNote}</div> : null}
        </div>
      </div>

      <div className="space-y-4">
        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 md:p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-800">별도 재무제표</h3>
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-sm font-medium text-zinc-700">포괄손익계산서, 증권 - 별도</span>
              <input
                type="text"
                value={filterDs320005}
                onChange={(e) => setFilterDs320005(e.target.value)}
                placeholder="계정명"
                className={ctrlCls + ' placeholder:text-[11px] sm:max-w-64'}
              />
            </div>
            <LineTable title="포괄손익계산서, 증권 - 별도" rows={ds320005Rows} icon={<span className="text-orange-600 text-xs font-bold">PL</span>} />
          </div>
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-sm font-medium text-zinc-700">재무상태표, 증권 - 별도</span>
              <input
                type="text"
                value={filterDs220005}
                onChange={(e) => setFilterDs220005(e.target.value)}
                placeholder="계정명"
                className={ctrlCls + ' placeholder:text-[11px] sm:max-w-64'}
              />
            </div>
            <LineTable title="재무상태표, 증권 - 별도" rows={ds220005Rows} icon={<span className="text-orange-600 text-xs font-bold">BS</span>} />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 md:p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-800">연결 재무제표</h3>
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-sm font-medium text-zinc-700">포괄손익계산서, 증권 - 연결</span>
              <input
                type="text"
                value={filterDs320000}
                onChange={(e) => setFilterDs320000(e.target.value)}
                placeholder="계정명"
                className={ctrlCls + ' placeholder:text-[11px] sm:max-w-64'}
              />
            </div>
            <LineTable title="포괄손익계산서, 증권 - 연결" rows={ds320000Rows} icon={<span className="text-orange-600 text-xs font-bold">PL</span>} />
          </div>
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-sm font-medium text-zinc-700">재무상태표, 증권 - 연결</span>
              <input
                type="text"
                value={filterDs220000}
                onChange={(e) => setFilterDs220000(e.target.value)}
                placeholder="계정명"
                className={ctrlCls + ' placeholder:text-[11px] sm:max-w-64'}
              />
            </div>
            <LineTable title="재무상태표, 증권 - 연결" rows={ds220000Rows} icon={<span className="text-orange-600 text-xs font-bold">BS</span>} />
          </div>
        </section>
      </div>
    </div>
  )
}
