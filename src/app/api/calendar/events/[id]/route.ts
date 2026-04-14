// src/app/api/calendar/events/[id]/route.ts
import { NextResponse } from 'next/server'
import { google, calendar_v3 } from 'googleapis'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type UpdateEventBody = {
  title?: string
  description?: string
  location?: string
  allDay?: boolean
  start?: string
  end?: string
}

type GoogleErr = { error?: { message?: string } } | { error_description?: string } | { error?: string }

// YYYY-MM-DD → ±일 이동
function ymdShift(ymd: string, delta: number) {
  const [y, m, d] = ymd.split('-').map(n => parseInt(n, 10))
  const dt = new Date(y, (m || 1) - 1, (d || 1) + delta)
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

async function getAuthedCalendar(): Promise<calendar_v3.Calendar> {
  const { data, error } = await supabaseAdmin
    .from('google_oauth_tokens')
    .select('*')
    .eq('label', 'shared')
    .single()

  if (error || !data) throw new Error('Google not connected')

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({
    access_token: data.access_token || undefined,
    refresh_token: data.refresh_token || undefined,
    scope: data.scope || undefined,
    token_type: data.token_type || undefined,
    expiry_date: data.expiry_date || undefined,
  })
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

function extractEventIdFromUrl(req: Request): string {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const eventIdEncoded = parts[parts.length - 1]
  const eventId = decodeURIComponent(eventIdEncoded || '')
  if (!eventId) throw new Error('invalid_event_id')
  return eventId
}

export async function PATCH(req: Request) {
  try {
    const cal = await getAuthedCalendar()
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'
    const eventId = extractEventIdFromUrl(req)

    const body = (await req.json()) as UpdateEventBody
    const patch: calendar_v3.Schema$Event = {}

    if (typeof body.title === 'string') patch.summary = body.title
    if (typeof body.description === 'string') patch.description = body.description
    if (typeof body.location === 'string') patch.location = body.location

    const allDay = !!body.allDay
    const hasStart = typeof body.start === 'string'
    const hasEnd = typeof body.end === 'string'

    if (hasStart || hasEnd) {
      const startRaw = body.start
      const endRaw = body.end
      const isDateOnly = allDay || ((startRaw?.length === 10) && (!endRaw || endRaw.length === 10))

      if (isDateOnly) {
        // ✅ 폼은 포함형 → Google은 배타형(+1일)
        if (hasStart && startRaw) patch.start = { date: startRaw }
        if (hasEnd && endRaw) patch.end = { date: ymdShift(endRaw, +1) }
      } else {
        if (hasStart && startRaw) patch.start = { dateTime: startRaw, timeZone: 'Asia/Seoul' }
        if (hasEnd && endRaw) patch.end = { dateTime: endRaw, timeZone: 'Asia/Seoul' }
      }
    }

    const updated = await cal.events.patch({ calendarId, eventId, requestBody: patch })
    return NextResponse.json({ event: updated.data })
  } catch (e) {
    const respData = (e as { response?: { data?: GoogleErr } }).response?.data
    const message =
      (respData as { error?: { message?: string } })?.error?.message ||
      (respData as { error_description?: string })?.error_description ||
      (respData as { error?: string })?.error ||
      (e as Error).message ||
      'failed_to_update_event'

    console.error('[calendar/events PATCH] error:', respData || e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const cal = await getAuthedCalendar()
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'
    const eventId = extractEventIdFromUrl(req)

    await cal.events.delete({ calendarId, eventId })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const respData = (e as { response?: { data?: unknown } }).response?.data
    const message =
      (respData as { error?: { message?: string } })?.error?.message ||
      (respData as { error_description?: string })?.error_description ||
      (respData as { error?: string })?.error ||
      (e as Error).message ||
      'failed_to_delete_event'

    console.error('[calendar/events DELETE] error:', respData || e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
