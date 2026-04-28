import { NextResponse } from 'next/server'
import { requireCronOrSession } from '@/lib/requireCronOrSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const denied = await requireCronOrSession(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unread') === '1'
    const limitRaw = Number(searchParams.get('limit') ?? 100)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100

    let query = supabaseAdmin
      .from('telegram_inbox')
      .select('id, chat_id, first_name, username, text, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) query = query.eq('is_read', false)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ ok: true, list: data ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireCronOrSession(request)
    if (denied) return denied

    const body = (await request.json().catch(() => ({}))) as {
      id?: string
      ids?: string[]
      is_read?: boolean
    }

    const isRead = Boolean(body.is_read ?? true)
    const ids = [
      ...(Array.isArray(body.ids) ? body.ids : []),
      ...(body.id ? [body.id] : []),
    ].map((v) => String(v).trim()).filter(Boolean)

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'id or ids is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('telegram_inbox')
      .update({ is_read: isRead })
      .in('id', ids)
    if (error) throw error

    return NextResponse.json({ ok: true, updated: ids.length, is_read: isRead })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
