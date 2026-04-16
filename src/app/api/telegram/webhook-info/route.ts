import { NextResponse } from 'next/server'
import { requireCronOrSession } from '@/lib/requireCronOrSession'

export async function GET(req: Request) {
  try {
    const denied = await requireCronOrSession(req)
    if (denied) return denied

    const token = process.env.TELEGRAM_BOT_TOKEN
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (!token) {
      return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN missing' }, { status: 500 })
    }

    const webhookUrl = siteUrl ? `${siteUrl.replace(/\/+$/, '')}/api/telegram/webhook` : null
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { cache: 'no-store' })
    const infoJson = (await infoRes.json()) as {
      ok?: boolean
      result?: {
        url?: string
        pending_update_count?: number
        last_error_date?: number
        last_error_message?: string
      }
      description?: string
    }

    return NextResponse.json({
      ok: Boolean(infoJson.ok),
      expected_webhook_url: webhookUrl,
      current_webhook_url: infoJson.result?.url ?? null,
      pending_update_count: infoJson.result?.pending_update_count ?? null,
      last_error_date: infoJson.result?.last_error_date ?? null,
      last_error_message: infoJson.result?.last_error_message ?? null,
      telegram_description: infoJson.description ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
