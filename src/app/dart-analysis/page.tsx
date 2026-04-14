// src/app/dart-analysis/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import { CANON_OPTIONS } from '@/lib/accountCanonical'

type AccountItem = { account_nm: string; account_id: string | null; key: string }
type CompareRow = { corp_code: string; corp_name: string; thstrm_amount: number; frmtrm_amount: number }
type CorpItem = { corp_code: string; corp_name: string }

const REPRTS = [
  { code: '11011', name: '사업보고서(연간)' },
  { code: '11014', name: '3분기보고서' },
  { code: '11012', name: '반기보고서' },
  { code: '11013', name: '1분기보고서' },
] as const

type ReprtCode = (typeof REPRTS)[number]['code']
type FsDiv = 'OFS' | 'CFS'
type SjDiv = 'BS' | 'CIS'

const UNITS = [
  { label: '원', value: 1 },
  { label: '천원', value: 1_000 },
  { label: '백만원', value: 1_000_000 },
  { label: '억원', value: 100_000_000 },
  { label: '조원', value: 1_000_000_000_000 },
] as const

// 색상 규칙
const TH_COLOR_DEFAULT = '#111827' // 검정
const FR_COLOR_DEFAULT = '#9ca3af' // 회색
const HIGHLIGHT_CORP = '한화투자증권'
const HIGHLIGHT_BAR = '#FDBA74' // 막대: 옅은 주황
const HIGHLIGHT_ROW = '#FFF7ED' // 표 행 배경: 매우 옅은 주황(orange-50)

const parseAccountKey = (key: string) => {
  const idx = key.indexOf('|')
  if (idx === -1) return { account_id: null as string | null, account_nm: key }
  const id = key.slice(0, idx)
  const nm = key.slice(idx + 1)
  return { account_id: id === 'NA' ? null : id, account_nm: nm }
}

export default function DartAnalysisPage() {
  // 초기값
  const defaultYear = new Date().getFullYear() - 1
  const [year, setYear] = useState<number>(defaultYear)
  const [reprt, setReprt] = useState<ReprtCode>('11011')
  const [fsDiv, setFsDiv] = useState<FsDiv>('OFS')
  const [sjDiv, setSjDiv] = useState<SjDiv>('CIS') // UI 표기는 PL
  const sjLabel = sjDiv === 'BS' ? 'BS' : 'PL'

  const [unit, setUnit] = useState<number>(100_000_000) // 억원
  const [showCurrentOnly, setShowCurrentOnly] = useState<boolean>(false)

  // 계정 선택 모드 (기본: 원천)
  const [mode, setMode] = useState<'raw' | 'canon'>('canon')
  const [canonKey, setCanonKey] = useState<string>('매출액')

  // 계정 검색/선택(원천 모드)
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [accountQuery, setAccountQuery] = useState<string>('')
  const [selKey, setSelKey] = useState<string>('')
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  // 회사 필터
  const [corps, setCorps] = useState<CorpItem[]>([])
  const [selectedCorps, setSelectedCorps] = useState<string[]>([])
  const [loadingCorps, setLoadingCorps] = useState(false)

  // 결과
  const [rows, setRows] = useState<CompareRow[]>([])
  const [loadingCompare, setLoadingCompare] = useState(false)

  const fmt = (v?: number) => (v == null ? '-' : v.toLocaleString())
  const signClass = (n: number) => (n > 0 ? 'text-red-600' : n < 0 ? 'text-blue-600' : '')

  // 회사 목록
  useEffect(() => {
    const loadCorps = async () => {
      setLoadingCorps(true)
      try {
        const res = await fetch('/api/dart/corps')
        const data = (await res.json()) as { list?: CorpItem[] }
        const list: CorpItem[] = data?.list ?? []
        setCorps(list)
        setSelectedCorps(list.map((c) => c.corp_code)) // 전체 선택
      } finally {
        setLoadingCorps(false)
      }
    }
    loadCorps()
  }, [])

  // sjDiv 바뀔 때 표준 계정 기본값
  useEffect(() => {
    const list = sjDiv === 'BS' ? CANON_OPTIONS.BS : CANON_OPTIONS.CIS
    setCanonKey(list[0]?.key ?? '')
  }, [sjDiv])

  // 계정 목록 (조건 변경 시/원천 모드에서 사용)
  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true)
      try {
        const q = new URLSearchParams({ year: String(year), reprt, fs_div: fsDiv, sj_div: sjDiv })
        const res = await fetch(`/api/dart/accounts?` + q.toString())
        const data = (await res.json()) as { list?: AccountItem[] }
        const list: AccountItem[] = data?.list ?? []
        setAccounts(list)
        if (!list.find((a) => a.key === selKey)) setSelKey(list[0]?.key ?? '')
      } finally {
        setLoadingAccounts(false)
        setAccountQuery('')
      }
    }
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, reprt, fsDiv, sjDiv])

  // 검색 필터(원천 모드)
  const filteredAccounts = useMemo(() => {
    if (!accountQuery.trim()) return accounts
    const q = accountQuery.trim().toLowerCase()
    return accounts.filter(
      (a) => a.account_nm.toLowerCase().includes(q) || (a.account_id ?? '').toLowerCase().includes(q),
    )
  }, [accounts, accountQuery])

  const canQuery = useMemo(() => {
    if (selectedCorps.length === 0) return false
    return mode === 'canon' ? !!canonKey : !!selKey
  }, [mode, canonKey, selKey, selectedCorps.length])

  // 비교 데이터 로드
  const loadCompare = useCallback(async () => {
    if (!canQuery) return
    setLoadingCompare(true)
    try {
      const q = new URLSearchParams({
        year: String(year),
        reprt,
        fs_div: fsDiv,
        sj_div: sjDiv,
        corp_codes: selectedCorps.join(','),
      })
      if (mode === 'canon') {
        q.set('canon_key', canonKey)
      } else {
        const { account_id, account_nm } = parseAccountKey(selKey)
        q.set('account_nm', account_nm)
        if (account_id) q.set('account_id', account_id)
      }
      const res = await fetch(`/api/dart/compare?` + q.toString())
      const data = (await res.json()) as { rows?: CompareRow[] }
      setRows(data?.rows ?? [])
    } finally {
      setLoadingCompare(false)
    }
  }, [canQuery, year, reprt, fsDiv, sjDiv, selectedCorps, mode, canonKey, selKey])

  // 조건 변경 시 자동 조회 1회
  useEffect(() => {
    if (mode === 'raw' && selKey && selectedCorps.length) {
      loadCompare()
    }
  }, [mode, selKey, selectedCorps, loadCompare])

  useEffect(() => {
    if (mode === 'canon' && canonKey && selectedCorps.length) {
      loadCompare()
    }
  }, [mode, canonKey, selectedCorps, loadCompare])

  // 스케일링 + Δ/%
  const scaledRows = useMemo(() => {
    const div = unit || 1
    return rows.map((r) => {
      const th = r.thstrm_amount ?? 0
      const fr = r.frmtrm_amount ?? 0
      const delta = th - fr
      const pct = fr === 0 ? null : (delta / Math.abs(fr)) * 100
      return {
        ...r,
        th_scaled: th / div,
        fr_scaled: fr / div,
        delta_scaled: delta / div,
        pct,
      }
    })
  }, [rows, unit])

  // 엑셀 (현재 뷰 기준)
  const exportExcel = () => {
    const unitLabel = UNITS.find((u) => u.value === unit)?.label ?? '원'
    const meta: (string | number | boolean)[][] = [
      ['연도', year],
      ['보고서', REPRTS.find((r) => r.code === reprt)?.name ?? reprt],
      ['재무제표구분', fsDiv],
      ['표 종류', sjLabel],
      ['선택 모드', mode === 'canon' ? '표준 계정' : '원천 계정'],
      ['표준 계정키', mode === 'canon' ? (canonKey || '-') : '-'],
      ['계정(원천)', mode === 'raw' ? parseAccountKey(selKey).account_nm : '-'],
      ['단위', unitLabel],
      ['당기만 보기', showCurrentOnly ? '예' : '아니오'],
    ]
    const table = scaledRows.map((r) => {
      const base: Record<string, number | string> = {
        '회사': r.corp_name,
        [`당기(${unitLabel})`]: round2(r.th_scaled),
      }
      if (!showCurrentOnly) {
        base[`전기(${unitLabel})`] = round2(r.fr_scaled)
        base[`증감Δ(${unitLabel})`] = round2(r.delta_scaled)
        base['증감(%)'] = r.pct == null ? '-' : String(round2(r.pct))
      }
      return base
    })
    const wb = XLSX.utils.book_new()
    const wsMeta = XLSX.utils.aoa_to_sheet(meta)
    const wsData = XLSX.utils.json_to_sheet(table)
    XLSX.utils.book_append_sheet(wb, wsMeta, '조건')
    XLSX.utils.book_append_sheet(wb, wsData, '데이터')
    XLSX.writeFile(wb, `DART_${year}_${fsDiv}_${sjLabel}.xlsx`)
  }
  function round2(n: number) {
    return Math.round(n * 100) / 100
  }

  // 회사 토글
  const allSelected = selectedCorps.length === corps.length && corps.length > 0
  const toggleAll = () => {
    allSelected ? setSelectedCorps([]) : setSelectedCorps(corps.map((c) => c.corp_code))
  }
  
  const toggleCorp = (code: string, checked: boolean) => {
    setSelectedCorps((prev) => (checked ? Array.from(new Set([...prev, code])) : prev.filter((c) => c !== code)))
  }

  // 차트 폭(모바일 가로 스크롤)
  const chartWidth = Math.max(640, scaledRows.length * 80)

  // 공통 컨트롤 클래스
  const ctrlCls =
    'w-full min-w-0 text-[clamp(12px,1.05vw,14px)] h-10 md:h-10 px-3 py-2 rounded-md border border-zinc-300 bg-white'

  return (
    <div className="space-y-4 md:space-y-5">
      {/* ── 컨트롤 바 (Row 1) ───────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
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
                  fsDiv === 'OFS' ? 'bg-black text-white' : 'bg-white text-zinc-700'
                }`}
              >
                단일(OFS)
              </button>
              <button
                type="button"
                onClick={() => setFsDiv('CFS')}
                className={`flex-1 h-10 text-[clamp(12px,1.05vw,14px)] border-l ${
                  fsDiv === 'CFS' ? 'bg-black text-white' : 'bg-white text-zinc-700'
                }`}
              >
                연결(CFS)
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">표 종류</label>
            <div className="flex overflow-hidden rounded-md border border-zinc-300">
              <button
                type="button"
                onClick={() => setSjDiv('BS')}
                className={`flex-1 h-10 text-[clamp(12px,1.05vw,14px)] ${
                  sjDiv === 'BS' ? 'bg-black text-white' : 'bg-white text-zinc-700'
                }`}
              >
                BS
              </button>
              <button
                type="button"
                onClick={() => setSjDiv('CIS')}
                className={`flex-1 h-10 text-[clamp(12px,1.05vw,14px)] border-l ${
                  sjDiv === 'CIS' ? 'bg-black text-white' : 'bg-white text-zinc-700'
                }`}
              >
                PL
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">단위</label>
            <select value={unit} onChange={(e) => setUnit(parseInt(e.target.value, 10))} className={ctrlCls}>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center justify-end gap-2 min-w-0">
            <input
              id="current-only"
              type="checkbox"
              checked={showCurrentOnly}
              onChange={(e) => setShowCurrentOnly(e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            <span className="text-[clamp(12px,1.05vw,14px)]">당기만 보기</span>
          </label>
        </div>
      </div>

      {/* ── 컨트롤 바 (Row 2: 계정 선택) ───────────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-end">
          {/* 모드 토글 (원천이 기본/좌측) */}
          <div className="w-full lg:w-[320px] flex flex-col gap-1">
            <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">계정 선택 모드</label>
            <div className="flex rounded-md border border-zinc-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setMode('raw')}
                className={`flex-1 h-10 text-[clamp(12px,1.05vw,14px)] ${
                  mode === 'raw' ? 'bg-black text-white' : 'bg-white text-zinc-700'
                }`}
              >
                원천 계정
              </button>
              <button
                type="button"
                onClick={() => setMode('canon')}
                className={`flex-1 h-10 text-[clamp(12px,1.05vw,14px)] border-l ${
                  mode === 'canon' ? 'bg-black text-white' : 'bg-white text-zinc-700'
                }`}
              >
                표준 계정
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1 leading-snug">표준 계정은 회사별 명칭 차이를 교정해 비교 정확도를 높입니다.</p>
          </div>

          {/* 표준 / 원천 조건 */}
          {mode === 'canon' ? (
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">{sjDiv === 'BS' ? 'BS 표준 계정' : 'PL 표준 계정'}</label>
              <select value={canonKey} onChange={(e) => setCanonKey(e.target.value)} className={ctrlCls}>
                {(sjDiv === 'BS' ? CANON_OPTIONS.BS : CANON_OPTIONS.CIS).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">계정 검색</label>
                <input
                  type="text"
                  value={accountQuery}
                  onChange={(e) => setAccountQuery(e.target.value)}
                  placeholder="계정명 또는 IFRS ID (예: 자산총계, ifrs-full_Assets)"
                  className={ctrlCls + ' placeholder:text-[clamp(11px,0.95vw,12px)]'}
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <label className="text-[clamp(11px,0.9vw,12px)] text-zinc-600">계정 선택(원천)</label>
                <select value={selKey} onChange={(e) => setSelKey(e.target.value)} className={ctrlCls} title={filteredAccounts.find((a) => a.key === selKey)?.account_nm}>
                  {loadingAccounts && <option>불러오는 중…</option>}
                  {!loadingAccounts && filteredAccounts.length === 0 && <option>검색 결과 없음</option>}
                  {!loadingAccounts &&
                    filteredAccounts.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.account_nm}
                        {a.account_id ? ` (${a.account_id})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}

          {/* 버튼 */}
          <div className="flex gap-2 lg:ml-auto shrink-0">
            <button
              type="button"
              onClick={loadCompare}
              disabled={!canQuery || loadingCompare}
              className="px-4 md:px-5 h-10 rounded-md bg-black text-white hover:opacity-90 disabled:opacity-50 text-[clamp(12px,1.05vw,14px)]"
            >
              {loadingCompare ? '분석 중…' : '분석하기'}
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={scaledRows.length === 0}
              className="px-4 md:px-5 h-10 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 disabled:opacity-50 text-[clamp(12px,1.05vw,14px)]"
            >
              Excel 내보내기
            </button>
          </div>
        </div>
      </div>

      {/* ── 회사 필터 ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold text-[clamp(13px,1.1vw,14px)]">회사 선택</h4>
          <button type="button" className="text-[clamp(12px,1.05vw,14px)] px-3 h-9 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50" onClick={toggleAll}>
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {loadingCorps ? (
            <div className="col-span-full text-sm text-zinc-500">불러오는 중…</div>
          ) : (
            corps.map((c) => {
              const checked = selectedCorps.includes(c.corp_code)
              return (
                <label key={c.corp_code} className="flex items-center gap-2 text-[clamp(12px,1.05vw,14px)]">
                  <input type="checkbox" checked={checked} onChange={(e) => toggleCorp(c.corp_code, e.target.checked)} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c.corp_name}</span>
                </label>
              )
            })
          )}
        </div>
      </div>

      {/* ── 그래프 ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-[clamp(13px,1.1vw,14px)]">
            {year}년 · {REPRTS.find((r) => r.code === reprt)?.name} · {fsDiv} · {sjLabel} · 단위 {UNITS.find((u) => u.value === unit)?.label}
          </h3>
          <div className="text-[clamp(11px,0.95vw,12px)] text-zinc-500">{showCurrentOnly ? '막대: 당기' : '막대: 당기 / 막대2: 전기'}</div>
        </div>

        {scaledRows.length === 0 ? (
          <div className="text-sm text-zinc-500 p-6 text-center">표시할 데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ width: chartWidth }}>
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scaledRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="corp_name" tick={{ fontSize: 12 }} interval={0} height={60} />
                    <YAxis tickFormatter={(v: number) => v.toLocaleString()} />
                    {/* formatter 파라미터 타입 좁혀서 any 사용 회피 */}
                    <Tooltip formatter={(value: any) => (typeof value === 'number' ? value.toLocaleString() : String(value))} />
                    <Legend />
                    {/* 당기(검정, 한화는 주황) */}
                    <Bar dataKey="th_scaled" name="당기금액" fill={TH_COLOR_DEFAULT}>
                      {scaledRows.map((r) => (
                        <Cell key={`th-${r.corp_code}`} fill={r.corp_name === HIGHLIGHT_CORP ? HIGHLIGHT_BAR : TH_COLOR_DEFAULT} />
                      ))}
                    </Bar>
                    {/* 전기(회색, 한화는 연주황) */}
                    {showCurrentOnly ? null : (
                      <Bar dataKey="fr_scaled" name="전기금액" fill={FR_COLOR_DEFAULT}>
                        {scaledRows.map((r) => (
                          <Cell key={`fr-${r.corp_code}`} fill={r.corp_name === HIGHLIGHT_CORP ? HIGHLIGHT_BAR : FR_COLOR_DEFAULT} opacity={r.corp_name === HIGHLIGHT_CORP ? 0.7 : 1} />
                        ))}
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 원천 테이블 (한화 라인 하이라이트) ─────────────────── */}
      <div className="rounded-lg border border-zinc-200 bg-white overflow-auto">
        <table className="min-w-[900px] w-full text-[clamp(12px,1.05vw,14px)]">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-3 py-2 text-left">회사</th>
              <th className="px-3 py-2 text-right">당기 ({UNITS.find((u) => u.value === unit)?.label})</th>
              {showCurrentOnly ? null : (
                <>
                  <th className="px-3 py-2 text-right">전기 ({UNITS.find((u) => u.value === unit)?.label})</th>
                  <th className="px-3 py-2 text-right">증감 Δ ({UNITS.find((u) => u.value === unit)?.label})</th>
                  <th className="px-3 py-2 text-right">증감 (%)</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {scaledRows.map((r) => {
              const delta = r.delta_scaled
              const isHanhwa = r.corp_name === HIGHLIGHT_CORP
              return (
                <tr key={r.corp_code} className="border-t" style={isHanhwa ? { backgroundColor: HIGHLIGHT_ROW } : undefined}>
                  <td className="px-3 py-2">{r.corp_name}</td>
                  <td className="px-3 py-2 text-right">{fmt(round2(r.th_scaled))}</td>

                  {showCurrentOnly ? null : (
                    <>
                      <td className="px-3 py-2 text-right">{fmt(round2(r.fr_scaled))}</td>
                      <td className={`px-3 py-2 text-right ${signClass(delta)}`}>{fmt(round2(delta))}</td>
                      <td className={`px-3 py-2 text-right ${signClass(delta)}`}>{r.pct == null ? '-' : `${fmt(round2(r.pct))}%`}</td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs text-zinc-500">* Δ, %는 전기금액 기준입니다. 단위는 선택한 단위를 따릅니다.</div>
      </div>
    </div>
  )
}
