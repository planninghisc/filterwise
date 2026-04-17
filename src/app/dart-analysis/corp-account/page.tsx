'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { mergeDartCorpsFromDb, type MergedDartCorp } from '@/data/dartCorpRows'

type CorpItem = MergedDartCorp

type MetricKey =
  | 'net_operating_revenue'
  | 'sga_including_personnel'
  | 'operating_income'
  | 'profit_before_tax'
  | 'net_income'
  | 'equity'

type FormulaTerm = { account_id: string; sign: 1 | -1 }
type SignedFormula = Record<MetricKey, FormulaTerm[]>
type ReprtCode = '11011' | '11014' | '11012' | '11013'
type FsDiv = 'OFS' | 'CFS'
type SjDiv = 'BS' | 'CIS'
type AccountItem = { account_nm: string; account_id: string | null; key: string }

const REPRTS: { code: ReprtCode; name: string }[] = [
  { code: '11011', name: '사업보고서(연간)' },
  { code: '11014', name: '3분기보고서' },
  { code: '11012', name: '반기보고서' },
  { code: '11013', name: '1분기보고서' },
]

const METRICS: MetricKey[] = [
  'net_operating_revenue',
  'sga_including_personnel',
  'operating_income',
  'profit_before_tax',
  'net_income',
  'equity',
]

function metricName(k: MetricKey) {
  return (
    {
      net_operating_revenue: '순영업수익',
      sga_including_personnel: '판매와일반관리비(인건비포함)',
      operating_income: '영업이익',
      profit_before_tax: '세전이익(법인세차감전이익)',
      net_income: '당기순이익',
      equity: '자기자본',
    } as const
  )[k]
}

function termsToText(terms: FormulaTerm[] | undefined) {
  return (terms ?? []).map((t) => `${t.sign < 0 ? '-' : '+'}${t.account_id}`).join('\n')
}

function textToTerms(text: string): FormulaTerm[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('-')) return { account_id: line.slice(1).trim(), sign: -1 as const }
      if (line.startsWith('+')) return { account_id: line.slice(1).trim(), sign: 1 as const }
      return { account_id: line.trim(), sign: 1 as const }
    })
    .filter((t) => t.account_id.length > 0)
}

export default function DartCorpAccountPage() {
  const [corps, setCorps] = useState<CorpItem[]>([])
  const [loadingCorps, setLoadingCorps] = useState(false)
  const [formulaByCorp, setFormulaByCorp] = useState<Record<string, SignedFormula>>({})
  const [editCorpCode, setEditCorpCode] = useState('')
  const [formulaText, setFormulaText] = useState<Record<MetricKey, string>>({
    net_operating_revenue: '',
    sga_including_personnel: '',
    operating_income: '',
    profit_before_tax: '',
    net_income: '',
    equity: '',
  })
  const [savingFormula, setSavingFormula] = useState(false)
  const [formulaMsg, setFormulaMsg] = useState('')
  const [accountYear, setAccountYear] = useState<number>(new Date().getFullYear() - 1)
  const [accountReprt, setAccountReprt] = useState<ReprtCode>('11011')
  const [accountFsDiv, setAccountFsDiv] = useState<FsDiv>('OFS')
  const [accountSjDiv, setAccountSjDiv] = useState<SjDiv>('CIS')
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [accountList, setAccountList] = useState<AccountItem[]>([])
  const [quickPickByMetric, setQuickPickByMetric] = useState<Record<MetricKey, string>>({
    net_operating_revenue: '',
    sga_including_personnel: '',
    operating_income: '',
    profit_before_tax: '',
    net_income: '',
    equity: '',
  })

  const loadFormulaMap = useCallback(async (codes: string[]) => {
    if (codes.length === 0) return
    const q = new URLSearchParams({ corp_codes: codes.join(',') })
    const res = await fetch(`/api/dart/custom-analysis-formula?${q.toString()}`)
    const json = (await res.json()) as {
      ok?: boolean
      rows?: Array<{ corp_code: string } & Partial<Record<MetricKey, FormulaTerm[]>>>
    }
    if (!res.ok || !json.ok) return
    const next: Record<string, SignedFormula> = {}
    for (const row of json.rows ?? []) {
      const toTerms = (v: FormulaTerm[] | undefined) => (Array.isArray(v) ? v : [])
      next[row.corp_code] = {
        net_operating_revenue: toTerms(row.net_operating_revenue),
        sga_including_personnel: toTerms(row.sga_including_personnel),
        operating_income: toTerms(row.operating_income),
        profit_before_tax: toTerms(row.profit_before_tax),
        net_income: toTerms(row.net_income),
        equity: toTerms(row.equity),
      }
    }
    setFormulaByCorp(next)
  }, [])

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
      } finally {
        setLoadingCorps(false)
      }
    }
    loadCorps()
  }, [])

  useEffect(() => {
    if (corps.length === 0) return
    if (!editCorpCode || !corps.some((c) => c.corp_code === editCorpCode)) {
      setEditCorpCode(corps[0]!.corp_code)
    }
  }, [corps, editCorpCode])

  useEffect(() => {
    if (corps.length === 0) return
    loadFormulaMap(corps.map((c) => c.corp_code))
  }, [corps, loadFormulaMap])

  useEffect(() => {
    if (!editCorpCode) return
    const f = formulaByCorp[editCorpCode]
    setFormulaText({
      net_operating_revenue: termsToText(f?.net_operating_revenue),
      sga_including_personnel: termsToText(f?.sga_including_personnel),
      operating_income: termsToText(f?.operating_income),
      profit_before_tax: termsToText(f?.profit_before_tax),
      net_income: termsToText(f?.net_income),
      equity: termsToText(f?.equity),
    })
  }, [editCorpCode, formulaByCorp])

  const loadFnlttAccounts = useCallback(async () => {
    if (!editCorpCode) return
    setLoadingAccounts(true)
    setAccountError('')
    try {
      const q = new URLSearchParams({
        corp_code: editCorpCode,
        year: String(accountYear),
        reprt: accountReprt,
        fs_div: accountFsDiv,
        sj_div: accountSjDiv,
      })
      const res = await fetch(`/api/dart/accounts?${q.toString()}`)
      const json = (await res.json()) as { ok?: boolean; error?: string; list?: AccountItem[] }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'dart_fnltt 계정 조회 실패')
      setAccountList(Array.isArray(json.list) ? json.list : [])
    } catch (e: unknown) {
      setAccountList([])
      setAccountError(e instanceof Error ? e.message : 'dart_fnltt 계정 조회 중 오류')
    } finally {
      setLoadingAccounts(false)
    }
  }, [editCorpCode, accountYear, accountReprt, accountFsDiv, accountSjDiv])

  useEffect(() => {
    loadFnlttAccounts()
  }, [loadFnlttAccounts])

  const saveFormula = async () => {
    if (!editCorpCode) return
    setSavingFormula(true)
    setFormulaMsg('')
    try {
      const formula: SignedFormula = {
        net_operating_revenue: textToTerms(formulaText.net_operating_revenue),
        sga_including_personnel: textToTerms(formulaText.sga_including_personnel),
        operating_income: textToTerms(formulaText.operating_income),
        profit_before_tax: textToTerms(formulaText.profit_before_tax),
        net_income: textToTerms(formulaText.net_income),
        equity: textToTerms(formulaText.equity),
      }
      const res = await fetch('/api/dart/custom-analysis-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corp_code: editCorpCode, formula }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? '저장 실패')
      setFormulaByCorp((prev) => ({ ...prev, [editCorpCode]: formula }))
      setFormulaMsg('저장되었습니다. DART Analysis에서 분석 실행 시 반영됩니다.')
    } catch (e: unknown) {
      setFormulaMsg(e instanceof Error ? e.message : '저장 중 오류')
    } finally {
      setSavingFormula(false)
    }
  }

  const corpLabel = useMemo(() => corps.find((c) => c.corp_code === editCorpCode)?.corp_name ?? '', [corps, editCorpCode])

  const appendFormulaLine = (metric: MetricKey, sign: 1 | -1) => {
    const picked = quickPickByMetric[metric]
    if (!picked) return
    const line = `${sign < 0 ? '-' : '+'}${picked}`
    setFormulaText((prev) => {
      const curLines = prev[metric]
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      if (curLines.includes(line)) return prev
      return {
        ...prev,
        [metric]: [...curLines, line].join('\n'),
      }
    })
  }

  return (
    <div className="space-y-5 text-[var(--fw-text)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">CORP Account</h1>
          <p className="mt-1 text-sm text-zinc-600 max-w-2xl">
            회사별로 DART Analysis에 쓰는 6개 지표의 QNAME 조합식을 정의합니다. DB 테이블{' '}
            <code className="rounded bg-zinc-100 px-1 text-xs">dart_analysis_formula</code>에 저장됩니다.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            등록 프로세스: <strong>1) CORP registration</strong> → <strong>2) DART BS/PL RAW</strong> 적재 →{' '}
            <strong>3) CORP Account</strong>에서 회사별 조합식 설정 → <strong>4) DART Analysis</strong> 실행
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 md:p-5 shadow-sm">
        {loadingCorps ? (
          <p className="text-sm text-zinc-500">회사 목록 불러오는 중…</p>
        ) : corps.length === 0 ? (
          <p className="text-sm text-zinc-500">등록된 회사가 없습니다. CORP registration에서 먼저 추가해 주세요.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">회사별 조합식</h2>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-zinc-600 shrink-0">회사</label>
                <select
                  value={editCorpCode}
                  onChange={(e) => setEditCorpCode(e.target.value)}
                  className="h-10 min-w-[200px] rounded-md border border-zinc-300 px-3 text-sm"
                >
                  {corps.map((c) => (
                    <option key={c.corp_code} value={c.corp_code}>
                      {c.corp_name} ({c.corp_code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              <strong className="text-zinc-700">{corpLabel}</strong> 기준 · 한 줄에 하나씩{' '}
              <code className="rounded bg-zinc-100 px-1">+ifrs-full_...</code> 또는{' '}
              <code className="rounded bg-zinc-100 px-1">-ifrs-full_...</code>
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {METRICS.map((k) => (
                <div key={k} className="min-w-0">
                  <label className="mb-1 block text-xs font-medium text-zinc-700">{metricName(k)}</label>
                  <textarea
                    value={formulaText[k]}
                    onChange={(e) => setFormulaText((prev) => ({ ...prev, [k]: e.target.value }))}
                    className="h-28 w-full rounded-md border border-zinc-300 p-2 font-mono text-xs focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    placeholder="+ifrs-full_ProfitLossFromOperatingActivities"
                    spellCheck={false}
                  />
                  <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-2">
                    <div className="mb-1 text-[11px] text-zinc-500">
                      조회된 계정에서 선택해 빠르게 추가
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={quickPickByMetric[k]}
                        onChange={(e) =>
                          setQuickPickByMetric((prev) => ({
                            ...prev,
                            [k]: e.target.value,
                          }))
                        }
                        className="h-8 min-w-[220px] max-w-full rounded border border-zinc-300 bg-white px-2 text-xs"
                      >
                        <option value="">계정 선택…</option>
                        {accountList.map((a) => (
                          <option key={`${k}-${a.key}`} value={a.account_id ?? ''}>
                            {a.account_nm} {a.account_id ? `(${a.account_id})` : '(NULL)'}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => appendFormulaLine(k, 1)}
                        disabled={!quickPickByMetric[k]}
                        className="h-8 rounded border border-zinc-300 bg-white px-2 text-xs disabled:opacity-50"
                      >
                        + 추가
                      </button>
                      <button
                        type="button"
                        onClick={() => appendFormulaLine(k, -1)}
                        disabled={!quickPickByMetric[k]}
                        className="h-8 rounded border border-zinc-300 bg-white px-2 text-xs disabled:opacity-50"
                      >
                        - 추가
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveFormula}
                disabled={!editCorpCode || savingFormula}
                className="h-10 rounded-md bg-[#ea580c] px-4 text-sm font-medium text-white hover:bg-[#c2410c] disabled:opacity-50"
              >
                {savingFormula ? '저장 중…' : '조합식 저장'}
              </button>
              {formulaMsg ? <span className="text-sm text-zinc-600">{formulaMsg}</span> : null}
            </div>

            <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-900">dart_fnltt 실제 계정 목록 (회사별)</h3>
                <button
                  type="button"
                  onClick={loadFnlttAccounts}
                  disabled={!editCorpCode || loadingAccounts}
                  className="h-8 rounded border border-zinc-300 bg-white px-3 text-xs disabled:opacity-50"
                >
                  {loadingAccounts ? '조회 중…' : '새로고침'}
                </button>
              </div>

              <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="text-xs text-zinc-600">연도</label>
                  <input
                    type="number"
                    value={accountYear}
                    onChange={(e) => setAccountYear(Number(e.target.value || 0))}
                    className="mt-1 h-9 w-full rounded border border-zinc-300 px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-600">보고서</label>
                  <select
                    value={accountReprt}
                    onChange={(e) => setAccountReprt(e.target.value as ReprtCode)}
                    className="mt-1 h-9 w-full rounded border border-zinc-300 px-2 text-sm"
                  >
                    {REPRTS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-600">재무구분</label>
                  <select
                    value={accountFsDiv}
                    onChange={(e) => setAccountFsDiv(e.target.value as FsDiv)}
                    className="mt-1 h-9 w-full rounded border border-zinc-300 px-2 text-sm"
                  >
                    <option value="OFS">별도(OFS)</option>
                    <option value="CFS">연결(CFS)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-600">표 구분</label>
                  <select
                    value={accountSjDiv}
                    onChange={(e) => setAccountSjDiv(e.target.value as SjDiv)}
                    className="mt-1 h-9 w-full rounded border border-zinc-300 px-2 text-sm"
                  >
                    <option value="CIS">손익(CIS/IS)</option>
                    <option value="BS">재무상태(BS)</option>
                  </select>
                </div>
              </div>

              <p className="mb-2 text-xs text-zinc-500">
                선택한 회사/조건에서 <code className="rounded bg-white px-1">dart_fnltt</code>에 실제 저장된 계정명을 기준으로 표시합니다.
              </p>
              {accountError ? <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{accountError}</div> : null}
              <div className="max-h-80 overflow-auto rounded border border-zinc-200 bg-white">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="sticky top-0 bg-zinc-100">
                    <tr>
                      <th className="px-2 py-2 text-left">계정명(account_nm)</th>
                      <th className="px-2 py-2 text-left">QNAME(account_id)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAccounts ? (
                      <tr>
                        <td className="px-2 py-2 text-zinc-500" colSpan={2}>
                          불러오는 중…
                        </td>
                      </tr>
                    ) : accountList.length === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-zinc-500" colSpan={2}>
                          조건에 맞는 계정이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      accountList.map((a) => (
                        <tr key={a.key} className="border-t border-zinc-100">
                          <td className="px-2 py-1.5">{a.account_nm || '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-700">{a.account_id ?? 'NULL'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
