// src/app/dart-analysis/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { CANON_OPTIONS } from '@/lib/accountCanonical'
import { formatDartCorpLabel, mergeDartCorpsFromDb, type MergedDartCorp } from '@/data/dartCorpRows'
import DartAnalysisDashboard, { type DartAnalysisRow } from '@/components/dart/DartAnalysisDashboard'

type CorpItem = MergedDartCorp
type SyncResult = {
  corp_code: string
  sj_div?: string
  ok: boolean
  message?: string
  saved?: number
}

type MetricVal = { th: number; fr: number }
type BoardApiRow = { corp_code: string; corp_name: string; metrics: Record<string, MetricVal> }

const REPRTS = [
  { code: '11011', name: '사업보고서(연간)' },
  { code: '11014', name: '3분기보고서' },
  { code: '11012', name: '반기보고서' },
  { code: '11013', name: '1분기보고서' },
] as const

type ReprtCode = (typeof REPRTS)[number]['code']
type FsDiv = 'OFS' | 'CFS'

const UNITS = [
  { label: '원', value: 1 },
  { label: '천원', value: 1_000 },
  { label: '백만원', value: 1_000_000 },
  { label: '억원', value: 100_000_000 },
  { label: '조원', value: 1_000_000_000_000 },
] as const

/** metrics-board API와 동일 순서 */
const BOARD_KEYS = [
  'PL_REVENUE',
  'PL_OPERATING_PROFIT',
  'PL_SGA',
  'PL_NET_PROFIT',
  'BS_TOTAL_ASSETS',
  'BS_TOTAL_EQUITY',
] as const

const HIGHLIGHT_CORP = '한화투자증권'
const HIGHLIGHT_ROW = '#FFF7ED'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function safeRatio(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
  return num / den
}

export default function DartAnalysisPage() {
  const defaultYear = new Date().getFullYear() - 1
  const [year, setYear] = useState<number>(defaultYear)
  const [reprt, setReprt] = useState<ReprtCode>('11011')
  const [fsDiv, setFsDiv] = useState<FsDiv>('OFS')
  const [unit, setUnit] = useState<number>(100_000_000)
  const [showCurrentOnly, setShowCurrentOnly] = useState<boolean>(false)

  const [corps, setCorps] = useState<CorpItem[]>([])
  const [selectedCorps, setSelectedCorps] = useState<string[]>([])
  const [loadingCorps, setLoadingCorps] = useState(false)

  const [boardRows, setBoardRows] = useState<BoardApiRow[]>([])
  const [headByCode, setHeadByCode] = useState<Map<string, { count: number | null; note?: string }>>(new Map())
  const [loadingRun, setLoadingRun] = useState(false)
  const [runError, setRunError] = useState<string>('')
  /** 기본 false: Supabase dart_fnltt만으로 지표 계산. true면 분석 전 OpenDART fnltt API로 테이블을 덮어씀 */
  const [syncBeforeRun, setSyncBeforeRun] = useState(false)

  /** 계정별 원장 (dart_fnltt 행) */
  const [detailCorp, setDetailCorp] = useState<string>('')
  const [detailSj, setDetailSj] = useState<'ALL' | 'BS' | 'CIS'>('ALL')
  const [detailQuery, setDetailQuery] = useState('')
  const [detailRows, setDetailRows] = useState<
    Array<{
      sj_div: string
      account_nm: string | null
      account_id: string | null
      canon_key: string | null
      canon_score: number | null
      thstrm_amount: number | null
      frmtrm_amount: number | null
      ord: number | null
      currency: string | null
    }>
  >([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState('')
  /** 원장 조회 성공 후 0건일 때 안내 */
  const [detailInfo, setDetailInfo] = useState('')

  const [mainTab, setMainTab] = useState<'dashboard' | 'table' | 'ledger'>('dashboard')

  const corpByCode = useMemo(() => new Map(corps.map((c) => [c.corp_code, c])), [corps])

  const labelByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of [...CANON_OPTIONS.BS, ...CANON_OPTIONS.CIS]) {
      m.set(o.key, o.label)
    }
    return m
  }, [])

  const fmt = (v?: number | null) => (v == null || Number.isNaN(v) ? '-' : v.toLocaleString(undefined, { maximumFractionDigits: 2 }))
  const signClass = (n: number) => (n > 0 ? 'text-red-600' : n < 0 ? 'text-blue-600' : '')

  useEffect(() => {
    const loadCorps = async () => {
      setLoadingCorps(true)
      try {
        const res = await fetch('/api/dart/corps')
        const data = (await res.json()) as {
          list?: { corp_code: string; corp_name: string; tier?: string | null; is_peer?: boolean | null }[]
        }
        const list = mergeDartCorpsFromDb(data?.list ?? [])
        setCorps(list)
        setSelectedCorps(list.map((c) => c.corp_code))
      } finally {
        setLoadingCorps(false)
      }
    }
    loadCorps()
  }, [])

  useEffect(() => {
    if (corps.length === 0) return
    setDetailCorp((prev) => {
      if (prev && corps.some((c) => c.corp_code === prev)) return prev
      return corps[0]!.corp_code
    })
  }, [corps])

  const runAnalysis = useCallback(async () => {
    if (selectedCorps.length === 0) return
    setLoadingRun(true)
    setRunError('')
    try {
      if (syncBeforeRun) {
        const syncRes = await fetch('/api/dart/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            corp_codes: selectedCorps,
            year,
            reprt,
            fs_div: fsDiv,
            sj_divs: ['CIS', 'BS', 'CF', 'SCE'],
          }),
        })
        const syncJson = (await syncRes.json()) as { ok?: boolean; results?: SyncResult[]; error?: string }
        if (!syncRes.ok && !syncJson.results) {
          throw new Error(syncJson.error ?? `동기화 실패 (HTTP ${syncRes.status})`)
        }
        if (Array.isArray(syncJson.results)) {
          const failed = syncJson.results.filter((r) => !r.ok)
          if (failed.length > 0) {
            const first = failed[0]
            throw new Error(
              `DART 동기화 실패 ${failed.length}건 (예: ${first.corp_code}${first.sj_div ? ` ${first.sj_div}` : ''}${first.message ? ` — ${first.message}` : ''})`,
            )
          }
        }
      }

      const q = new URLSearchParams({
        year: String(year),
        reprt,
        fs_div: fsDiv,
        corp_codes: selectedCorps.join(','),
      })
      const boardRes = await fetch(`/api/dart/metrics-board?` + q.toString())
      const boardJson = (await boardRes.json()) as { ok?: boolean; rows?: BoardApiRow[]; error?: string }
      if (!boardRes.ok || !boardJson.ok) {
        throw new Error(boardJson.error ?? '지표 보드 조회에 실패했습니다.')
      }
      setBoardRows(boardJson.rows ?? [])

      const empRes = await fetch(`/api/dart/employees?` + q.toString())
      const empJson = (await empRes.json()) as {
        ok?: boolean
        items?: Array<{ corp_code: string; headcount: number | null; note?: string }>
        error?: string
      }
      if (!empRes.ok || !empJson.ok) {
        throw new Error(empJson.error ?? '임직원 현황 조회에 실패했습니다.')
      }
      const m = new Map<string, { count: number | null; note?: string }>()
      for (const it of empJson.items ?? []) {
        m.set(it.corp_code, { count: it.headcount, note: it.note })
      }
      setHeadByCode(m)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '분석 중 오류가 발생했습니다.'
      setBoardRows([])
      setHeadByCode(new Map())
      setRunError(msg)
    } finally {
      setLoadingRun(false)
    }
  }, [selectedCorps, year, reprt, fsDiv, syncBeforeRun])

  const tableRows = useMemo((): DartAnalysisRow[] => {
    const div = unit || 1
    return boardRows.map((r) => {
      const meta = corpByCode.get(r.corp_code)
      const tier = meta?.tier ?? 'mid'
      const is_peer = meta?.is_peer ?? false
      const emp = headByCode.get(r.corp_code)
      const hc = emp?.count ?? null
      const m = r.metrics
      const scale = (mv: MetricVal) => ({
        th: mv.th / div,
        fr: mv.fr / div,
      })
      const rev = scale(m.PL_REVENUE ?? { th: 0, fr: 0 })
      const op = scale(m.PL_OPERATING_PROFIT ?? { th: 0, fr: 0 })
      const sga = scale(m.PL_SGA ?? { th: 0, fr: 0 })
      const net = scale(m.PL_NET_PROFIT ?? { th: 0, fr: 0 })
      const assets = scale(m.BS_TOTAL_ASSETS ?? { th: 0, fr: 0 })
      const equity = scale(m.BS_TOTAL_EQUITY ?? { th: 0, fr: 0 })

      const revN = m.PL_REVENUE?.th ?? 0
      const opN = m.PL_OPERATING_PROFIT?.th ?? 0
      const netN = m.PL_NET_PROFIT?.th ?? 0
      const astN = m.BS_TOTAL_ASSETS?.th ?? 0
      const eqN = m.BS_TOTAL_EQUITY?.th ?? 0

      const perRev = hc && hc > 0 ? revN / hc : null
      const perOp = hc && hc > 0 ? opN / hc : null
      const roa = safeRatio(netN, astN)
      const roe = safeRatio(netN, eqN)

      return {
        corp_code: r.corp_code,
        corp_name: r.corp_name,
        tier,
        is_peer,
        headcount: hc,
        empNote: emp?.note,
        rev,
        op,
        sga,
        net,
        assets,
        equity,
        perRev,
        perOp,
        roa,
        roe,
      }
    })
  }, [boardRows, headByCode, unit, corpByCode])

  const loadDetailLines = useCallback(async () => {
    if (!detailCorp) return
    setLoadingDetail(true)
    setDetailError('')
    setDetailInfo('')
    try {
      const q = new URLSearchParams({
        corp_code: detailCorp,
        year: String(year),
        reprt,
        fs_div: fsDiv,
      })
      if (detailSj !== 'ALL') q.set('sj_div', detailSj)
      const res = await fetch(`/api/dart/fnltt-rows?` + q.toString())
      const json = (await res.json()) as { ok?: boolean; rows?: typeof detailRows; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? '원장 조회 실패')
      const list = json.rows ?? []
      setDetailRows(list)
      if (list.length === 0) {
        setDetailInfo(
          '해당 조건에 dart_fnltt 원장이 없습니다. 연도·보고서·OFS/CFS가 맞는지 확인하거나, 상단에서 "분석 전 OpenDART 동기화"를 켠 뒤 분석하거나 DART BS/PL RAW에서 적재하세요.',
        )
      }
    } catch (e: unknown) {
      setDetailRows([])
      setDetailError(e instanceof Error ? e.message : '오류')
    } finally {
      setLoadingDetail(false)
    }
  }, [detailCorp, year, reprt, fsDiv, detailSj])

  const filteredDetailRows = useMemo(() => {
    const s = detailQuery.trim().toLowerCase()
    if (!s) return detailRows
    return detailRows.filter((r) => {
      const nm = (r.account_nm ?? '').toLowerCase()
      const id = (r.account_id ?? '').toLowerCase()
      const ck = (r.canon_key ?? '').toLowerCase()
      return nm.includes(s) || id.includes(s) || ck.includes(s)
    })
  }, [detailRows, detailQuery])

  const exportExcel = () => {
    const unitLabel = UNITS.find((u) => u.value === unit)?.label ?? '원'
    const meta: (string | number | boolean)[][] = [
      ['연도', year],
      ['보고서', REPRTS.find((r) => r.code === reprt)?.name ?? reprt],
      ['재무제표구분', fsDiv],
      ['단위(금액)', unitLabel],
      ['당기만 보기', showCurrentOnly],
    ]
    const table = tableRows.map((r) => {
      const row: Record<string, string | number> = {
        회사: r.corp_name,
        임직원수: r.headcount ?? '',
        [`매출액_당기(${unitLabel})`]: round2(r.rev.th),
        [`영업이익_당기(${unitLabel})`]: round2(r.op.th),
        [`판매비와관리비_당기(${unitLabel})`]: round2(r.sga.th),
        [`당기순이익_당기(${unitLabel})`]: round2(r.net.th),
        [`자산총계_당기(${unitLabel})`]: round2(r.assets.th),
        [`자본총계_당기(${unitLabel})`]: round2(r.equity.th),
        '인당 매출(원)': r.perRev == null ? '' : round2(r.perRev),
        '인당 영업이익(원)': r.perOp == null ? '' : round2(r.perOp),
        ROA: r.roa == null ? '' : round2(r.roa * 100),
        ROE: r.roe == null ? '' : round2(r.roe * 100),
      }
      if (!showCurrentOnly) {
        row[`매출액_전기(${unitLabel})`] = round2(r.rev.fr)
        row[`영업이익_전기(${unitLabel})`] = round2(r.op.fr)
        row[`판매비와관리비_전기(${unitLabel})`] = round2(r.sga.fr)
        row[`당기순이익_전기(${unitLabel})`] = round2(r.net.fr)
        row[`자산총계_전기(${unitLabel})`] = round2(r.assets.fr)
        row[`자본총계_전기(${unitLabel})`] = round2(r.equity.fr)
      }
      return row
    })
    const wb = XLSX.utils.book_new()
    const wsMeta = XLSX.utils.aoa_to_sheet(meta)
    const wsData = XLSX.utils.json_to_sheet(table)
    XLSX.utils.book_append_sheet(wb, wsMeta, '조건')
    XLSX.utils.book_append_sheet(wb, wsData, '지표')
    XLSX.writeFile(wb, `DART_증권사지표_${year}_${fsDiv}.xlsx`)
  }

  const allSelected = selectedCorps.length === corps.length && corps.length > 0
  const toggleAll = () => {
    allSelected ? setSelectedCorps([]) : setSelectedCorps(corps.map((c) => c.corp_code))
  }
  const toggleCorp = (code: string, checked: boolean) => {
    setSelectedCorps((prev) => (checked ? Array.from(new Set([...prev, code])) : prev.filter((c) => c !== code)))
  }

  const ctrlCls =
    'h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-[var(--fw-text)] focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200'

  return (
    <div className="space-y-4 text-[var(--fw-text)] md:space-y-5">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm md:p-4">
        <p className="text-[13px] text-zinc-600 leading-relaxed mb-3">
          <strong className="font-semibold text-zinc-800">손익·재무 지표</strong>는 DB{' '}
          <code className="text-[12px] bg-zinc-100 px-1 rounded">dart_fnltt</code>에 저장된 원장을 표준 계정으로 묶어 집계합니다(별도 OpenDART 호출 없음).{' '}
          <strong className="font-semibold text-zinc-800">인당 매출·인당 영업이익·ROA·ROE</strong> 등은 그 금액과 임직원 수(empSttus)로 계산합니다. 데이터가 없으면 아래에서
          &quot;분석 전 OpenDART 동기화&quot;를 켜거나 DART BS/PL RAW 등으로 먼저 <code className="text-[12px] bg-zinc-100 px-1 rounded">dart_fnltt</code>를
          채우세요. 대상 회사는 <strong className="font-semibold text-zinc-800">CORP registration</strong>에서 관리합니다.
        </p>
        <p className="text-[12px] text-zinc-500 leading-relaxed mb-3 border-l-2 border-zinc-200 pl-3">
          전자공시 재무 데이터는 원천적으로 <strong className="text-zinc-700">XBRL</strong> 태그가 붙은 정기보고서에서 옵니다. OpenDART{' '}
          <code className="text-[11px] bg-zinc-100 px-1 rounded">fnlttSinglAcnt</code> /{' '}
          <code className="text-[11px] bg-zinc-100 px-1 rounded">fnlttMultiAcnt</code> API는 그 항목을 JSON으로 내려주며, 본 화면·DB에는 계정명·IFRS
          계정코드(<code className="text-[11px]">account_id</code>)·금액 필드가 저장됩니다. 즉 <strong className="text-zinc-700">공시·API 기준 구조화 데이터</strong>이지,
          이 앱 안에서 XBRL 인스턴스 문서를 직접 파싱하지는 않습니다.
        </p>
        <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 items-end">
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">연도</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value || '0', 10))}
              className={ctrlCls}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">보고서</label>
            <select value={reprt} onChange={(e) => setReprt(e.target.value as ReprtCode)} className={ctrlCls}>
              {REPRTS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">재무제표 구분</label>
            <div className="flex overflow-hidden rounded-md border border-zinc-300">
              <button
                type="button"
                onClick={() => setFsDiv('OFS')}
                className={`flex-1 h-10 text-[clamp(12px,1.05vw,14px)] ${
                  fsDiv === 'OFS' ? 'bg-[#ea580c] text-white' : 'bg-white text-zinc-700'
                }`}
              >
                단일(OFS)
              </button>
              <button
                type="button"
                onClick={() => setFsDiv('CFS')}
                className={`flex-1 h-10 text-[clamp(12px,1.05vw,14px)] border-l ${
                  fsDiv === 'CFS' ? 'bg-[#ea580c] text-white' : 'bg-white text-zinc-700'
                }`}
              >
                연결(CFS)
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">금액 단위</label>
            <select value={unit} onChange={(e) => setUnit(parseInt(e.target.value, 10))} className={ctrlCls}>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center justify-end gap-2 min-w-0 col-span-2 xl:col-span-1">
            <input
              type="checkbox"
              checked={showCurrentOnly}
              onChange={(e) => setShowCurrentOnly(e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            <span className="text-[clamp(12px,1.05vw,14px)]">재무 당기만 표시</span>
          </label>
          <label className="flex items-center gap-2 min-w-0 col-span-2 xl:col-span-2">
            <input
              type="checkbox"
              checked={syncBeforeRun}
              onChange={(e) => setSyncBeforeRun(e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            <span className="text-[clamp(12px,1.05vw,14px)] text-zinc-700">
              분석 전 OpenDART 동기화 (fnltt → <code className="text-[11px] bg-zinc-100 px-1 rounded">dart_fnltt</code> 덮어쓰기)
            </span>
          </label>
          <div className="flex flex-wrap gap-2 xl:col-span-1 items-end">
            <button
              type="button"
              onClick={runAnalysis}
              disabled={selectedCorps.length === 0 || loadingRun}
              className="h-10 rounded-md bg-[#ea580c] px-4 text-sm text-white hover:bg-[#c2410c] disabled:opacity-50"
            >
              {loadingRun ? '분석 중…' : syncBeforeRun ? '동기화 후 분석' : 'dart_fnltt로 분석'}
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={tableRows.length === 0}
              className="h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm hover:border-orange-200 hover:bg-orange-50 disabled:opacity-50"
            >
              Excel
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm md:p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold text-[clamp(13px,1.1vw,14px)]">회사 선택</h4>
          <button
            type="button"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm hover:border-orange-200 hover:bg-orange-50"
            onClick={toggleAll}
          >
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {loadingCorps ? (
            <div className="col-span-full text-sm text-zinc-500">회사 목록 불러오는 중…</div>
          ) : (
            corps.map((c) => {
              const checked = selectedCorps.includes(c.corp_code)
              return (
                <label key={c.corp_code} className="flex items-center gap-2 text-[clamp(12px,1.05vw,14px)]">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleCorp(c.corp_code, e.target.checked)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="truncate">
                    {c.corp_name}{' '}
                    <span className="text-zinc-400 text-[11px]">({formatDartCorpLabel(c.tier, c.is_peer)})</span>
                  </span>
                </label>
              )
            })
          )}
        </div>
      </div>

      {runError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{runError}</div>
      ) : null}

      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-1 px-2 py-2 border-b border-zinc-100 bg-zinc-50/90">
          {(
            [
              { id: 'dashboard' as const, label: '대시보드' },
              { id: 'table' as const, label: '상세 표' },
              { id: 'ledger' as const, label: '계정 원장' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMainTab(t.id)}
              className={[
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                mainTab === t.id ? 'bg-[#ea580c] text-white' : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-orange-50',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mainTab === 'dashboard' ? (
          <div className="p-3 md:p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-[clamp(13px,1.1vw,14px)] text-zinc-900">
                그룹·회사별 시각화 · {year}년 · {REPRTS.find((r) => r.code === reprt)?.name} · {fsDiv}
              </h3>
              <p className="text-[11px] text-zinc-500 max-w-xl">
                대형·중소형·피어(중소형 중 피어 표시)별 막대 그래프로 지표를 비교합니다. 회사별 상세에서 손익·인당·ROA/ROE를 함께 봅니다.
              </p>
            </div>
            <DartAnalysisDashboard rows={tableRows} unitLabel={UNITS.find((u) => u.value === unit)?.label ?? '원'} />
          </div>
        ) : null}

        {mainTab === 'table' ? (
          <div className="overflow-auto">
            <div className="px-3 py-2 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-[clamp(13px,1.1vw,14px)]">
                {year}년 · {REPRTS.find((r) => r.code === reprt)?.name} · {fsDiv} · 금액 {UNITS.find((u) => u.value === unit)?.label}
              </h3>
              <p className="text-[11px] text-zinc-500">
                인당 지표·ROA·ROE는 원 단위 금액으로 계산합니다. ROA=당기순이익÷자산총계, ROE=당기순이익÷자본총계.
              </p>
            </div>
            {tableRows.length === 0 ? (
              <div className="text-sm text-zinc-500 p-8 text-center">
            &quot;dart_fnltt로 분석&quot;을 눌러 주세요. 선택 연도·보고서·OFS/CFS에 맞는 원장이 없으면 표가 비어 있을 수 있습니다.
          </div>
            ) : (
              <>
                <table className="min-w-[1200px] w-full text-[clamp(11px,0.95vw,13px)]">
            <thead className="bg-zinc-50 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2 text-left font-semibold border-b">회사</th>
                <th className="px-2 py-2 text-right font-semibold border-b">임직원</th>
                {BOARD_KEYS.map((k) => (
                  <th key={k} className="px-2 py-2 text-right font-semibold border-b whitespace-nowrap">
                    {labelByKey.get(k) ?? k}
                    {!showCurrentOnly ? (
                      <>
                        <br />
                        <span className="font-normal text-zinc-500">당기 / 전기</span>
                      </>
                    ) : null}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-semibold border-b">인당 매출(원)</th>
                <th className="px-2 py-2 text-right font-semibold border-b">인당 영업이익(원)</th>
                <th className="px-2 py-2 text-right font-semibold border-b">ROA</th>
                <th className="px-2 py-2 text-right font-semibold border-b">ROE</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => {
                const isHw = r.corp_name === HIGHLIGHT_CORP
                const cells = [
                  { th: r.rev.th, fr: r.rev.fr },
                  { th: r.op.th, fr: r.op.fr },
                  { th: r.sga.th, fr: r.sga.fr },
                  { th: r.net.th, fr: r.net.fr },
                  { th: r.assets.th, fr: r.assets.fr },
                  { th: r.equity.th, fr: r.equity.fr },
                ]
                return (
                  <tr
                    key={r.corp_code}
                    className="border-t border-zinc-100"
                    style={isHw ? { backgroundColor: HIGHLIGHT_ROW } : undefined}
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.corp_name}</td>
                    <td className="px-2 py-1.5 text-right">
                      {r.headcount != null ? fmt(r.headcount) : '—'}
                      {r.empNote && r.headcount == null ? (
                        <span className="block text-[10px] text-zinc-400">{r.empNote}</span>
                      ) : null}
                    </td>
                    {cells.map((c, i) => {
                      const delta = c.th - c.fr
                      return (
                        <td key={i} className="px-2 py-1.5 text-right whitespace-nowrap">
                          {showCurrentOnly ? (
                            fmt(round2(c.th))
                          ) : (
                            <span>
                              {fmt(round2(c.th))}
                              <span className="text-zinc-400"> / </span>
                              {fmt(round2(c.fr))}
                              <span className={`block text-[10px] ${signClass(delta)}`}>
                                Δ {fmt(round2(delta))}
                              </span>
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-right">{r.perRev == null ? '—' : fmt(round2(r.perRev))}</td>
                    <td className="px-2 py-1.5 text-right">{r.perOp == null ? '—' : fmt(round2(r.perOp))}</td>
                    <td className="px-2 py-1.5 text-right">{r.roa == null ? '—' : `${fmt(round2(r.roa * 100))}%`}</td>
                    <td className="px-2 py-1.5 text-right">{r.roe == null ? '—' : `${fmt(round2(r.roe * 100))}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
                <div className="px-3 py-2 text-[11px] text-zinc-500 border-t border-zinc-100">
                  표준 계정 키: {BOARD_KEYS.join(', ')}. 증감(Δ)은 같은 단위 기준 당기−전기입니다.
                </div>
              </>
            )}
          </div>
        ) : null}

        {mainTab === 'ledger' ? (
          <div className="border-t border-zinc-100">
            <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50/80">
              <h3 className="font-semibold text-[clamp(13px,1.1vw,14px)]">계정별 확인 (원장)</h3>
              <p className="text-[11px] text-zinc-500 mt-1">
                <code className="text-[10px] bg-white px-1 rounded border border-zinc-200">dart_fnltt</code>에 저장된 행을 회사·표(PL/BS)별로 봅니다. 상단 연도·보고서·OFS/CFS와 동일
                조건입니다. 행이 없으면 OpenDART 동기화 옵션으로 분석하거나 BS/PL RAW에서 적재한 뒤 불러오세요.
              </p>
            </div>
            <div className="p-3 md:p-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-[11px] text-zinc-600">회사</label>
              <select
                value={detailCorp}
                onChange={(e) => setDetailCorp(e.target.value)}
                className={ctrlCls}
              >
                {corps.map((c) => (
                  <option key={c.corp_code} value={c.corp_code}>
                    {c.corp_name} · {formatDartCorpLabel(c.tier, c.is_peer)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[11px] text-zinc-600">표</label>
              <select
                value={detailSj}
                onChange={(e) => setDetailSj(e.target.value as 'ALL' | 'BS' | 'CIS')}
                className={ctrlCls}
              >
                <option value="ALL">PL+BS 전체</option>
                <option value="CIS">PL(CIS)만</option>
                <option value="BS">BS만</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-[11px] text-zinc-600">검색 (계정명·IFRS ID·표준키)</label>
              <input
                type="text"
                value={detailQuery}
                onChange={(e) => setDetailQuery(e.target.value)}
                placeholder="예: 매출, ifrs-full, PL_REVENUE"
                className={ctrlCls + ' placeholder:text-[11px]'}
              />
            </div>
            <button
              type="button"
              onClick={loadDetailLines}
              disabled={!detailCorp || loadingDetail}
              className="h-10 rounded-md bg-zinc-800 px-4 text-sm text-white hover:bg-zinc-900 disabled:opacity-50 shrink-0"
            >
              {loadingDetail ? '불러오는 중…' : '원장 불러오기'}
            </button>
          </div>
          {detailError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{detailError}</div>
          ) : null}
          {detailInfo && detailRows.length === 0 ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{detailInfo}</div>
          ) : null}
          {filteredDetailRows.length === 0 && !loadingDetail && detailRows.length === 0 && !detailInfo ? (
            <div className="text-sm text-zinc-500 py-6 text-center">원장 불러오기를 눌러 계정 행을 표시합니다.</div>
          ) : filteredDetailRows.length > 0 || detailRows.length > 0 ? (
            <div className="overflow-auto max-h-[min(70vh,560px)] rounded-md border border-zinc-100">
              <table className="min-w-[900px] w-full text-[11px] md:text-[12px]">
                <thead className="bg-zinc-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold border-b whitespace-nowrap">표</th>
                    <th className="px-2 py-1.5 text-right font-semibold border-b">순서</th>
                    <th className="px-2 py-1.5 text-left font-semibold border-b">계정명</th>
                    <th className="px-2 py-1.5 text-left font-semibold border-b">account_id</th>
                    <th className="px-2 py-1.5 text-left font-semibold border-b">표준키</th>
                    <th className="px-2 py-1.5 text-right font-semibold border-b">
                      당기 ({UNITS.find((u) => u.value === unit)?.label})
                    </th>
                    <th className="px-2 py-1.5 text-right font-semibold border-b">
                      전기 ({UNITS.find((u) => u.value === unit)?.label})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetailRows.map((r, idx) => {
                    const div = unit || 1
                    const th = (r.thstrm_amount ?? 0) / div
                    const fr = (r.frmtrm_amount ?? 0) / div
                    const lab = r.sj_div === 'BS' ? 'BS' : 'PL'
                    return (
                      <tr key={`${r.sj_div}-${r.ord}-${r.account_id}-${idx}`} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                        <td className="px-2 py-1 whitespace-nowrap text-zinc-600">{lab}</td>
                        <td className="px-2 py-1 text-right text-zinc-500">{r.ord ?? '—'}</td>
                        <td className="px-2 py-1 max-w-[280px]">{r.account_nm ?? '—'}</td>
                        <td className="px-2 py-1 font-mono text-[10px] text-zinc-600 break-all max-w-[200px]">
                          {r.account_id ?? '—'}
                        </td>
                        <td className="px-2 py-1 font-mono text-[10px]">{r.canon_key ?? '—'}</td>
                        <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(round2(th))}</td>
                        <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(round2(fr))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {detailRows.length > 0 && filteredDetailRows.length === 0 ? (
            <p className="text-sm text-zinc-500">검색 조건에 맞는 행이 없습니다.</p>
          ) : null}
          {detailRows.length > 0 ? (
            <p className="text-[11px] text-zinc-500">
              표시 {filteredDetailRows.length}행 / 전체 {detailRows.length}행 · 금액은 상단 &quot;금액 단위&quot;로 나눈 값입니다.
            </p>
          ) : null}
        </div>
      </div>
        ) : null}
      </div>
    </div>
  )
}
