import { NextResponse } from 'next/server'
import { requireCronOrSession, getSessionUser } from '@/lib/requireCronOrSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// alert_keywords.keyword = 알림 키워드(조건). 수집은 BASE_KEYWORDS 고정(src/lib/news/collect.ts).
// alert_filter 는 예전 형식(수집 검색어 + 조건) 행 호환용이며 새로 쓰지 않는다.
// 접근 권한: middleware 에서 뉴스 관리자 계정만 허용.

export const dynamic = 'force-dynamic'

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

export async function GET(request: Request) {
  const denied = await requireCronOrSession(request)
  if (denied) return denied

  const { data, error } = await supabaseAdmin
    .from('alert_keywords')
    .select('id, keyword, alert_filter, created_at, created_by')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, list: data ?? [] })
}

export async function POST(request: Request) {
  const denied = await requireCronOrSession(request)
  if (denied) return denied

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { keyword?: string }

  const keyword = String(body.keyword ?? '').trim()
  if (!keyword) return badRequest('keyword is required')

  const { data, error } = await supabaseAdmin
    .from('alert_keywords')
    .insert({ keyword, alert_filter: null, created_by: user.id })
    .select('id, keyword, alert_filter, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function PATCH(request: Request) {
  const denied = await requireCronOrSession(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as { id?: string; keyword?: string }
  const id = String(body.id ?? '').trim()
  const keyword = String(body.keyword ?? '').trim()

  if (!id) return badRequest('id is required')
  if (!keyword) return badRequest('keyword is required')

  const { data, error } = await supabaseAdmin
    .from('alert_keywords')
    .update({ keyword, alert_filter: null })
    .eq('id', id)
    .select('id, keyword, alert_filter, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(request: Request) {
  const denied = await requireCronOrSession(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const id = (searchParams.get('id') ?? '').trim()
  if (!id) return badRequest('id is required')

  const { error } = await supabaseAdmin.from('alert_keywords').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
