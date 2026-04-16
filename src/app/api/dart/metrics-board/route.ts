// src/app/api/dart/metrics-board/route.ts
// 증권사 비교용: PL·BS 표준계정 다수를 회사별로 한 번에 조회
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { classifyToCanon, type CanonKey } from '@/lib/accountCanonical'
import type { ReprtCode, FsDiv, SjDiv } from '@/lib/dart'

type CanonSjDiv = 'BS' | 'CIS'
const asCanonSjDiv = (v: string): CanonSjDiv | null => (v === 'BS' || v === 'CIS' ? v : null)

const METRIC_KEYS = [
  'PL_REVENUE',
  'PL_OPERATING_PROFIT',
  'PL_SGA',
  'PL_NET_PROFIT',
  'BS_TOTAL_ASSETS',
  'BS_TOTAL_EQUITY',
] as const satisfies readonly CanonKey[]

type FnlttRow = {
  corp_code: string
  sj_div: SjDiv
  account_nm: string | null
  account_id: string | null
  canon_key?: string | null
  canon_score?: number | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
}

type MetricVal = { th: number; fr: number }

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

    if (corpCodes.length === 0) {
      return NextResponse.json({ ok: false, error: 'corp_codes가 필요합니다.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('dart_fnltt')
      .select(
        'corp_code, sj_div, account_nm, account_id, canon_key, canon_score, thstrm_amount, frmtrm_amount',
      )
      .eq('bsns_year', year)
      .eq('reprt_code', reprt)
      .eq('fs_div', fsDiv)
      .in('sj_div', ['BS', 'CIS'])
      .in('corp_code', corpCodes)

    if (error) throw error
    const rows = (data ?? []) as FnlttRow[]

    const { data: corpRows, error: corpErr } = await supabaseAdmin
      .from('dart_corp')
      .select('corp_code, corp_name')
      .in('corp_code', corpCodes)

    const nameByCode = new Map<string, string>()
    if (corpErr) {
      console.warn('[metrics-board] dart_corp lookup skipped:', corpErr.message)
    } else {
      for (const c of corpRows ?? []) {
        const row = c as { corp_code?: string; corp_name?: string | null }
        const code = row.corp_code
        const nm = row.corp_name
        if (code) nameByCode.set(code, (nm ?? '').trim() || code)
      }
    }

    // corp → canonKey → best row (compare 라우트와 동일 로직)
    type Bucket = { th: number; fr: number; score: number }
    const byCorp = new Map<string, Map<string, Bucket>>()

    const keyList = METRIC_KEYS as readonly string[]

    for (const r of rows) {
      const corp = r.corp_code
      if (!byCorp.has(corp)) byCorp.set(corp, new Map())

      let mk: CanonKey | null = null
      let score = 0

      if (r.canon_key && keyList.includes(r.canon_key)) {
        mk = r.canon_key as CanonKey
        score = typeof r.canon_score === 'number' ? r.canon_score : 0
      } else {
        const canonSj = asCanonSjDiv(r.sj_div)
        const c = canonSj ? classifyToCanon(canonSj, r.account_id, r.account_nm) : null
        if (c && keyList.includes(c.key)) {
          mk = c.key
          score = c.score
        }
      }
      if (!mk) continue

      const th = r.thstrm_amount ?? 0
      const fr = r.frmtrm_amount ?? 0
      const m = byCorp.get(corp)!
      const prev = m.get(mk)
      const cand: Bucket = { th, fr, score }
      if (
        !prev ||
        cand.score > prev.score ||
        (cand.score === prev.score && Math.abs(cand.th) > Math.abs(prev.th))
      ) {
        m.set(mk, cand)
      }
    }

    const out = corpCodes.map((code) => {
      const nm = nameByCode.get(code) || code
      const m = byCorp.get(code) ?? new Map()
      const metrics: Record<string, MetricVal> = {}
      for (const mk of METRIC_KEYS) {
        const b = m.get(mk)
        metrics[mk] = { th: b?.th ?? 0, fr: b?.fr ?? 0 }
      }
      return { corp_code: code, corp_name: nm, metrics }
    })

    return NextResponse.json({
      ok: true,
      year,
      reprt,
      fs_div: fsDiv,
      metricKeys: [...METRIC_KEYS],
      rows: out,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
