// src/app/api/telegram/webhook-setup/route.ts
// 운영 웹훅을 secret_token 과 함께 (재)등록하고 봇 명령어 메뉴를 설정한다. (관리자 전용: middleware 에서 제한)
// 순서: Vercel Production 에 TELEGRAM_WEBHOOK_SECRET 추가 → 재배포 → 운영 주소에서 이 API 를 한 번 호출
import { NextResponse } from 'next/server'
import { BOT_COMMANDS, callTelegram } from '@/lib/telegram/bot'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // 미리보기 배포에서 호출하면 운영 봇의 웹훅이 미리보기로 바뀌므로 운영에서만 허용
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: false, error: 'production only' }, { status: 403 })
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN missing' }, { status: 500 })
  }
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET missing' }, { status: 500 })
  }

  const before = await callTelegram('getWebhookInfo', {})
  const currentUrl: string | undefined = before?.result?.url
  // 지금 등록된 웹훅 주소를 그대로 유지 (없으면 이 요청의 도메인 기준)
  const url = currentUrl || `${new URL(request.url).origin}/api/telegram/webhook`

  const setWebhook = await callTelegram('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  })
  const setCommands = await callTelegram('setMyCommands', { commands: BOT_COMMANDS })
  const after = await callTelegram('getWebhookInfo', {})

  return NextResponse.json({
    ok: Boolean(setWebhook?.ok && setCommands?.ok),
    webhook_url: url,
    set_webhook: setWebhook,
    set_commands: setCommands,
    webhook_info: {
      url: after?.result?.url ?? null,
      pending_update_count: after?.result?.pending_update_count ?? null,
      last_error_message: after?.result?.last_error_message ?? null,
    },
  })
}
