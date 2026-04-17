// 회사·연도·보고서·재무구분·표(PL/BS) 단위로 dart_fnltt 원장 행 조회 (계정별 확인용)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeDartSjDiv, type ReprtCode, type FsDiv, type SjDiv } from '@/lib/dart'

const ALL_SJ: SjDiv[] = ['BS', 'CIS', 'CF', 'SCE']

function normalizeQuerySjDiv(v: string | null): SjDiv | 'ALL' {
  const s = (v ?? 'ALL').trim().toUpperCase()
  if (!s || s === 'ALL') return 'ALL'
  return normalizeDartSjDiv(s)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const corp_code = (searchParams.get('corp_code') ?? '').trim()
    if (!corp_code) {
      return NextResponse.json({ ok: false, error: 'corp_code가 필요합니다.' }, { status: 400 })
    }

    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const fs_div = (searchParams.get('fs_div') ?? 'OFS') as FsDiv
    const sj = normalizeQuerySjDiv(searchParams.get('sj_div'))

    let q = supabaseAdmin
      .from('dart_fnltt')
      .select(
        'sj_div, sheet_code, account_nm, account_id, canon_key, canon_score, thstrm_amount, frmtrm_amount, ord, currency',
      )
      .eq('corp_code', corp_code)
      .eq('bsns_year', year)
      .eq('reprt_code', reprt)
      .eq('fs_div', fs_div)

    if (sj === 'ALL') {
      q = q.in('sj_div', ALL_SJ)
    } else {
      q = q.eq('sj_div', sj)
    }

    const { data, error } = await q
    if (error) throw error

    const sjOrder: Record<string, number> = { BS: 0, CIS: 1, CF: 2, SCE: 3 }
    const rows = (data ?? []).sort((a, b) => {
      const sa = String(a.sj_div ?? '')
      const sb = String(b.sj_div ?? '')
      const oa = sjOrder[sa] ?? 99
      const ob = sjOrder[sb] ?? 99
      if (oa !== ob) return oa - ob
      const ordA = a.ord ?? 1e12
      const ordB = b.ord ?? 1e12
      if (ordA !== ordB) return ordA - ordB
      return String(a.account_nm ?? '').localeCompare(String(b.account_nm ?? ''), 'ko')
    })

    return NextResponse.json({
      ok: true,
      corp_code,
      year,
      reprt,
      fs_div,
      sj_div: sj === 'ALL' ? 'BS+CIS+CF+SCE' : sj,
      count: rows.length,
      rows,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
