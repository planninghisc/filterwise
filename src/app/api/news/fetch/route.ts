// src/app/api/news/fetch/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { requireCronOrSession } from '@/lib/requireCronOrSession'
import { collectBaseNews, sendKeywordAlerts } from '@/lib/news/collect'

export async function GET(req: Request) {
  try {
    const denied = await requireCronOrSession(req)
    if (denied) return denied

    // 수동 수집으로 먼저 저장된 기사도 알림이 누락되지 않도록 같은 알림 처리를 거친다
    const { saved, logs } = await collectBaseNews()
    const telegram = await sendKeywordAlerts(saved)

    return NextResponse.json({ ok: true, via: 'manual', logs, telegram })
  } catch (err: any) {
    console.error('[news fetch manual]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
