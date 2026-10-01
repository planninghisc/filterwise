// src/app/api/news/fetch-a93fks1x9p/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { collectBaseNews, sendKeywordAlerts } from '@/lib/news/collect'

export async function GET() {
  try {
    const { saved, logs } = await collectBaseNews()
    const telegram = await sendKeywordAlerts(saved)

    return NextResponse.json({ ok: true, via: 'cron', logs, telegram })
  } catch (err: any) {
    console.error('[news fetch cron]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
