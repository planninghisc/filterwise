// src/app/api/dart/view/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { ReprtCode, FsDiv, SjDiv } from '@/lib/dart'

type Row = {
  corp_code: string
  bsns_year: number
  reprt_code: ReprtCode
  fs_div: FsDiv
  sj_div: SjDiv
  account_nm: string | null
  account_id: string | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
  ord?: number | null
  currency?: string | null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const fsDiv = (searchParams.get('fs_div') ?? 'OFS') as FsDiv
    const sjDiv = (searchParams.get('sj_div') ?? 'BS') as SjDiv
    const corpCode = (searchParams.get('corp_code') ?? '').trim()
    const accountNm = (searchParams.get('account_nm') ?? '').trim()
    const accountId = (searchParams.get('account_id') ?? '').trim() || null

    let q = supabaseAdmin
      .from('dart_fnltt')
      .select('*')
      .eq('bsns_year', year)
      .eq('reprt_code', reprt)
      .eq('fs_div', fsDiv)
      .eq('sj_div', sjDiv)

    if (corpCode) q = q.eq('corp_code', corpCode)
    if (accountId) q = q.eq('account_id', accountId)
    else if (accountNm) q = q.eq('account_nm', accountNm)

    const { data, error } = await q
    if (error) throw error

    const list: Row[] = (data ?? []) as Row[]
    return NextResponse.json({ ok: true, list })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
