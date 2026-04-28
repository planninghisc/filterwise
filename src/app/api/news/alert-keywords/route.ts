import { NextResponse } from 'next/server'
import { requireCronOrSession, getSessionUser } from '@/lib/requireCronOrSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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

  const body = (await request.json().catch(() => ({}))) as {
    keyword?: string
    alert_filter?: string | null
  }

  const keyword = String(body.keyword ?? '').trim()
  const alert_filter = String(body.alert_filter ?? '').trim() || null
  if (!keyword) return badRequest('keyword is required')

  const { data, error } = await supabaseAdmin
    .from('alert_keywords')
    .insert({ keyword, alert_filter, created_by: user.id })
    .select('id, keyword, alert_filter, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function PATCH(request: Request) {
  const denied = await requireCronOrSession(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as {
    id?: string
    keyword?: string
    alert_filter?: string | null
  }
  const id = String(body.id ?? '').trim()
  const keyword = String(body.keyword ?? '').trim()
  const alert_filter = String(body.alert_filter ?? '').trim() || null

  if (!id) return badRequest('id is required')
  if (!keyword) return badRequest('keyword is required')

  const { data, error } = await supabaseAdmin
    .from('alert_keywords')
    .update({ keyword, alert_filter })
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
