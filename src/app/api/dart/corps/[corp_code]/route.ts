import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const TIERS = new Set(['large', 'mid'])

type PatchBody = { corp_name?: unknown; tier?: unknown; is_peer?: unknown }

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ corp_code: string }> }) {
  try {
    const { corp_code: raw } = await ctx.params
    const corp_code = decodeURIComponent(raw ?? '').trim()
    if (!corp_code) {
      return NextResponse.json({ ok: false, error: 'corp_code가 필요합니다.' }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody

    const { data: cur, error: fetchErr } = await supabaseAdmin
      .from('dart_corp')
      .select('corp_code, corp_name, tier, is_peer')
      .eq('corp_code', corp_code)
      .maybeSingle()

    if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 })
    if (!cur) return NextResponse.json({ ok: false, error: '해당 회사를 찾을 수 없습니다.' }, { status: 404 })

    let nextName = String(cur.corp_name ?? '')
    let nextTier = String(cur.tier ?? 'mid') as 'large' | 'mid'
    let nextPeer = Boolean(cur.is_peer)

    if (typeof body.corp_name === 'string') {
      const n = body.corp_name.trim()
      if (!n) return NextResponse.json({ ok: false, error: 'corp_name이 비었습니다.' }, { status: 400 })
      nextName = n
    }
    if (body.tier !== undefined) {
      const t = String(body.tier).trim()
      if (!TIERS.has(t)) {
        return NextResponse.json({ ok: false, error: 'tier는 large 또는 mid여야 합니다.' }, { status: 400 })
      }
      nextTier = t as 'large' | 'mid'
      if (nextTier === 'large') nextPeer = false
    }
    if (body.is_peer !== undefined) {
      if (nextTier === 'large') nextPeer = false
      else nextPeer = Boolean(body.is_peer)
    }

    if (
      typeof body.corp_name === 'undefined' &&
      body.tier === undefined &&
      body.is_peer === undefined
    ) {
      return NextResponse.json({ ok: false, error: '변경할 필드가 없습니다.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('dart_corp')
      .update({ corp_name: nextName, tier: nextTier, is_peer: nextPeer })
      .eq('corp_code', corp_code)
      .select('corp_code, corp_name, tier, is_peer')
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ ok: false, error: '해당 회사를 찾을 수 없습니다.' }, { status: 404 })

    return NextResponse.json({ ok: true, row: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ corp_code: string }> }) {
  try {
    const { corp_code: raw } = await ctx.params
    const corp_code = decodeURIComponent(raw ?? '').trim()
    if (!corp_code) {
      return NextResponse.json({ ok: false, error: 'corp_code가 필요합니다.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.from('dart_corp').delete().eq('corp_code', corp_code).select('corp_code')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ ok: false, error: '해당 회사를 찾을 수 없습니다.' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
