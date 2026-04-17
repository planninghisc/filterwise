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

type FnlttRow = {
  corp_code: string
  sj_div: string
  sheet_code: string | null
  account_id: string | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
}

async function fetchAllFnlttRows(args: {
  year: number
  reprt: ReprtCode
  fsDiv: FsDiv
  corpCodes: string[]
}): Promise<FnlttRow[]> {
  const out: FnlttRow[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabaseAdmin
      .from('dart_fnltt')
      .select('corp_code, sj_div, sheet_code, account_id, thstrm_amount, frmtrm_amount')
      .eq('bsns_year', args.year)
      .eq('reprt_code', args.reprt)
      .eq('fs_div', args.fsDiv)
      .in('sj_div', ['BS', 'CIS', 'IS', 'PL'])
      .in('corp_code', args.corpCodes)
      .range(from, to)

    if (error) throw error
    const rows = (data ?? []) as FnlttRow[]
    out.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }

  return out
}

const SHEETS = {
  cis: { OFS: 'DS320005', CFS: 'DS320000' },
  bs: { OFS: 'DS220005', CFS: 'DS220000' },
} as const

const ACCOUNT_ID_ALIASES: Record<string, string[]> = {
  // 메리츠증권 등에서 판관비를 IF-RS 표준 대신 DART 확장 QNAME으로 제공
  'ifrs-full_SellingGeneralAndAdministrativeExpense': ['dart_TotalSellingGeneralAdministrativeExpenses'],
}

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
    return r.sj_div === 'CIS' || r.sj_div === 'IS' || r.sj_div === 'PL'
  })
  let hasAny = false
  let total = 0

  for (const term of terms) {
    const idsToMatch = [term.account_id, ...(ACCOUNT_ID_ALIASES[term.account_id] ?? [])]
    const candidates = sourceRows.filter((r) => idsToMatch.includes(String(r.account_id ?? '')))
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

    const [rawRows, corpRes, hcRes] = await Promise.all([
      fetchAllFnlttRows({ year, reprt, fsDiv, corpCodes }),
      supabaseAdmin.from('dart_corp').select('corp_code, corp_name, tier, is_peer').in('corp_code', corpCodes),
      supabaseAdmin
        .from('dart_headcount')
        .select('corp_code, headcount, headcount_source')
        .eq('bsns_year', year)
        .eq('reprt_code', reprt)
        .in('corp_code', corpCodes),
    ])

    if (corpRes.error) throw corpRes.error
    if (hcRes.error) throw hcRes.error

    const dbHeadByCode = new Map(
      (hcRes.data ?? []).map((r) => {
        const row = r as { corp_code: string; headcount: number | null; headcount_source: string | null }
        return [row.corp_code, row] as const
      }),
    )

    const headRes = await Promise.all(
      corpCodes.map(async (corp_code) => {
        const db = dbHeadByCode.get(corp_code)
        if (db != null && db.headcount != null && Number.isFinite(Number(db.headcount))) {
          const n = Math.round(Number(db.headcount))
          const src = (db.headcount_source ?? '').trim()
          return {
            corp_code,
            headcount: n,
            note: src ? `dart_headcount · ${src}` : 'dart_headcount',
          }
        }
        try {
          const r = await fetchDartEmployeeHeadcount(corp_code, year, reprt)
          return {
            corp_code,
            headcount: r.count,
            note: r.note ? `empSttus · ${r.note}` : 'empSttus (DB 없음)',
          }
        } catch (e: unknown) {
          return {
            corp_code,
            headcount: null,
            note: e instanceof Error ? e.message : 'error',
          }
        }
      }),
    )

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
    const baseFormula = toSignedFormula(DEFAULT_FORMULA)
    const rowsByCorp = new Map<string, FnlttRow[]>()
    for (const r of rawRows) {
      if (!rowsByCorp.has(r.corp_code)) rowsByCorp.set(r.corp_code, [])
      rowsByCorp.get(r.corp_code)!.push(r)
    }

    const results = corpCodes.map((corp_code) => {
      const meta = corpMap.get(corp_code)
      const corp_name = meta?.corp_name?.trim() || corp_code
      const rowset = rowsByCorp.get(corp_code) ?? []
      const head = headMap.get(corp_code)

      const th = {
        net_operating_revenue: sumMetric(rowset, 'net_operating_revenue', baseFormula, fsDiv, 'th'),
        sga_including_personnel: sumMetric(rowset, 'sga_including_personnel', baseFormula, fsDiv, 'th'),
        operating_income: sumMetric(rowset, 'operating_income', baseFormula, fsDiv, 'th'),
        profit_before_tax: sumMetric(rowset, 'profit_before_tax', baseFormula, fsDiv, 'th'),
        net_income: sumMetric(rowset, 'net_income', baseFormula, fsDiv, 'th'),
        equity: sumMetric(rowset, 'equity', baseFormula, fsDiv, 'th'),
      }
      const fr = {
        net_operating_revenue: sumMetric(rowset, 'net_operating_revenue', baseFormula, fsDiv, 'fr'),
        sga_including_personnel: sumMetric(rowset, 'sga_including_personnel', baseFormula, fsDiv, 'fr'),
        operating_income: sumMetric(rowset, 'operating_income', baseFormula, fsDiv, 'fr'),
        profit_before_tax: sumMetric(rowset, 'profit_before_tax', baseFormula, fsDiv, 'fr'),
        net_income: sumMetric(rowset, 'net_income', baseFormula, fsDiv, 'fr'),
        equity: sumMetric(rowset, 'equity', baseFormula, fsDiv, 'fr'),
      }
      const headcount = head?.headcount ?? null

      return {
        corp_code,
        corp_name,
        tier: meta?.tier === 'large' ? 'large' : 'mid',
        is_peer: Boolean(meta?.is_peer),
        /** 선택한 연도·보고서·fs_div로 조회된 dart_fnltt 행 수(다른 연도 적재분은 포함되지 않음) */
        fnltt_row_count: rowset.length,
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
