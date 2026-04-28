import { NextResponse } from 'next/server'
import { requireCronOrSession } from '@/lib/requireCronOrSession'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const denied = await requireCronOrSession(request)
    if (denied) return denied

    const body = (await request.json().catch(() => ({}))) as {
      chat_id?: string
      message?: string
    }
    const chatId = String(body.chat_id ?? '').trim()
    const message = String(body.message ?? '').trim()

    if (!chatId || !message) {
      return NextResponse.json({ ok: false, error: 'chat_id and message are required' }, { status: 400 })
    }

    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN missing' }, { status: 500 })
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.ok) {
      return NextResponse.json(
        { ok: false, error: json?.description ?? `HTTP ${res.status}` },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
