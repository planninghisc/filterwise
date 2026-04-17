'use client'

import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDartCorpLabel, mergeDartCorpsFromDb, type MergedDartCorp } from '@/data/dartCorpRows'

type CorpItem = MergedDartCorp
type ReprtCode = '11011' | '11014' | '11012' | '11013'
type FsDiv = 'OFS' | 'CFS'
type MetricKey =
  | 'net_operating_revenue'
  | 'sga_including_personnel'
  | 'operating_income'
  | 'profit_before_tax'
  | 'net_income'
  | 'equity'
type AxisKey = MetricKey | 'headcount' | 'roe' | 'cir' | 'productivity'

type Row = {
  corp_code: string
  corp_name: string
  tier: 'large' | 'mid'
  is_peer: boolean
  /** API: 해당 회사·연도·보고서·fs_div에 매칭된 dart_fnltt 행 수 */
  fnltt_row_count?: number
  headcount: number | null
  headcount_note?: string
  th: Record<MetricKey, number | null>
  fr: Record<MetricKey, number | null>
  ratio: {
    roe: number | null
    cir: number | null
    productivity: number | null
  }
}

type Bundle = {
  ok: boolean
  year: number
  reprt: string
  fs_div: FsDiv
  sheets: { cis: string; bs: string }
  metricLabels: Record<MetricKey, string>
  rows: Row[]
}

const REPRTS: { code: ReprtCode; name: string }[] = [
  { code: '11011', name: '사업보고서(연간)' },
  { code: '11014', name: '3분기보고서' },
  { code: '11012', name: '반기보고서' },
  { code: '11013', name: '1분기보고서' },
]

const UNITS = [
  { label: '원', value: 1 },
  { label: '천원', value: 1_000 },
  { label: '백만원', value: 1_000_000 },
  { label: '억원', value: 100_000_000 },
]

const METRICS: MetricKey[] = [
  'net_operating_revenue',
  'sga_including_personnel',
  'operating_income',
  'profit_before_tax',
  'net_income',
  'equity',
]

const COLORS = ['#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#27272a', '#78716c', '#6b7280']
const HANWHA = '한화투자증권'
const HANWHA_COLOR = '#f97316'

function roundInt(n: number) {
  return Math.round(n)
}

function fmtInt(n: number) {
  return roundInt(n).toLocaleString()
}

function fmtPercent1(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function isHanwha(name: string) {
  return name.includes(HANWHA)
}

function num(v: number | null, div = 1): number | null {
  if (v == null || Number.isNaN(Number(v))) return null
  return Number(v) / div
}

function getGroupRows(rows: Row[], g: 'large' | 'mid' | 'peer') {
  if (g === 'large') return rows.filter((r) => r.tier === 'large')
  if (g === 'mid') return rows.filter((r) => r.tier === 'mid')
  return rows.filter((r) => r.tier === 'mid' && r.is_peer)
}

function pickAxis(row: Row, key: AxisKey, showCurrentOnly: boolean, unitDivisor: number): number | null {
  if (key === 'headcount') return row.headcount
  if (key === 'roe') return row.ratio.roe == null ? null : row.ratio.roe * 100
  if (key === 'cir') return row.ratio.cir == null ? null : row.ratio.cir * 100
  if (key === 'productivity') return row.ratio.productivity
  const base = showCurrentOnly ? row.th[key] : (row.th[key] ?? row.fr[key])
  return num(base, unitDivisor)
}

export default function DartAnalysisPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear() - 1)
  const [reprt, setReprt] = useState<ReprtCode>('11011')
  const [fsDiv, setFsDiv] = useState<FsDiv>('OFS')
  const [unit, setUnit] = useState<number>(100_000_000)
  const [showCurrentOnly, setShowCurrentOnly] = useState<boolean>(true)

  const [corps, setCorps] = useState<CorpItem[]>([])
  const [selectedCorps, setSelectedCorps] = useState<string[]>([])
  const [loadingCorps, setLoadingCorps] = useState(false)

  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [loadingRun, setLoadingRun] = useState(false)
  const [runError, setRunError] = useState('')

  const [metricKey, setMetricKey] = useState<AxisKey>('net_operating_revenue')
  const [axisX, setAxisX] = useState<AxisKey>('headcount')
  const [axisY, setAxisY] = useState<AxisKey>('net_operating_revenue')

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

  const runAnalysis = async () => {
    if (selectedCorps.length === 0) return
    setLoadingRun(true)
    setRunError('')
    setBundle(null)
    try {
      const q = new URLSearchParams({
        year: String(year),
        reprt,
        fs_div: fsDiv,
        corp_codes: selectedCorps.join(','),
      })
      const res = await fetch(`/api/dart/custom-analysis?${q.toString()}`)
      const json = (await res.json()) as Bundle & { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? '분석 데이터를 불러오지 못했습니다.')
      setBundle(json)
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setLoadingRun(false)
    }
  }

  const visibleRows = useMemo(() => {
    const set = new Set(selectedCorps)
    return (bundle?.rows ?? []).filter((r) => set.has(r.corp_code))
  }, [bundle, selectedCorps])

  const unitLabel = UNITS.find((u) => u.value === unit)?.label ?? '원'

  const metricLabel = useMemo(() => {
    if (!bundle) return '지표'
    if (metricKey === 'roe') return 'ROE(%)'
    if (metricKey === 'cir') return 'CIR(%)'
    if (metricKey === 'productivity') return '인당생산성(원)'
    if (metricKey === 'headcount') return '임직원 수'
    return bundle.metricLabels[metricKey]
  }, [bundle, metricKey])
  const metricIsPercent = metricKey === 'roe' || metricKey === 'cir'

  const sortedRows = useMemo(() => {
    const withVal = visibleRows.map((r) => ({
      row: r,
      val: pickAxis(r, metricKey, showCurrentOnly, unit),
    }))
    withVal.sort((a, b) => {
      if (a.val == null && b.val == null) return a.row.corp_name.localeCompare(b.row.corp_name, 'ko')
      if (a.val == null) return 1
      if (b.val == null) return -1
      if (b.val !== a.val) return b.val - a.val
      return a.row.corp_name.localeCompare(b.row.corp_name, 'ko')
    })
    return withVal.map((x) => x.row)
  }, [visibleRows, metricKey, showCurrentOnly, unit])

  const companyBar = useMemo(() => {
    return sortedRows.map((r, i) => {
      const v = pickAxis(r, metricKey, showCurrentOnly, unit)
      return {
        name: r.corp_name,
        value: v ?? 0,
        isNull: v == null,
        isHanwha: isHanwha(r.corp_name),
        fill: isHanwha(r.corp_name) ? HANWHA_COLOR : COLORS[i % COLORS.length],
      }
    })
  }, [sortedRows, metricKey, showCurrentOnly, unit])

  const groupBar = useMemo(() => {
    const groups: { key: 'large' | 'mid' | 'peer'; name: string }[] = [
      { key: 'large', name: '대형사' },
      { key: 'mid', name: '중소형사' },
      { key: 'peer', name: '피어사' },
    ]
    return groups.map((g, i) => {
      const gRows = getGroupRows(visibleRows, g.key)
      const values = gRows
        .map((r) => pickAxis(r, metricKey, showCurrentOnly, unit))
        .filter((v): v is number => v != null && Number.isFinite(v))
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
      return {
        name: g.name,
        value: avg ?? 0,
        isNull: avg == null,
        fill: COLORS[i % COLORS.length],
      }
    })
  }, [visibleRows, metricKey, showCurrentOnly, unit])

  const scatter = useMemo(() => {
    const out: { name: string; x: number; y: number; isHanwha: boolean }[] = []
    for (const r of visibleRows) {
      const x = pickAxis(r, axisX, showCurrentOnly, unit)
      const y = pickAxis(r, axisY, showCurrentOnly, unit)
      if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue
      out.push({ name: r.corp_name, x, y, isHanwha: isHanwha(r.corp_name) })
    }
    return out
  }, [visibleRows, axisX, axisY, showCurrentOnly, unit])

  const axisOptions = useMemo(() => {
    const fromMetric = bundle ? METRICS.map((k) => ({ key: k as AxisKey, label: bundle.metricLabels[k] })) : []
    return [
      ...fromMetric,
      { key: 'headcount' as AxisKey, label: '임직원 수' },
      { key: 'roe' as AxisKey, label: 'ROE(%)' },
      { key: 'cir' as AxisKey, label: 'CIR(%)' },
      { key: 'productivity' as AxisKey, label: '인당생산성(원)' },
    ]
  }, [bundle])

  const exportExcel = () => {
    if (!bundle) return
    const wb = XLSX.utils.book_new()
    const meta = [
      ['연도', bundle.year],
      ['보고서', REPRTS.find((r) => r.code === reprt)?.name ?? reprt],
      ['재무구분', bundle.fs_div],
      ['금액 단위', unitLabel],
      ['PL 시트', bundle.sheets.cis],
      ['BS 시트', bundle.sheets.bs],
    ]
    const data = visibleRows.map((r) => {
      const row: Record<string, string | number> = {
        corp_code: r.corp_code,
        corp_name: r.corp_name,
        group: formatDartCorpLabel(r.tier, r.is_peer),
        임직원: r.headcount ?? '',
        ROE: r.ratio.roe == null ? '' : roundInt(r.ratio.roe * 100),
        CIR: r.ratio.cir == null ? '' : roundInt(r.ratio.cir * 100),
        인당생산성: r.ratio.productivity == null ? '' : roundInt(r.ratio.productivity),
      }
      for (const k of METRICS) {
        const label = bundle.metricLabels[k]
        row[`${label}_당기(${unitLabel})`] = num(r.th[k], unit) == null ? '' : roundInt(num(r.th[k], unit)!)
        if (!showCurrentOnly) row[`${label}_전기(${unitLabel})`] = num(r.fr[k], unit) == null ? '' : roundInt(num(r.fr[k], unit)!)
      }
      return row
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), '조건')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), '비교')
    XLSX.writeFile(wb, `DART_Analysis_${bundle.year}_${bundle.fs_div}.xlsx`)
  }

  const allSelected = corps.length > 0 && selectedCorps.length === corps.length
  const toggleCorp = (code: string, on: boolean) => {
    setSelectedCorps((prev) => (on ? Array.from(new Set([...prev, code])) : prev.filter((c) => c !== code)))
  }

  return (
    <div className="space-y-5">
      <div className="text-xs text-zinc-500">
        분석 프로세스: <strong>1) CORP registration</strong>에서 회사 등록 → <strong>2) DART BS/PL RAW</strong>에서 원장 적재 →
        <strong> 3) CORP Account</strong>에서 조합식 점검 → <strong>4) DART Analysis</strong> 실행
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="text-xs text-zinc-600">연도</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || 0))} className="mt-1 h-10 w-full rounded border border-zinc-300 px-3 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-600">보고서</label>
            <select value={reprt} onChange={(e) => setReprt(e.target.value as ReprtCode)} className="mt-1 h-10 w-full rounded border border-zinc-300 px-3 text-sm">
              {REPRTS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-600">재무구분</label>
            <select value={fsDiv} onChange={(e) => setFsDiv(e.target.value as FsDiv)} className="mt-1 h-10 w-full rounded border border-zinc-300 px-3 text-sm">
              <option value="OFS">별도(OFS)</option>
              <option value="CFS">연결(CFS)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-600">금액 단위</label>
            <select value={unit} onChange={(e) => setUnit(Number(e.target.value))} className="mt-1 h-10 w-full rounded border border-zinc-300 px-3 text-sm">
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pt-6">
            <input type="checkbox" checked={showCurrentOnly} onChange={(e) => setShowCurrentOnly(e.target.checked)} />
            <span className="text-sm">당기만 표시</span>
          </label>
          <div className="flex gap-2 pt-5">
            <button onClick={runAnalysis} disabled={loadingRun || selectedCorps.length === 0} className="h-10 rounded bg-[#ea580c] px-3 text-sm text-white disabled:opacity-50">
              {loadingRun ? '분석 중…' : '분석 실행'}
            </button>
            <button onClick={exportExcel} disabled={!bundle} className="h-10 rounded border border-zinc-300 bg-white px-3 text-sm disabled:opacity-50">
              Excel
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          본 화면은 XBRL 문서를 직접 읽지 않고 <code className="rounded bg-zinc-100 px-1">dart_fnltt</code> 저장 데이터만 사용합니다. 데이터가 없으면 DART BS/PL RAW에서 먼저 적재해 주세요. 회사별 QNAME 조합식은 좌측 메뉴{' '}
          <strong className="text-zinc-700">CORP Account</strong>에서 설정합니다. 임직원 수는 같은 연도·보고서 기준{' '}
          <code className="rounded bg-zinc-100 px-1">dart_headcount</code>가 있으면 그 값을 쓰고, 없을 때만 OpenDART{' '}
          <code className="rounded bg-zinc-100 px-1">empSttus</code>로 보완합니다.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">회사 선택</h3>
          <button onClick={() => (allSelected ? setSelectedCorps([]) : setSelectedCorps(corps.map((c) => c.corp_code)))} className="rounded border border-zinc-300 px-2 py-1 text-xs">
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {loadingCorps ? (
            <div className="col-span-full text-sm text-zinc-500">회사 목록 로딩 중…</div>
          ) : (
            corps.map((c) => (
              <label key={c.corp_code} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selectedCorps.includes(c.corp_code)} onChange={(e) => toggleCorp(c.corp_code, e.target.checked)} />
                <span>
                  {c.corp_name} <span className="text-xs text-zinc-400">({formatDartCorpLabel(c.tier, c.is_peer)})</span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      {runError ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{runError}</div> : null}

      {bundle ? (
        <>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 md:p-5">
            <div className="mt-2 flex flex-wrap gap-3">
              <div>
                <label className="text-xs text-zinc-600">비교 지표</label>
                <select value={metricKey} onChange={(e) => setMetricKey(e.target.value as AxisKey)} className="mt-1 h-10 rounded border border-zinc-300 px-3 text-sm">
                  {axisOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <div className="h-[340px] min-w-0">
                <h4 className="mb-2 text-sm font-semibold">회사별 비교 · {metricLabel}</h4>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={companyBar} margin={{ top: 8, right: 8, left: 8, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                    <XAxis dataKey="name" angle={-30} interval={0} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => (metricIsPercent ? fmtPercent1(Number(v)) : fmtInt(Number(v)))}
                    />
                    <Tooltip
                      formatter={(v, _, item) => [
                        item.payload?.isNull ? '—' : metricIsPercent ? fmtPercent1(Number(v)) : fmtInt(Number(v)),
                        metricLabel,
                      ]}
                    />
                    <Bar dataKey="value">
                      {companyBar.map((r, i) => (
                        <Cell key={i} fill={r.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[340px] min-w-0">
                <h4 className="mb-2 text-sm font-semibold">구분별 평균 비교 · {metricLabel}</h4>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={groupBar} margin={{ top: 8, right: 8, left: 8, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => (metricIsPercent ? fmtPercent1(Number(v)) : fmtInt(Number(v)))}
                    />
                    <Tooltip
                      formatter={(v, _, item) => [
                        item.payload?.isNull ? '—' : metricIsPercent ? fmtPercent1(Number(v)) : fmtInt(Number(v)),
                        '평균',
                      ]}
                    />
                    <Bar dataKey="value">
                      {groupBar.map((r, i) => (
                        <Cell key={i} fill={r.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 md:p-5">
            <h4 className="mb-2 text-sm font-semibold">X/Y 비교 산점도</h4>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1 block text-xs text-zinc-600">X 축</label>
                <select value={axisX} onChange={(e) => setAxisX(e.target.value as AxisKey)} className="h-10 w-full rounded border border-zinc-300 px-3 text-sm">
                  {axisOptions.map((o) => (
                    <option key={`x-${o.key}`} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-xs text-zinc-600">Y 축</label>
                <select value={axisY} onChange={(e) => setAxisY(e.target.value as AxisKey)} className="h-10 w-full rounded border border-zinc-300 px-3 text-sm">
                  {axisOptions.map((o) => (
                    <option key={`y-${o.key}`} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 12, left: 12, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                  <XAxis type="number" dataKey="x" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtInt(Number(v))} />
                  <YAxis type="number" dataKey="y" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtInt(Number(v))} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null
                      const p = payload[0].payload as { name: string; x: number; y: number }
                      const ratio = p.x === 0 ? null : p.y / p.x
                      return (
                        <div className="rounded border border-zinc-200 bg-white px-3 py-2 text-xs shadow">
                          <div className="font-semibold">{p.name}</div>
                          <div>X: {fmtInt(p.x)}</div>
                          <div>Y: {fmtInt(p.y)}</div>
                          {ratio != null ? <div className="text-zinc-500">Y/X: {fmtInt(ratio)}</div> : null}
                        </div>
                      )
                    }}
                  />
                  <Scatter
                    data={scatter}
                    shape={(props) => {
                      const p = props as { cx?: number; cy?: number; payload?: { name: string; isHanwha?: boolean } }
                      const cx = p.cx ?? 0
                      const cy = p.cy ?? 0
                      const name = p.payload?.name ?? ''
                      const highlight = Boolean(p.payload?.isHanwha)
                      const color = highlight ? HANWHA_COLOR : '#52525b'
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={highlight ? 6 : 5} fill={color} />
                          <text
                            x={cx + 8}
                            y={cy - 8}
                            fontSize={11}
                            fill={color}
                            fontWeight={highlight ? 700 : 500}
                          >
                            {name}
                          </text>
                        </g>
                      )
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/60 p-4 text-xs text-zinc-800">
              <h4 className="mb-2 font-semibold">산점도 추천 조합</h4>
              <ul className="list-disc space-y-1 pl-5">
                <li>X=임직원 수, Y=순영업수익: 인당생산성 비교</li>
                <li>X=자기자본, Y=당기순이익: ROE 감각적으로 비교</li>
                <li>X=순영업수익, Y=판매와일반관리비: CIR 구조 비교</li>
                <li>X=순영업수익, Y=영업이익: 영업 레버리지 비교</li>
              </ul>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-zinc-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-left">회사</th>
                  <th className="px-2 py-2 text-right">임직원</th>
                  {METRICS.map((k) => (
                    <th key={k} className="px-2 py-2 text-right whitespace-nowrap">
                      {bundle.metricLabels[k]}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right">ROE(%)</th>
                  <th className="px-2 py-2 text-right">CIR(%)</th>
                  <th className="px-2 py-2 text-right">인당생산성(원)</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.corp_code} className="border-t border-zinc-100">
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col gap-0.5">
                        <span>
                          {r.corp_name}{' '}
                          <span className="text-xs text-zinc-400">({formatDartCorpLabel(r.tier, r.is_peer)})</span>
                        </span>
                        {r.fnltt_row_count === 0 ? (
                          <span
                            className="text-xs text-amber-800"
                            title="DART Analysis는 위에서 고른 연도·보고서·별도/연결(OFS/CFS)과 일치하는 dart_fnltt 행만 집계합니다. 테이블에 다른 연도 행이 있어도 이 조건에 없으면 여기서는 비어 보입니다."
                          >
                            이 조건의 dart_fnltt 0건 — 연도·보고서·OFS/CFS를 맞추거나 해당 조합으로 RAW 적재
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">{r.headcount == null ? '—' : r.headcount.toLocaleString()}</td>
                    {METRICS.map((k) => {
                      const v = showCurrentOnly ? r.th[k] : (r.th[k] ?? r.fr[k])
                      return (
                        <td key={k} className="px-2 py-1.5 text-right">
                          {num(v, unit) == null ? '—' : fmtInt(num(v, unit)!)}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-right">{r.ratio.roe == null ? '—' : fmtPercent1(r.ratio.roe * 100)}</td>
                    <td className="px-2 py-1.5 text-right">{r.ratio.cir == null ? '—' : fmtPercent1(r.ratio.cir * 100)}</td>
                    <td className="px-2 py-1.5 text-right">{r.ratio.productivity == null ? '—' : fmtInt(r.ratio.productivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </>
      ) : null}
    </div>
  )
}
