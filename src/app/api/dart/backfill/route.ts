//src/app/api/dart/backfill/route.ts
//백필 API (기존 데이터 일괄 캐시 세팅)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeAccountName, normalizeAccountId } from '@/lib/normalize'
import { classifyToCanon } from '@/lib/accountCanonical'
import type { ReprtCode, FsDiv, SjDiv } from '@/lib/dart'

type Row = {
  id: number
  sj_div: SjDiv
  account_nm: string | null
  account_id: string | null
  account_nm_norm: string | null
  account_id_norm: string | null
  canon_key: string | null
  canon_score: number | null
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Number(searchParams.get('limit') ?? 1000)

    // 아직 캐시가 비어있는 레코드 우선
    const { data, error } = await supabaseAdmin
      .from('dart_fnltt')
      .select('id, sj_div, account_nm, account_id, account_nm_norm, account_id_norm, canon_key, canon_score')
      .or('account_nm_norm.is.null,account_id_norm.is.null,canon_key.is.null')
      .limit(limit)

    if (error) throw error

    const rows = (data ?? []) as Row[]
    if (rows.length === 0) return NextResponse.json({ ok: true, updated: 0 })

    let updated = 0
    for (const r of rows) {
      const nmNorm = normalizeAccountName(r.account_nm)
      const idNorm = normalizeAccountId(r.account_id)
      const cls = classifyToCanon(r.sj_div, r.account_id, r.account_nm)

      const payload: Partial<Row> = {
        account_nm_norm: nmNorm,
        account_id_norm: idNorm,
        canon_key: cls?.key ?? null,
        canon_score: cls?.score ?? null,
      }

      const { error: upErr } = await supabaseAdmin
        .from('dart_fnltt')
        .update(payload)
        .eq('id', r.id)

      if (upErr) throw upErr
      updated += 1
    }

    return NextResponse.json({ ok: true, updated })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
