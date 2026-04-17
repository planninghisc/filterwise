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
  ZAxis,
} from 'recharts'

export type XbrlAnalysisBundle = {
  ok: boolean
  year: number
  reprt: string
  fs_div: string
  /** 엑셀/문서 출처 표기용 */
  catalog_source?: string
  catalog: Array<{ key: string; sj: string; label: string; id: string; sheet: string }>
  corps: Array<{
    corp_code: string
    corp_name: string
    tier: 'large' | 'mid'
    is_peer: boolean
    headcount: number | null
    headcount_note?: string
  }>
  values: Record<string, Record<string, { th: number | null; fr: number | null }>>
}

const HEAD_KEY = '__headcount__'
const BAR_COLORS = ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#c2410c', '#9a3412', '#7c2d12', '#431407']

function shortName(s: string, max = 10) {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

function filterByGroup(
  rows: XbrlAnalysisBundle['corps'],
  group: 'large' | 'mid' | 'peer',
): XbrlAnalysisBundle['corps'] {
  if (group === 'large') return rows.filter((r) => r.tier === 'large')
  if (group === 'mid') return rows.filter((r) => r.tier === 'mid')
  return rows.filter((r) => r.tier === 'mid' && r.is_peer)
}

type AxisKey = typeof HEAD_KEY | string

type Props = {
  bundle: XbrlAnalysisBundle | null
  selectedCorpCodes: string[]
  unitLabel: string
  unitDivisor: number
  showCurrentOnly: boolean
}

export default function DartXbrlAnalysisDashboard({
  bundle,
  selectedCorpCodes,
  unitLabel,
  unitDivisor,
  showCurrentOnly,
}: Props) {
  const [metricKey, setMetricKey] = useState<string>('')
  const [axisX, setAxisX] = useState<AxisKey>(HEAD_KEY)
  const [axisY, setAxisY] = useState<AxisKey>('')

  const visibleCorps = useMemo(() => {
    if (!bundle?.corps) return []
    const set = new Set(selectedCorpCodes)
    return bundle.corps.filter((c) => set.has(c.corp_code))
  }, [bundle, selectedCorpCodes])

  const catalogKeys = useMemo(() => {
    if (!bundle?.catalog?.length) return []
    return bundle.catalog.map((c) => c.key)
  }, [bundle])

  useEffect(() => {
    if (!bundle?.catalog?.length) return
    if (!metricKey || !catalogKeys.includes(metricKey)) {
      setMetricKey(bundle.catalog[0]!.key)
    }
  }, [bundle, catalogKeys, metricKey])

  useEffect(() => {
    if (!catalogKeys.length) return
    const validY = axisY === HEAD_KEY || catalogKeys.includes(axisY)
    if (!validY || axisY === axisX) {
      const first = catalogKeys.find((k) => k !== axisX) ?? catalogKeys[0]!
      setAxisY(first)
    }
  }, [catalogKeys, axisX, axisY])

  const activeMetric = metricKey && catalogKeys.includes(metricKey) ? metricKey : catalogKeys[0] ?? ''

  const pickAmt = (corp: string, key: AxisKey, corpRow: XbrlAnalysisBundle['corps'][0]): number | null => {
    if (!bundle) return null
    if (key === HEAD_KEY) return corpRow.headcount
    const cell = bundle.values[corp]?.[key]
    if (!cell) return null
    const raw = showCurrentOnly ? cell.th : (cell.th ?? cell.fr)
    const v = raw
    if (v == null || Number.isNaN(Number(v))) return null
    return Number(v) / (unitDivisor || 1)
  }

  const metricLabel = useMemo(() => {
    const m = bundle?.catalog.find((c) => c.key === activeMetric)
    return m ? `${m.sj === 'BS' ? '[BS]' : '[PL]'} ${m.label}` : '지표'
  }, [bundle, activeMetric])

  const groupCharts = useMemo(() => {
    if (!bundle || !activeMetric) return []
    const groups: { key: 'large' | 'mid' | 'peer'; title: string; desc: string }[] = [
      { key: 'large', title: '대형사', desc: '규모: 대형' },
      { key: 'mid', title: '중소형사', desc: '규모: 중소형(피어 포함)' },
      { key: 'peer', title: '피어 그룹', desc: '피어로 표시한 중소형사' },
    ]
    return groups.map((g) => {
      const list = filterByGroup(visibleCorps, g.key)
      const data = list.map((r, i) => {
        const cell = bundle.values[r.corp_code]?.[activeMetric]
        const raw = showCurrentOnly ? cell?.th : (cell?.th ?? cell?.fr)
        const v = raw == null || Number.isNaN(Number(raw)) ? null : Number(raw) / (unitDivisor || 1)
        return {
          name: shortName(r.corp_name),
          fullName: r.corp_name,
          value: v == null ? 0 : v,
          isNull: v == null,
          fill: BAR_COLORS[i % BAR_COLORS.length],
        }
      })
      return { ...g, list, data }
    })
  }, [bundle, activeMetric, visibleCorps, showCurrentOnly, unitDivisor])

  const companyBarData = useMemo(() => {
    if (!bundle || !activeMetric) return []
    return visibleCorps.map((r, i) => {
      const cell = bundle.values[r.corp_code]?.[activeMetric]
      const raw = showCurrentOnly ? cell?.th : (cell?.th ?? cell?.fr)
      const v = raw == null || Number.isNaN(Number(raw)) ? null : Number(raw) / (unitDivisor || 1)
      return {
        name: shortName(r.corp_name),
        fullName: r.corp_name,
        value: v == null ? 0 : v,
        isNull: v == null,
        fill: BAR_COLORS[i % BAR_COLORS.length],
      }
    })
  }, [bundle, activeMetric, visibleCorps, unitDivisor, showCurrentOnly])

  const scatterData = useMemo(() => {
    if (!bundle || !axisX || !axisY || axisX === axisY) return []
    const out: { name: string; x: number; y: number; code: string }[] = []
    for (const r of visibleCorps) {
      const vx = pickAmt(r.corp_code, axisX, r)
      const vy = pickAmt(r.corp_code, axisY, r)
      if (vx == null || vy == null || !Number.isFinite(vx) || !Number.isFinite(vy)) continue
      out.push({ name: r.corp_name, x: vx, y: vy, code: r.corp_code })
    }
    return out
  }, [bundle, visibleCorps, axisX, axisY, showCurrentOnly, unitDivisor])

  const axisOptions = useMemo(() => {
    const opts: { key: AxisKey; label: string }[] = [{ key: HEAD_KEY, label: '임직원 수 (명)' }]
    if (!bundle) return opts
    for (const c of bundle.catalog) {
      opts.push({ key: c.key, label: `${c.sj === 'BS' ? 'BS' : 'PL'} · ${c.label}` })
    }
    return opts
  }, [bundle])

  const exportXlsx = () => {
    if (!bundle?.ok) return
    const wb = XLSX.utils.book_new()
    const meta = [
      ['연도', bundle.year],
      ['보고서', bundle.reprt],
      ['연결/별도', bundle.fs_div],
      ['금액 단위', unitLabel],
      ['표시 모드', showCurrentOnly ? '당기만' : '당기·전기 열'],
      ['카탈로그', bundle.catalog_source ?? '한화투자증권 XBRL'],
    ]
    const catalogCols = showCurrentOnly
      ? bundle.catalog.map((c) => `[${c.sj}] ${c.label} (당기)`)
      : bundle.catalog.flatMap((c) => [`[${c.sj}] ${c.label} (당기)`, `[${c.sj}] ${c.label} (전기)`])
    const headRow = ['corp_code', 'corp_name', 'tier', 'is_peer', '임직원', ...catalogCols]
    const div = unitDivisor || 1
    const body = visibleCorps.map((r) => {
      const row: (string | number | boolean | null)[] = [
        r.corp_code,
        r.corp_name,
        r.tier,
        r.is_peer,
        r.headcount ?? '',
      ]
      for (const c of bundle.catalog) {
        const cell = bundle.values[r.corp_code]?.[c.key]
        if (showCurrentOnly) {
          const v = cell?.th
          row.push(v == null ? '' : Number(v) / div)
        } else {
          const th = cell?.th
          const fr = cell?.fr
          row.push(th == null ? '' : Number(th) / div, fr == null ? '' : Number(fr) / div)
        }
      }
      return row
    })
    const sh1 = XLSX.utils.aoa_to_sheet([...meta, [], headRow, ...body])
    XLSX.utils.book_append_sheet(wb, sh1, '비교표')

    const help = [
      ['조합 가이드 (한화투자증권 XBRL 항목 + 임직원)'],
      [],
      ['인당 매출', 'X=임직원, Y=PL·영업수익(ifrs-full_Revenue 등 해당 항목) → 산점도에서 기울기·밀도로 상대 비교'],
      ['인당 순이익', 'X=임직원, Y=PL·당기순이익 계정'],
      ['ROA', 'X=BS·자산총계, Y=PL·당기순이익 (또는 영업이익) — 비율은 툴팁에서 y/x'],
      ['ROE', 'X=BS·자본총계, Y=PL·당기순이익'],
      [],
      ['주의', '엑셀 기준 항목명은 한화투자증권 제시 계정입니다. 타사는 account_id(QNAME) 매핑으로 금액을 찾습니다.'],
      ['', 'RAW 적재 시 `sheet_code`(DS320005 등)가 저장되면 연결/별도 혼선이 줄어듭니다.'],
    ]
    const sh2 = XLSX.utils.aoa_to_sheet(help)
    XLSX.utils.book_append_sheet(wb, sh2, '도움말')

    XLSX.writeFile(wb, `dart_xbrl_analysis_${bundle.year}_${bundle.reprt}_${bundle.fs_div}.xlsx`)
  }

  if (!bundle?.ok) {
    return <p className="text-sm text-zinc-500 py-6 text-center">위에서 분석을 실행하면 XBRL 기준 비교가 표시됩니다.</p>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1 min-w-[240px]">
          <label className="text-[11px] text-zinc-600">비교 지표 (한화투자증권 기준 항목명 · QNAME 매핑)</label>
          <select
            value={activeMetric}
            onChange={(e) => setMetricKey(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm max-w-xl"
          >
            {bundle.catalog.map((c) => (
              <option key={c.key} value={c.key}>
                [{c.sj}] {c.label} · {c.sheet}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={exportXlsx}
          disabled={visibleCorps.length === 0}
          className="h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm hover:bg-orange-50 disabled:opacity-50"
        >
          XBRL 비교 Excel
        </button>
      </div>

      <p className="text-[12px] text-zinc-600 leading-relaxed">
        금액 축은 상단 단위({unitLabel}) 기준입니다. 임직원은 OpenDART <code className="text-[11px] bg-zinc-100 px-1 rounded">empSttus</code>입니다.
        원장은 <code className="text-[11px] bg-zinc-100 px-1 rounded">dart_fnltt</code>의 <code className="text-[11px] bg-zinc-100 px-1 rounded">account_id</code>를 QNAME으로 매칭합니다.
      </p>

      <div>
        <h3 className="text-sm font-semibold text-zinc-900 mb-2">선택 회사 비교 · {metricLabel}</h3>
        {visibleCorps.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-zinc-400 border border-dashed rounded-lg">
            회사를 선택하세요.
          </div>
        ) : (
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={companyBarData} margin={{ top: 8, right: 8, left: 8, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={56} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : String(v))}
                />
                <Tooltip
                  formatter={(value, _n, item) => {
                    const p = item?.payload as { isNull?: boolean; fullName?: string } | undefined
                    const v = typeof value === 'number' ? value : Number(value)
                    return [p?.isNull ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 2 }), unitLabel]
                  }}
                  labelFormatter={(_, p) => (Array.isArray(p) ? p[0]?.payload?.fullName : '') ?? ''}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {companyBarData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-3">
        {groupCharts.map((g) => (
          <div key={g.key} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-zinc-900">{g.title}</h3>
              <p className="text-[11px] text-zinc-500">{g.desc}</p>
              <p className="text-[11px] text-orange-700 mt-1">
                {metricLabel} · {g.list.length}사
              </p>
            </div>
            {g.list.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-zinc-400 border border-dashed rounded-md">
                해당 그룹에 선택된 회사가 없습니다.
              </div>
            ) : (
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={g.data} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={54} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip
                      formatter={(value, _n, item) => {
                        const p = item?.payload as { isNull?: boolean } | undefined
                        const v = typeof value === 'number' ? value : Number(value)
                        return [p?.isNull ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 2 }), unitLabel]
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {g.data.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">축 선택 비교 (산점도)</h3>
        <p className="text-[11px] text-zinc-500">
          X·Y에 임직원 또는 PL/BS 항목을 지정합니다. 금액은 {unitLabel}, 임직원은 명 단위입니다.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-[11px] text-zinc-600">X 축</label>
            <select
              value={axisX}
              onChange={(e) => setAxisX(e.target.value as AxisKey)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            >
              {axisOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-[11px] text-zinc-600">Y 축</label>
            <select
              value={axisY}
              onChange={(e) => setAxisY(e.target.value as AxisKey)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            >
              {axisOptions.map((o) => (
                <option key={`y-${o.key}`} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {scatterData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-zinc-400 border border-dashed rounded-md">
            두 축 모두 숫자가 있는 회사가 없습니다. 항목·임직원 데이터를 확인하세요.
          </div>
        ) : (
          <div className="h-[360px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="X"
                  tick={{ fontSize: 10 }}
                  label={{ value: axisOptions.find((o) => o.key === axisX)?.label ?? 'X', position: 'bottom', offset: 0 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Y"
                  tick={{ fontSize: 10 }}
                  label={{ value: axisOptions.find((o) => o.key === axisY)?.label ?? 'Y', angle: -90, position: 'left' }}
                />
                <ZAxis range={[60, 60]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null
                    const p = payload[0].payload as { name: string; x: number; y: number }
                    const ratio = p.x !== 0 ? p.y / p.x : null
                    return (
                      <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow">
                        <div className="font-semibold">{p.name}</div>
                        <div>
                          X: {p.x.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div>
                          Y: {p.y.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        {ratio != null && Number.isFinite(ratio) ? (
                          <div className="text-zinc-500 mt-1">Y/X: {ratio.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                        ) : null}
                      </div>
                    )
                  }}
                />
                <Scatter name="회사" data={scatterData} fill="#ea580c" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4 text-[12px] text-zinc-800 space-y-2">
        <h4 className="font-semibold text-zinc-900">도움말 · 자주 쓰는 축 조합</h4>
        <ul className="list-disc pl-5 space-y-1 text-zinc-700">
          <li>
            <strong>인당 매출</strong>: X = 임직원 수, Y = 포괄손익계산서의 매출·수익 계열(예: 영업수익). Y/X가 거의 인당 매출에 해당합니다.
          </li>
          <li>
            <strong>인당 영업이익</strong>: X = 임직원, Y = 영업이익에 해당하는 PL 항목(엑셀 목록에서 선택).
          </li>
          <li>
            <strong>ROA</strong>: X = 재무상태표 자산총계, Y = 당기순이익(또는 영업이익). Y÷X로 대략 ROA를 읽을 수 있습니다.
          </li>
          <li>
            <strong>ROE</strong>: X = 자본총계, Y = 당기순이익.
          </li>
          <li>
            <strong>주의</strong>: 항목 가용 여부는 각사 <code className="text-[10px] bg-white px-1 rounded border">dart_fnltt</code> 원장에 그 QNAME이 존재하는지에
            따릅니다. 누락 시 막대·산점도에서 제외될 수 있습니다.
          </li>
        </ul>
      </div>
    </div>
  )
}
