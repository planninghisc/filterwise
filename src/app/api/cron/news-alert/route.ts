// src/app/api/cron/news-alert/route.ts
// cron-job.org 에서 5분마다 호출: 기본 키워드 수집 → +@ 키워드 알림
//
// 테스트용 쿼리 (운영 DB/구독자에 영향 없음):
//   ?dry=1                     수집·매칭만 하고 DB 저장·발송 안 함
//   ?test_chat_id=<id>         DB 저장 안 함, 알림은 이 chat_id 에만 발송
//   ?recheck_hours=<n>         새 수집 대신 최근 n시간 저장된 기사로 알림 매칭 (dry 또는 test_chat_id 와 함께)
//   ?night_digest=1            지난밤(22~07시) 수집 기사로 아침 정리 메시지 확인 (dry 또는 test_chat_id 와 함께)
// 테스트 모드는 크론 시크릿 대신 뉴스 관리자 로그인 세션으로도 호출 가능 (브라우저 주소창에서 확인용)
import { NextResponse } from 'next/server'
import { getSessionUser, isValidCronSecret } from '@/lib/requireCronOrSession'
import { isNewsAdminEmail } from '@/lib/newsAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { collectBaseNews, isNightDigestTime, lastNightWindow, sendKeywordAlerts } from '@/lib/news/collect'

/** 지난밤(어제 22시 ~ 오늘 7시 KST)에 수집된 기사 */
async function loadNightArticles() {
  const { from, to } = lastNightWindow()
  const { data, error } = await supabaseAdmin
    .from('news_articles')
    .select('title, content, source_url')
    .gte('fetched_at', from)
    .lt('fetched_at', to)
    .order('fetched_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

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

    if (searchParams.get('night_digest') === '1') {
      if (!dryRun) {
        return NextResponse.json({ error: 'night_digest requires dry=1 or test_chat_id' }, { status: 400 })
      }
      const articles = await loadNightArticles()
      const telegram = await sendKeywordAlerts(articles, { dryRun: !testChatId, onlyChatId: testChatId, nightDigest: true })
      return NextResponse.json({ success: true, mode: 'night_digest', window: lastNightWindow(), checked: articles.length, telegram })
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

    // 아침 7시: 야간 알림 모아 받기를 켠 사람에게 밤사이 기사 정리 발송
    let nightDigest: Awaited<ReturnType<typeof sendKeywordAlerts>> | null = null
    if (!dryRun && isNightDigestTime()) {
      nightDigest = await sendKeywordAlerts(await loadNightArticles(), { nightDigest: true })
    }

    return NextResponse.json({ success: true, dry_run: dryRun, logs, telegram, night_digest: nightDigest })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
