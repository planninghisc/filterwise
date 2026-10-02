// src/app/api/news/alert-keywords/suggested/route.ts
// 텔레그램 "➕ 키워드 추가" 버튼에 보여줄 추천 키워드 (관리자 전용: middleware 에서 제한)
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('suggested_alert_keywords')
    .select('id, keyword, created_at')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, list: data ?? [] })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { keyword?: string }
  const keyword = String(body.keyword ?? '').replace(/\s+/g, ' ').trim()
  if (!keyword) return NextResponse.json({ ok: false, error: 'keyword is required' }, { status: 400 })
  if (keyword.length > 30) return NextResponse.json({ ok: false, error: '30자 이내로 입력해 주세요.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('suggested_alert_keywords')
    .insert({ keyword })
    .select('id, keyword, created_at')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(request: Request) {
  const id = (new URL(request.url).searchParams.get('id') ?? '').trim()
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('suggested_alert_keywords').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
