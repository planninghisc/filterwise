// src/app/api/calendar/events/route.ts
import { NextResponse } from 'next/server'
import { google, calendar_v3 } from 'googleapis'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ListRange = { timeMin?: string; timeMax?: string }

type CreateEventBody = {
  title: string
  description?: string
  location?: string
  start: string
  end?: string
  allDay?: boolean
}

type GoogleErrData = {
  error?: { message?: string } | string
  error_description?: string
}

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

// GET: 기간 내 이벤트 목록
export async function GET(req: Request) {
  try {
    const cal = await getAuthedCalendar()
    const { searchParams } = new URL(req.url)
    const timeMin = searchParams.get('timeMin') || new Date(new Date().setDate(1)).toISOString()
    const timeMax = searchParams.get('timeMax') || new Date(new Date().setMonth(new Date().getMonth() + 2)).toISOString()
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'

    const resp = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: 2500,
    })

    return NextResponse.json({ events: resp.data.items || [], calendarId })
  } catch (e: unknown) {
    const data = (e as { response?: { data?: GoogleErrData } })?.response?.data
    const msg =
      (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
      data?.error_description ||
      (e as Error).message ||
      'failed_to_fetch_events'

    console.error('[calendar/events GET] error:', data || e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST: 이벤트 생성
export async function POST(req: Request) {
  try {
    const cal = await getAuthedCalendar()
    const body = (await req.json()) as CreateEventBody

    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'
    const title = body.title?.trim() || ''
    const allDay = !!body.allDay
    const startRaw: string = body.start
    let endRaw: string | undefined = body.end

    if (!title || !startRaw) throw new Error('title/start is required')

    let startObj: calendar_v3.Schema$EventDateTime
    let endObj: calendar_v3.Schema$EventDateTime

    const isDateOnly = allDay || (startRaw.length === 10 && (!endRaw || endRaw.length === 10))

    if (isDateOnly) {
      // ✅ 폼은 '포함형'으로 옴 → Google은 배타형 필요하므로 항상 +1일해서 저장
      const startYmd = startRaw
      const endInclusive = endRaw || startYmd
      const endExclusive = ymdShift(endInclusive, +1)

      startObj = { date: startYmd }
      endObj = { date: endExclusive }
    } else {
      if (!endRaw) {
        const s = new Date(startRaw)
        const e = new Date(s.getTime() + 60 * 60 * 1000)
        endRaw = e.toISOString()
      }
      startObj = { dateTime: startRaw, timeZone: 'Asia/Seoul' }
      endObj = { dateTime: endRaw, timeZone: 'Asia/Seoul' }
    }

    const inserted = await cal.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description: body.description || '',
        location: body.location || '',
        start: startObj,
        end: endObj,
      },
    })

    return NextResponse.json({ event: inserted.data })
  } catch (e: unknown) {
    const data = (e as { response?: { data?: GoogleErrData } })?.response?.data
    const msg =
      (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
      data?.error_description ||
      (e as Error).message ||
      'failed_to_create_event'

    console.error('[calendar/events POST] error:', data || e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
