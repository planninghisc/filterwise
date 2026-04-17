import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchDartEmployeeHeadcount } from '@/lib/dartEmpSttus'
import type { FsDiv, ReprtCode } from '@/lib/dart'

type MetricKey =
  | 'net_operating_revenue'
  | 'sga_including_personnel'
  | 'operating_income'
  | 'profit_before_tax'
  | 'net_income'
  | 'equity'

type Formula = Record<MetricKey, string[]>
type FormulaTerm = { account_id: string; sign: 1 | -1 }
type SignedFormula = Record<MetricKey, FormulaTerm[]>

const DEFAULT_FORMULA: Formula = {
  net_operating_revenue: ['ifrs-full_ProfitLossFromOperatingActivities', 'ifrs-full_SellingGeneralAndAdministrativeExpense'],
  sga_including_personnel: ['ifrs-full_SellingGeneralAndAdministrativeExpense'],
  operating_income: ['ifrs-full_ProfitLossFromOperatingActivities'],
  profit_before_tax: ['ifrs-full_ProfitLossBeforeTax'],
  net_income: ['ifrs-full_ProfitLoss'],
  equity: ['ifrs-full_Equity'],
}

const FORMULA_BY_CORP: Record<string, Formula> = {
  '한화투자증권': DEFAULT_FORMULA,
  '신한투자증권': DEFAULT_FORMULA,
  '한국투자증권': DEFAULT_FORMULA,
  'KB증권': DEFAULT_FORMULA,
  'NH투자증권': DEFAULT_FORMULA,
  '교보증권': DEFAULT_FORMULA,
  '신영증권': DEFAULT_FORMULA,
  '유안타증권': DEFAULT_FORMULA,
  '현대차증권': DEFAULT_FORMULA,
  'IBK투자증권': DEFAULT_FORMULA,
  'iM증권': DEFAULT_FORMULA,
  'iM투자증권': DEFAULT_FORMULA,
  '삼성증권': {
    ...DEFAULT_FORMULA,
    net_operating_revenue: [
      'ifrs-full_ProfitLossFromOperatingActivities',
      'ifrs-full_SellingGeneralAndAdministrativeExpense',
      'dart_PersonalExpense',
    ],
    sga_including_personnel: ['ifrs-full_SellingGeneralAndAdministrativeExpense', 'dart_PersonalExpense'],
  },
  '메리츠증권': {
    ...DEFAULT_FORMULA,
    net_operating_revenue: [
      'ifrs-full_ProfitLossFromOperatingActivities',
      'dart_TotalSellingGeneralAdministrativeExpenses',
    ],
    sga_including_personnel: ['dart_TotalSellingGeneralAdministrativeExpenses'],
  },
  '대신증권': {
    ...DEFAULT_FORMULA,
    net_operating_revenue: [
      'dart_PersonalExpense',
      'ifrs-full_DepreciationAndAmortisationExpense',
      'ifrs-full_DepreciationAndAmortisationExpense',
      'ifrs-full_ProfitLossFromOperatingActivities',
    ],
    sga_including_personnel: [
      'dart_PersonalExpense',
      'ifrs-full_DepreciationAndAmortisationExpense',
      'ifrs-full_DepreciationAndAmortisationExpense',
    ],
  },
}

type FnlttRow = {
  corp_code: string
  sj_div: string
  sheet_code: string | null
  account_id: string | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
}

const SHEETS = {
  cis: { OFS: 'DS320005', CFS: 'DS320000' },
  bs: { OFS: 'DS220005', CFS: 'DS220000' },
} as const

function safeDiv(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null
  if (!Number.isFinite(num) || !Number.isFinite(den)) return null
  return num / den
}

function avg(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return (a + b) / 2
}

function sheetForMetric(key: MetricKey, fsDiv: FsDiv): string {
  return key === 'equity' ? SHEETS.bs[fsDiv] : SHEETS.cis[fsDiv]
}

function toSignedFormula(f: Formula): SignedFormula {
  return {
    net_operating_revenue: f.net_operating_revenue.map((account_id) => ({ account_id, sign: 1 })),
    sga_including_personnel: f.sga_including_personnel.map((account_id) => ({ account_id, sign: 1 })),
    operating_income: f.operating_income.map((account_id) => ({ account_id, sign: 1 })),
    profit_before_tax: f.profit_before_tax.map((account_id) => ({ account_id, sign: 1 })),
    net_income: f.net_income.map((account_id) => ({ account_id, sign: 1 })),
    equity: f.equity.map((account_id) => ({ account_id, sign: 1 })),
  }
}

function defaultSignedFormulaForName(corpName: string): SignedFormula {
  const base = FORMULA_BY_CORP[corpName] ?? DEFAULT_FORMULA
  const signed = toSignedFormula(base)
  if (corpName === '한국투자증권') {
    signed.sga_including_personnel = [{ account_id: 'ifrs-full_SellingGeneralAndAdministrativeExpense', sign: -1 }]
    signed.net_operating_revenue = [
      { account_id: 'ifrs-full_ProfitLossFromOperatingActivities', sign: 1 },
      { account_id: 'ifrs-full_SellingGeneralAndAdministrativeExpense', sign: -1 },
    ]
  }
  return signed
}

function normalizeFormulaFromDb(
  row: Partial<Record<MetricKey, unknown>> | null | undefined,
  corpName: string,
): SignedFormula {
  const fallback = defaultSignedFormulaForName(corpName)
  if (!row) return fallback

  const toTerms = (v: unknown, fb: FormulaTerm[]): FormulaTerm[] => {
    if (!Array.isArray(v)) return fb
    const out: FormulaTerm[] = []
    for (const it of v) {
      if (!it || typeof it !== 'object') continue
      const o = it as { account_id?: unknown; sign?: unknown }
      const account_id = String(o.account_id ?? '').trim()
      if (!account_id) continue
      const sign = Number(o.sign ?? 1) < 0 ? -1 : 1
      out.push({ account_id, sign })
    }
    return out.length > 0 ? out : fb
  }

  return {
    net_operating_revenue: toTerms(row.net_operating_revenue, fallback.net_operating_revenue),
    sga_including_personnel: toTerms(row.sga_including_personnel, fallback.sga_including_personnel),
    operating_income: toTerms(row.operating_income, fallback.operating_income),
    profit_before_tax: toTerms(row.profit_before_tax, fallback.profit_before_tax),
    net_income: toTerms(row.net_income, fallback.net_income),
    equity: toTerms(row.equity, fallback.equity),
  }
}

function sumMetric(
  rows: FnlttRow[],
  metric: MetricKey,
  formula: SignedFormula,
  fsDiv: FsDiv,
  period: 'th' | 'fr',
): number | null {
  const terms = formula[metric]
  const wantedSheet = sheetForMetric(metric, fsDiv)
  const sourceRows = rows.filter((r) => {
    if (metric === 'equity') return r.sj_div === 'BS'
    return r.sj_div === 'CIS' || r.sj_div === 'IS'
  })
  let hasAny = false
  let total = 0

  for (const term of terms) {
    const candidates = sourceRows.filter((r) => r.account_id === term.account_id)
    if (candidates.length === 0) continue

    const picked =
      candidates.find((r) => r.sheet_code === wantedSheet) ??
      candidates.find((r) => r.sheet_code == null) ??
      candidates[0]

    if (!picked) continue
    const v = period === 'th' ? picked.thstrm_amount : picked.frmtrm_amount
    if (v == null || Number.isNaN(Number(v))) continue
    hasAny = true
    total += Number(v) * term.sign
  }

  return hasAny ? total : null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const fsDiv = (searchParams.get('fs_div') ?? 'OFS') as FsDiv
    const corpCodes = (searchParams.get('corp_codes') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (fsDiv !== 'OFS' && fsDiv !== 'CFS') {
      return NextResponse.json({ ok: false, error: 'fs_div은 OFS 또는 CFS여야 합니다.' }, { status: 400 })
    }
    if (corpCodes.length === 0) {
      return NextResponse.json({ ok: false, error: 'corp_codes가 필요합니다.' }, { status: 400 })
    }

    const [fnRes, corpRes, headRes, formulaRes] = await Promise.all([
      supabaseAdmin
        .from('dart_fnltt')
        .select('corp_code, sj_div, sheet_code, account_id, thstrm_amount, frmtrm_amount')
        .eq('bsns_year', year)
        .eq('reprt_code', reprt)
        .eq('fs_div', fsDiv)
        .in('sj_div', ['BS', 'CIS'])
        .in('corp_code', corpCodes),
      supabaseAdmin.from('dart_corp').select('corp_code, corp_name, tier, is_peer').in('corp_code', corpCodes),
      Promise.all(
        corpCodes.map(async (corp_code) => {
          try {
            const r = await fetchDartEmployeeHeadcount(corp_code, year, reprt)
            return { corp_code, headcount: r.count, note: r.note }
          } catch (e: unknown) {
            return {
              corp_code,
              headcount: null,
              note: e instanceof Error ? e.message : 'error',
            }
          }
        }),
      ),
      supabaseAdmin
        .from('dart_analysis_formula')
        .select(
          'corp_code, net_operating_revenue, sga_including_personnel, operating_income, profit_before_tax, net_income, equity',
        )
        .in('corp_code', corpCodes),
    ])

    if (fnRes.error) throw fnRes.error
    if (corpRes.error) throw corpRes.error
    if (formulaRes.error) throw formulaRes.error

    const rawRows = (fnRes.data ?? []) as FnlttRow[]
    if (rawRows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '해당 조건의 dart_fnltt 데이터가 없습니다. 먼저 DART BS/PL RAW 화면에서 데이터를 적재해 주세요.',
        },
        { status: 404 },
      )
    }

    const corpMap = new Map(
      (corpRes.data ?? []).map((c) => [c.corp_code, c as { corp_code: string; corp_name: string; tier: string; is_peer: boolean }]),
    )
    const headMap = new Map(headRes.map((h) => [h.corp_code, h]))
    const formulaMap = new Map(
      (formulaRes.data ?? []).map((r) => [
        String((r as { corp_code?: string }).corp_code ?? ''),
        r as Partial<Record<MetricKey, unknown>>,
      ]),
    )
    const rowsByCorp = new Map<string, FnlttRow[]>()
    for (const r of rawRows) {
      if (!rowsByCorp.has(r.corp_code)) rowsByCorp.set(r.corp_code, [])
      rowsByCorp.get(r.corp_code)!.push(r)
    }

    const results = corpCodes.map((corp_code) => {
      const meta = corpMap.get(corp_code)
      const corp_name = meta?.corp_name?.trim() || corp_code
      const formula = normalizeFormulaFromDb(formulaMap.get(corp_code), corp_name)
      const rowset = rowsByCorp.get(corp_code) ?? []
      const head = headMap.get(corp_code)

      const th = {
        net_operating_revenue: sumMetric(rowset, 'net_operating_revenue', formula, fsDiv, 'th'),
        sga_including_personnel: sumMetric(rowset, 'sga_including_personnel', formula, fsDiv, 'th'),
        operating_income: sumMetric(rowset, 'operating_income', formula, fsDiv, 'th'),
        profit_before_tax: sumMetric(rowset, 'profit_before_tax', formula, fsDiv, 'th'),
        net_income: sumMetric(rowset, 'net_income', formula, fsDiv, 'th'),
        equity: sumMetric(rowset, 'equity', formula, fsDiv, 'th'),
      }
      const fr = {
        net_operating_revenue: sumMetric(rowset, 'net_operating_revenue', formula, fsDiv, 'fr'),
        sga_including_personnel: sumMetric(rowset, 'sga_including_personnel', formula, fsDiv, 'fr'),
        operating_income: sumMetric(rowset, 'operating_income', formula, fsDiv, 'fr'),
        profit_before_tax: sumMetric(rowset, 'profit_before_tax', formula, fsDiv, 'fr'),
        net_income: sumMetric(rowset, 'net_income', formula, fsDiv, 'fr'),
        equity: sumMetric(rowset, 'equity', formula, fsDiv, 'fr'),
      }
      const headcount = head?.headcount ?? null

      return {
        corp_code,
        corp_name,
        tier: meta?.tier === 'large' ? 'large' : 'mid',
        is_peer: Boolean(meta?.is_peer),
        headcount,
        headcount_note: head?.note,
        th,
        fr,
        ratio: {
          roe: safeDiv(th.net_income, avg(fr.equity, th.equity)),
          cir: safeDiv(th.sga_including_personnel, th.net_operating_revenue),
          productivity: safeDiv(th.net_operating_revenue, headcount),
        },
      }
    })

    return NextResponse.json({
      ok: true,
      year,
      reprt,
      fs_div: fsDiv,
      sheets: {
        cis: SHEETS.cis[fsDiv],
        bs: SHEETS.bs[fsDiv],
      },
      metricLabels: {
        net_operating_revenue: '순영업수익',
        sga_including_personnel: '판매와일반관리비(인건비포함)',
        operating_income: '영업이익',
        profit_before_tax: '세전이익(법인세차감전이익)',
        net_income: '당기순이익',
        equity: '자기자본',
      },
      rows: results,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
