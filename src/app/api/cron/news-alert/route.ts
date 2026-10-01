// src/app/api/cron/news-alert/route.ts
// cron-job.org 에서 5분마다 호출: 기본 키워드 수집 → +@ 키워드 알림
//
// 테스트용 쿼리 (운영 DB/구독자에 영향 없음):
//   ?dry=1                     수집·매칭만 하고 DB 저장·발송 안 함
//   ?test_chat_id=<id>         DB 저장 안 함, 알림은 이 chat_id 에만 발송
//   ?recheck_hours=<n>         새 수집 대신 최근 n시간 저장된 기사로 알림 매칭 (dry 또는 test_chat_id 와 함께)
// 테스트 모드는 크론 시크릿 대신 뉴스 관리자 로그인 세션으로도 호출 가능 (브라우저 주소창에서 확인용)
import { NextResponse } from 'next/server'
import { getSessionUser, isValidCronSecret } from '@/lib/requireCronOrSession'
import { isNewsAdminEmail } from '@/lib/newsAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { collectBaseNews, sendKeywordAlerts } from '@/lib/news/collect'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const testChatId = (searchParams.get('test_chat_id') ?? '').trim() || undefined
    const dryRun = searchParams.get('dry') === '1' || !!testChatId
    const recheckHours = Number(searchParams.get('recheck_hours') ?? '')

    const authorized =
      isValidCronSecret(request) || (dryRun && isNewsAdminEmail((await getSessionUser())?.email))
    if (!authorized) {
      return NextResponse.json(
        { error: 'Unauthorized', hint: 'Authorization: Bearer <CRON_SECRET_KEY> or X-Cron-Secret' },
        { status: 401 },
      )
    }

    if (recheckHours > 0) {
      if (!dryRun) {
        return NextResponse.json({ error: 'recheck_hours requires dry=1 or test_chat_id' }, { status: 400 })
      }
      const since = new Date(Date.now() - Math.min(recheckHours, 24 * 7) * 3600 * 1000).toISOString()
      const { data, error } = await supabaseAdmin
        .from('news_articles')
        .select('title, content, source_url')
        .gte('published_at', since)
        .order('published_at', { ascending: false })
      if (error) throw error
      const telegram = await sendKeywordAlerts(data ?? [], { dryRun: !testChatId, onlyChatId: testChatId })
      return NextResponse.json({ success: true, mode: 'recheck', dry_run: true, checked: data?.length ?? 0, telegram })
    }

    const { saved, logs } = await collectBaseNews({ dryRun })
    const telegram = await sendKeywordAlerts(saved, { dryRun: dryRun && !testChatId, onlyChatId: testChatId })

    return NextResponse.json({ success: true, dry_run: dryRun, logs, telegram })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
