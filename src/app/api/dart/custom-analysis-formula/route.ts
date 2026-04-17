import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type MetricKey =
  | 'net_operating_revenue'
  | 'sga_including_personnel'
  | 'operating_income'
  | 'profit_before_tax'
  | 'net_income'
  | 'equity'

type FormulaTerm = { account_id: string; sign?: number }
type FormulaPayload = Record<MetricKey, FormulaTerm[]>

const KEYS: MetricKey[] = [
  'net_operating_revenue',
  'sga_including_personnel',
  'operating_income',
  'profit_before_tax',
  'net_income',
  'equity',
]

function normalizeTerms(v: unknown): FormulaTerm[] {
  if (!Array.isArray(v)) return []
  const out: FormulaTerm[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const o = x as { account_id?: unknown; sign?: unknown }
    const raw = String(o.account_id ?? '').trim()
    if (!raw) continue
    let account_id = raw
    let sign: 1 | -1 = Number(o.sign ?? 1) < 0 ? -1 : 1
    if (account_id.startsWith('-')) {
      sign = -1
      account_id = account_id.slice(1).trim()
    } else if (account_id.startsWith('+')) {
      account_id = account_id.slice(1).trim()
    }
    if (!account_id) continue
    out.push({ account_id, sign })
  }
  return out
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const corpCodes = (searchParams.get('corp_codes') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    let q = supabaseAdmin
      .from('dart_analysis_formula')
      .select('corp_code, net_operating_revenue, sga_including_personnel, operating_income, profit_before_tax, net_income, equity, updated_at')
    if (corpCodes.length > 0) q = q.in('corp_code', corpCodes)

    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []).map((row) => {
      const normalized: Record<string, unknown> = { ...row }
      for (const k of KEYS) normalized[k] = normalizeTerms((row as Record<string, unknown>)[k])
      return normalized
    })
    return NextResponse.json({ ok: true, rows })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { corp_code?: string; formula?: Partial<FormulaPayload> }
    const corp_code = String(body.corp_code ?? '').trim()
    if (!corp_code) {
      return NextResponse.json({ ok: false, error: 'corp_code가 필요합니다.' }, { status: 400 })
    }

    const formula = body.formula ?? {}
    const payload: Record<string, unknown> = { corp_code, updated_at: new Date().toISOString() }
    for (const k of KEYS) {
      payload[k] = normalizeTerms(formula[k])
    }

    const { error } = await supabaseAdmin.from('dart_analysis_formula').upsert(payload, { onConflict: 'corp_code' })
    if (error) throw error
    return NextResponse.json({ ok: true, corp_code })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
