'use client'

import Link from 'next/link'
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

  return (
    <div className="space-y-5 text-[var(--fw-text)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500 mb-1">
            <Link href="/dart-analysis" className="text-[#c2410c] hover:underline">
              DART Analysis
            </Link>
            <span className="mx-1 text-zinc-400">/</span>
            CORP Account
          </p>
          <h1 className="text-lg font-semibold text-zinc-900">CORP Account</h1>
          <p className="mt-1 text-sm text-zinc-600 max-w-2xl">
            회사별로 DART Analysis에 쓰는 6개 지표의 QNAME 조합식을 정의합니다. DB 테이블{' '}
            <code className="rounded bg-zinc-100 px-1 text-xs">dart_analysis_formula</code>에 저장됩니다.
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
          </>
        )}
      </div>
    </div>
  )
}
