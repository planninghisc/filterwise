'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDartCorpLabel } from '@/data/dartCorpRows'

export type DartAnalysisRow = {
  corp_code: string
  corp_name: string
  tier: 'large' | 'mid'
  is_peer: boolean
  headcount: number | null
  empNote?: string
  rev: { th: number; fr: number }
  op: { th: number; fr: number }
  sga: { th: number; fr: number }
  net: { th: number; fr: number }
  assets: { th: number; fr: number }
  equity: { th: number; fr: number }
  perRev: number | null
  perOp: number | null
  roa: number | null
  roe: number | null
}

type MetricId = 'perRev' | 'perOp' | 'roa' | 'roe' | 'rev' | 'op' | 'net'

const METRICS: { id: MetricId; label: string; short: string; isPercent?: boolean }[] = [
  { id: 'perRev', label: '인당 매출', short: '인당 매출' },
  { id: 'perOp', label: '인당 영업이익', short: '인당 영업이익' },
  { id: 'roa', label: 'ROA', short: 'ROA', isPercent: true },
  { id: 'roe', label: 'ROE', short: 'ROE', isPercent: true },
  { id: 'rev', label: '매출액 (당기)', short: '매출액' },
  { id: 'op', label: '영업이익 (당기)', short: '영업이익' },
  { id: 'net', label: '당기순이익 (당기)', short: '당기순이익' },
]

function pickMetric(r: DartAnalysisRow, id: MetricId): number | null {
  switch (id) {
    case 'perRev':
      return r.perRev
    case 'perOp':
      return r.perOp
    case 'roa':
      return r.roa == null ? null : r.roa * 100
    case 'roe':
      return r.roe == null ? null : r.roe * 100
    case 'rev':
      return r.rev.th
    case 'op':
      return r.op.th
    case 'net':
      return r.net.th
    default:
      return null
  }
}

function shortName(s: string, max = 10) {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

function filterByGroup(rows: DartAnalysisRow[], group: 'large' | 'mid' | 'peer'): DartAnalysisRow[] {
  if (group === 'large') return rows.filter((r) => r.tier === 'large')
  if (group === 'mid') return rows.filter((r) => r.tier === 'mid')
  return rows.filter((r) => r.tier === 'mid' && r.is_peer)
}

const BAR_COLORS = ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#c2410c', '#9a3412', '#7c2d12', '#431407']

type Props = {
  rows: DartAnalysisRow[]
  unitLabel: string
}

export default function DartAnalysisDashboard({ rows, unitLabel }: Props) {
  const [metricId, setMetricId] = useState<MetricId>('roe')
  const [focusCode, setFocusCode] = useState<string>('')

  const metric = METRICS.find((m) => m.id === metricId) ?? METRICS[0]

  const groupCharts = useMemo(() => {
    const groups: { key: 'large' | 'mid' | 'peer'; title: string; desc: string }[] = [
      { key: 'large', title: '대형사', desc: '규모: 대형' },
      { key: 'mid', title: '중소형사', desc: '규모: 중소형(피어 포함)' },
      { key: 'peer', title: '피어 그룹', desc: 'CORP registration에서 피어로 표시한 중소형사' },
    ]
    return groups.map((g) => {
      const list = filterByGroup(rows, g.key)
      const data = list.map((r, i) => {
        const v = pickMetric(r, metricId)
        return {
          name: shortName(r.corp_name),
          fullName: r.corp_name,
          value: v == null || Number.isNaN(v) ? 0 : v,
          isNull: v == null || Number.isNaN(v),
          fill: BAR_COLORS[i % BAR_COLORS.length],
        }
      })
      return { ...g, list, data }
    })
  }, [rows, metricId])

  const focusRow = useMemo(() => {
    if (!focusCode) return null
    return rows.find((r) => r.corp_code === focusCode) ?? null
  }, [rows, focusCode])

  const companyAmountData = useMemo(() => {
    if (!focusRow) return []
    return [
      { name: '매출', v: focusRow.rev.th },
      { name: '영업이익', v: focusRow.op.th },
      { name: '당기순이익', v: focusRow.net.th },
    ]
  }, [focusRow])

  const companyRatioData = useMemo(() => {
    if (!focusRow) return []
    return [
      { name: 'ROA', v: focusRow.roa == null ? null : focusRow.roa * 100 },
      { name: 'ROE', v: focusRow.roe == null ? null : focusRow.roe * 100 },
    ]
  }, [focusRow])

  const companyProductivityData = useMemo(() => {
    if (!focusRow) return []
    return [
      { name: '인당 매출', v: focusRow.perRev },
      { name: '인당 영업이익', v: focusRow.perOp },
    ]
  }, [focusRow])

  const fmtTooltip = (v: number, isPct: boolean) =>
    isPct ? `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : v.toLocaleString(undefined, { maximumFractionDigits: 2 })

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500 py-6 text-center">분석하기를 실행하면 그래프가 표시됩니다.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-[11px] text-zinc-600">그룹 비교 차트 지표</label>
          <select
            value={metricId}
            onChange={(e) => setMetricId(e.target.value as MetricId)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-[var(--fw-text)]"
          >
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.isPercent ? ' (%)' : ['rev', 'op', 'net'].includes(m.id) ? ` (${unitLabel})` : m.id === 'perRev' || m.id === 'perOp' ? ' (원)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[220px] flex-1 max-w-md">
          <label className="text-[11px] text-zinc-600">회사별 상세 (선택)</label>
          <select
            value={focusCode}
            onChange={(e) => setFocusCode(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="">선택 안 함</option>
            {rows.map((r) => (
              <option key={r.corp_code} value={r.corp_code}>
                {r.corp_name} ({formatDartCorpLabel(r.tier, r.is_peer)})
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[12px] text-zinc-500">
        집계는 DB <code className="text-[11px] bg-zinc-50 px-1 rounded border border-zinc-100">dart_fnltt</code> 저장분을 씁니다. 금액형 지표는 상단 금액 단위({unitLabel}) 기준, 인당은 원, ROA·ROE는 %입니다. 피어로 지정한 회사는 &quot;중소형사&quot;와 &quot;피어 그룹&quot; 두 차트에 모두 나타날 수 있습니다.
      </p>

      <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-3">
        {groupCharts.map((g) => (
          <div key={g.key} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-zinc-900">{g.title}</h3>
              <p className="text-[11px] text-zinc-500">{g.desc}</p>
              <p className="text-[11px] text-orange-700 mt-1">
                {metric.short} · {g.list.length}사
              </p>
            </div>
            {g.list.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-zinc-400 border border-dashed border-zinc-200 rounded-md">
                이 그룹에 해당하는 회사가 없습니다.
              </div>
            ) : (
              <div className="h-[280px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={g.data} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={60} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) =>
                        metric.isPercent ? `${Number(v).toFixed(0)}%` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : String(v)
                      }
                    />
                    <Tooltip
                      formatter={(value, _n, item) => {
                        const payload = item?.payload as { fullName?: string; isNull?: boolean } | undefined
                        const v = typeof value === 'number' ? value : Number(value)
                        return [
                          payload?.isNull ? '—' : fmtTooltip(v, !!metric.isPercent),
                          metric.short,
                        ]
                      }}
                      labelFormatter={(label, payload) => {
                        const p = Array.isArray(payload) ? payload[0]?.payload : undefined
                        return (p as { fullName?: string } | undefined)?.fullName ?? String(label)
                      }}
                    />
                    <Bar dataKey="value" name={metric.short} radius={[4, 4, 0, 0]}>
                      {g.data.map((entry, index) => (
                        <Cell key={`cell-${g.key}-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </div>

      {focusRow ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              {focusRow.corp_name}{' '}
              <span className="font-normal text-zinc-500">({formatDartCorpLabel(focusRow.tier, focusRow.is_peer)})</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-1">
              임직원 {focusRow.headcount != null ? focusRow.headcount.toLocaleString() : '—'}명 · 금액 축은 {unitLabel}, 인당은 원, 비율은 %
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md bg-white border border-zinc-100 p-2">
              <span className="text-[11px] font-medium text-zinc-600 block mb-2">손익·매출 ({unitLabel})</span>
              <div className="h-[220px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={companyAmountData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : String(v))} />
                    <Tooltip
                      formatter={(value) => [
                        (typeof value === 'number' ? value : Number(value)).toLocaleString(undefined, { maximumFractionDigits: 2 }),
                        unitLabel,
                      ]}
                    />
                    <Bar dataKey="v" fill="#ea580c" radius={[4, 4, 0, 0]} name="금액" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-md bg-white border border-zinc-100 p-2">
              <span className="text-[11px] font-medium text-zinc-600 block mb-2">인당 생산성 (원)</span>
              <div className="h-[220px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={companyProductivityData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (Math.abs(v) >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : String(v))} />
                    <Tooltip
                      formatter={(value) => {
                        const v = typeof value === 'number' ? value : value == null ? NaN : Number(value)
                        return v == null || Number.isNaN(v)
                          ? ['—', '원']
                          : [v.toLocaleString(undefined, { maximumFractionDigits: 0 }), '원']
                      }}
                    />
                    <Bar dataKey="v" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="원" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-md bg-white border border-zinc-100 p-2">
              <span className="text-[11px] font-medium text-zinc-600 block mb-2">ROA / ROE</span>
              <div className="h-[220px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={companyRatioData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
                    <Tooltip
                      formatter={(value) => {
                        const v = typeof value === 'number' ? value : value == null ? null : Number(value)
                        return v == null || Number.isNaN(v) ? ['—', '%'] : [`${v.toFixed(2)}%`, '비율']
                      }}
                    />
                    <Bar dataKey="v" fill="#6366f1" radius={[4, 4, 0, 0]} name="%" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
