import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const TIERS = new Set(['large', 'mid'])

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('dart_corp')
    .select('corp_code, corp_name, tier, is_peer')
    .order('corp_name')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, list: data ?? [] })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      corp_code?: unknown
      corp_name?: unknown
      tier?: unknown
      is_peer?: unknown
    }
    const corp_code = String(body.corp_code ?? '').trim()
    const corp_name = String(body.corp_name ?? '').trim()
    const tierRaw = String(body.tier ?? 'mid').trim()
    const wantsPeer = Boolean(body.is_peer)
    if (!corp_code || !corp_name) {
      return NextResponse.json({ ok: false, error: 'corp_code와 corp_name은 필수입니다.' }, { status: 400 })
    }
    if (!/^\d{8}$/.test(corp_code)) {
      return NextResponse.json({ ok: false, error: 'corp_code는 8자리 숫자(고유번호)여야 합니다.' }, { status: 400 })
    }
    if (!TIERS.has(tierRaw)) {
      return NextResponse.json({ ok: false, error: 'tier는 large 또는 mid여야 합니다.' }, { status: 400 })
    }
    const tier = tierRaw as 'large' | 'mid'
    const is_peer = tier === 'large' ? false : wantsPeer

    const { data, error } = await supabaseAdmin
      .from('dart_corp')
      .insert({ corp_code, corp_name, tier, is_peer })
      .select('corp_code, corp_name, tier, is_peer')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ ok: false, error: '이미 등록된 고유번호입니다.' }, { status: 409 })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, row: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
