// src/app/api/news/alert-keywords/personal/route.ts
// 텔레그램 /add 로 등록된 대화방별 개인 키워드 현황 (관리자 전용: middleware 에서 제한)
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data: rows, error } = await supabaseAdmin
    .from('chat_alert_keywords')
    .select('id, chat_id, keyword, created_at')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const chatIds = Array.from(new Set((rows ?? []).map((r) => String(r.chat_id))))
  const subs = new Map<string, { first_name: string | null; username: string | null; is_active: boolean }>()
  if (chatIds.length > 0) {
    const { data: subRows, error: subErr } = await supabaseAdmin
      .from('telegram_subscribers')
      .select('chat_id, first_name, username, is_active')
      .in('chat_id', chatIds)
    if (subErr) return NextResponse.json({ ok: false, error: subErr.message }, { status: 500 })
    for (const s of subRows ?? []) subs.set(String(s.chat_id), s)
  }

  const list = (rows ?? []).map((r) => {
    const s = subs.get(String(r.chat_id))
    return {
      ...r,
      first_name: s?.first_name ?? null,
      username: s?.username ?? null,
      is_active: s?.is_active ?? false,
    }
  })
  return NextResponse.json({ ok: true, list })
}

export async function DELETE(request: Request) {
  const id = (new URL(request.url).searchParams.get('id') ?? '').trim()
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('chat_alert_keywords').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
