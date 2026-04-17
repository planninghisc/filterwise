// XBRL 카탈로그(한화투자증권 기준) + dart_fnltt QNAME 매핑 집계
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { allCatalogLines, lineKey, type XbrlCatalogLine } from '@/data/xbrlHanwhaCatalog'
import type { ReprtCode, FsDiv } from '@/lib/dart'
import { requireCronOrSession } from '@/lib/requireCronOrSession'
import { fetchDartEmployeeHeadcount } from '@/lib/dartEmpSttus'
import { pickLineAmount, type FnlttMatchRow } from '@/lib/xbrlAmountMatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireCronOrSession(req)
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const fs_div = (searchParams.get('fs_div') ?? 'OFS') as FsDiv
    if (fs_div !== 'OFS' && fs_div !== 'CFS') {
      return NextResponse.json({ ok: false, error: 'fs_div은 OFS 또는 CFS여야 합니다.' }, { status: 400 })
    }
    const corpCodes = (searchParams.get('corp_codes') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (corpCodes.length === 0) {
      return NextResponse.json({ ok: false, error: 'corp_codes가 필요합니다.' }, { status: 400 })
    }

    const lines = allCatalogLines()

    const { data: fnData, error: fnErr } = await supabaseAdmin
      .from('dart_fnltt')
      .select(
        'corp_code, sj_div, fs_div, sheet_code, account_id, account_nm, thstrm_amount, frmtrm_amount',
      )
      .eq('bsns_year', year)
      .eq('reprt_code', reprt)
      .eq('fs_div', fs_div)
      .in('sj_div', ['BS', 'CIS'])
      .in('corp_code', corpCodes)

    if (fnErr) throw fnErr
    const fnRows = (fnData ?? []) as FnlttMatchRow[]

    const { data: corpRows, error: corpErr } = await supabaseAdmin
      .from('dart_corp')
      .select('corp_code, corp_name, tier, is_peer')
      .in('corp_code', corpCodes)

    if (corpErr) throw corpErr
    const corpMeta = new Map(
      (corpRows ?? []).map((c) => [
        (c as { corp_code: string }).corp_code,
        c as { corp_code: string; corp_name: string; tier: string; is_peer: boolean },
      ]),
    )

    const headItems: Array<{ corp_code: string; headcount: number | null; note?: string }> = []
    for (const corp_code of corpCodes) {
      try {
        const r = await fetchDartEmployeeHeadcount(corp_code, year, reprt)
        headItems.push({ corp_code, headcount: r.count, note: r.note })
        await new Promise((res) => setTimeout(res, 120))
      } catch (e: unknown) {
        headItems.push({
          corp_code,
          headcount: null,
          note: e instanceof Error ? e.message : 'error',
        })
      }
    }
    const headMap = new Map(headItems.map((h) => [h.corp_code, h]))

    const values: Record<string, Record<string, { th: number | null; fr: number | null }>> = {}
    for (const corp of corpCodes) {
      values[corp] = {}
      for (const line of lines) {
        const k = lineKey(line)
        values[corp][k] = {
          th: pickLineAmount(fnRows, corp, line, fs_div, 'th'),
          fr: pickLineAmount(fnRows, corp, line, fs_div, 'fr'),
        }
      }
    }

    const catalog = lines.map((line) => ({
      key: lineKey(line),
      sj: line.sj,
      label: line.label,
      id: line.id,
      sheet: expectedSheetLabel(line, fs_div),
    }))

    const corps = corpCodes.map((corp_code) => {
      const m = corpMeta.get(corp_code)
      const h = headMap.get(corp_code)
      return {
        corp_code,
        corp_name: m?.corp_name?.trim() || corp_code,
        tier: (m?.tier === 'large' ? 'large' : 'mid') as 'large' | 'mid',
        is_peer: Boolean(m?.is_peer),
        headcount: h?.headcount ?? null,
        headcount_note: h?.note,
      }
    })

    return NextResponse.json({
      ok: true,
      year,
      reprt,
      fs_div,
      catalog_source: 'docs/FilterWise_XBRL_한화투자증권_20260416.xlsx',
      catalog,
      corps,
      values,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

function expectedSheetLabel(line: XbrlCatalogLine, fs_div: FsDiv): string {
  if (line.sj === 'CIS') return fs_div === 'OFS' ? 'DS320005' : 'DS320000'
  return fs_div === 'OFS' ? 'DS220005' : 'DS220000'
}
