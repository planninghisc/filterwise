import { NextResponse } from 'next/server'
import { getSessionUser, requireCronOrSession } from '@/lib/requireCronOrSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ALLOWED_EMAILS = new Set(['test@hanwha.com', 'admin@hanwha.com'])
const DEFAULT_ID = 'default'

function normalizeMessage(input: unknown) {
  return String(input ?? '').trim()
}

async function assertAllowedUser(request: Request) {
  const denied = await requireCronOrSession(request)
  if (denied) return denied
  const user = await getSessionUser()
  const email = String(user?.email ?? '').trim().toLowerCase()
  if (!email || !ALLOWED_EMAILS.has(email)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await assertAllowedUser(request)
  if (denied) return denied

  const { data, error } = await supabaseAdmin
    .from('telegram_bot_settings')
    .select('start_message_template, updated_at')
    .eq('id', DEFAULT_ID)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data ?? null })
}

export async function PATCH(request: Request) {
  const denied = await assertAllowedUser(request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as { start_message_template?: string }
  const startMessage = normalizeMessage(body.start_message_template)
  if (!startMessage) {
    return NextResponse.json({ ok: false, error: 'start_message_template is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('telegram_bot_settings')
    .upsert(
      {
        id: DEFAULT_ID,
        start_message_template: startMessage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('start_message_template, updated_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}
