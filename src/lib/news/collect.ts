// src/lib/news/collect.ts
// 뉴스봇 수집/알림 공용 로직
// - 수집: BASE_KEYWORDS 로 네이버 검색한 한화투자증권 기사를 전부 news_articles 에 저장
// - 알림: 새로 저장된 기사 중 alert_keywords(+@ 키워드) 조건에 걸린 기사만 텔레그램 발송
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchNaverNews } from '@/lib/news/ingestNaver'
import { BASE_KEYWORDS, alertConditionOf } from '@/lib/news/keywords'
import { decodeEntities, isSameStory, titleBigrams } from '@/lib/news/similarity'
import { MAIN_MENU } from '@/lib/telegram/bot'

export { BASE_KEYWORDS }

/** 같은 이야기(비슷한 제목)의 기사를 이 기간 동안 같은 대화방에 다시 보내지 않는다 */
const SAME_STORY_SUPPRESS_MS = 24 * 3600 * 1000
/** 보낸 기사 기록 보관 기간 (지난 기록은 정리) */
const DELIVERY_RETENTION_MS = 3 * 24 * 3600 * 1000

// --- 야간 알림 모아 받기 (telegram_subscribers.night_mode) ---
// 켠 사람은 23시~06시(KST)에 키워드 알림을 받지 않고, 06시에 밤사이 기사를 한 번에 받는다.
const KST_OFFSET_MS = 9 * 3600 * 1000
const NIGHT_START_HOUR = 23
const NIGHT_END_HOUR = 6
/** 06:00 이후 이 시간 안의 크론 실행에서 아침 정리를 보낸다 (중복 실행은 alert_deliveries 로 걸러짐) */
const DIGEST_SEND_MINUTES = 15

function kstClock(now: Date) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  return { hour: kst.getUTCHours(), minute: kst.getUTCMinutes(), kst }
}

export function isNightHours(now = new Date()) {
  const { hour } = kstClock(now)
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR
}

export function isNightDigestTime(now = new Date()) {
  const { hour, minute } = kstClock(now)
  return hour === NIGHT_END_HOUR && minute < DIGEST_SEND_MINUTES
}

/** 가장 최근에 끝난 야간 구간 (어제 23:00 ~ 오늘 06:00 KST) */
export function lastNightWindow(now = new Date()) {
  const { kst } = kstClock(now)
  const nightEnd = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), NIGHT_END_HOUR) - KST_OFFSET_MS
  const end = now.getTime() >= nightEnd ? nightEnd : nightEnd - 24 * 3600 * 1000
  const hours = 24 - NIGHT_START_HOUR + NIGHT_END_HOUR
  return { from: new Date(end - hours * 3600 * 1000).toISOString(), to: new Date(end).toISOString() }
}

/** 로컬 테스트 안전장치: NEWS_ALERT_DRY_RUN=1 이면 DB 저장·구독자 발송을 하지 않는다 (onlyChatId 발송만 허용) */
const FORCE_DRY_RUN = process.env.NEWS_ALERT_DRY_RUN === '1'

export type SavedArticle = {
  title: string
  content: string | null
  publisher: string
  source_url: string
  published_at: string
  title_hash: string
}

export function generateTitleHash(title: string) {
  return crypto.createHash('md5').update(title).digest('hex')
}

function htmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function normalizeForMatch(input: string): string {
  return input.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

/** 알림 조건 문법: `,` 또는 `|` = OR, 공백 = AND */
export function matchesAlertFilter(article: { title?: string | null; content?: string | null }, filter: string | null): boolean {
  const raw = (filter ?? '').trim()
  if (!raw) return true
  const hayRaw = `${article.title ?? ''}\n${article.content ?? ''}`.toLowerCase()
  const hayNorm = normalizeForMatch(hayRaw)
  const hasTerm = (term: string) => {
    const t = term.trim().toLowerCase()
    if (!t) return false
    if (hayRaw.includes(t)) return true
    const tNorm = normalizeForMatch(t)
    return tNorm.length > 0 && hayNorm.includes(tNorm)
  }

  if (raw.includes('|')) {
    const anyTerms = raw.split('|').map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (anyTerms.length === 0) return true
    return anyTerms.some((t) => hasTerm(t))
  }
  // Comma-separated input is treated as OR for list-style keyword input.
  if (raw.includes(',') || raw.includes('，')) {
    const anyTerms = raw.split(/[，,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (anyTerms.length === 0) return true
    return anyTerms.some((t) => hasTerm(t))
  }
  // Whitespace-separated terms are treated as AND.
  const allTerms = raw.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (allTerms.length === 0) return true
  return allTerms.every((t) => hasTerm(t))
}

/**
 * 기본 키워드로 최신 기사를 검색해 새 기사만 저장하고, 저장된 기사를 반환
 * dryRun: DB에 저장하지 않고 "저장될 기사"만 반환 (테스트용)
 */
export async function collectBaseNews(opts: { dryRun?: boolean } = {}) {
  const saved: SavedArticle[] = []
  const logs: Array<{ keyword: string; fetched: number; new_saved: number }> = []
  const seen = new Set<string>()

  for (const keyword of BASE_KEYWORDS) {
    const articles = await fetchNaverNews(keyword)
    const articlesToSave: SavedArticle[] = []

    for (const article of articles) {
      const titleHash = generateTitleHash(article.title)
      if (seen.has(article.link) || seen.has(titleHash)) continue
      seen.add(article.link)
      seen.add(titleHash)

      const { data: existing } = await supabaseAdmin
        .from('news_articles')
        .select('id')
        .or(`source_url.eq.${article.link},title_hash.eq.${titleHash}`)
        .maybeSingle()

      if (!existing) {
        articlesToSave.push({
          title: article.title,
          content: article.fullContent || article.description,
          publisher: 'Naver Search',
          source_url: article.link,
          published_at: new Date(article.pubDate).toISOString(),
          title_hash: titleHash,
        })
      }
    }

    if (articlesToSave.length > 0 && (opts.dryRun || FORCE_DRY_RUN)) {
      saved.push(...articlesToSave)
    } else if (articlesToSave.length > 0) {
      const { error } = await supabaseAdmin.from('news_articles').insert(articlesToSave)
      if (error) console.error(`[news collect] insert failed (${keyword}):`, error)
      else saved.push(...articlesToSave)
    }

    logs.push({ keyword, fetched: articles.length, new_saved: articlesToSave.length })
  }

  return { saved, logs }
}

type AlertArticle = Pick<SavedArticle, 'title' | 'content' | 'source_url'>

/**
 * 새로 저장된 기사 중 알림 키워드에 걸린 기사를 발송
 * - 공용 키워드(alert_keywords): 활성 구독자 전원
 * - 개인 키워드(chat_alert_keywords): 그 대화방에만
 * 한 대화방에는 걸린 기사를 메시지 1통으로 묶어 보낸다 (같은 기사는 1번만).
 * 제목이 비슷한 "같은 이야기"는 한 줄로 묶고, 24시간 안에 이미 보낸 이야기는 다시 보내지 않는다.
 * 야간 알림 모아 받기를 켠 사람은 야간에는 빼고, nightDigest 호출(아침 6시)에서만 받는다.
 * dryRun: 발송하지 않고 매칭 결과만 반환 / onlyChatId: 이 chat_id 에만 발송 (테스트용)
 */
export async function sendKeywordAlerts(
  saved: AlertArticle[],
  opts: { dryRun?: boolean; onlyChatId?: string; nightDigest?: boolean } = {},
) {
  const result = {
    conditions: [] as string[],
    matched: [] as Array<{ title: string; source_url: string; condition: string }>,
    personal_matched: [] as Array<{ chat_id: string; title: string; condition: string }>,
    /** 최근 24시간 안에 같은 이야기를 이미 보내서 뺀 건수 (대화방별 합계) */
    suppressed: 0,
    /** 야간 알림 모아 받기를 켜서 이번 발송에서 빠진 대화방 수 */
    night_held: 0,
    matched_new_articles: 0,
    total_targets: 0,
    sent: 0,
    failed: 0,
    failed_details: [] as Array<{ chat_id: string; reason: string }>,
  }
  if (saved.length === 0) return result

  const { data: keywordRows, error: keywordErr } = await supabaseAdmin
    .from('alert_keywords')
    .select('keyword, alert_filter')
    .order('created_at', { ascending: false })
  if (keywordErr) throw keywordErr
  const conditions = Array.from(new Set((keywordRows ?? []).map(alertConditionOf).filter(Boolean)))
  result.conditions = conditions

  // 발송 대상 대화방
  let chatIds: string[]
  if (opts.onlyChatId) {
    chatIds = [opts.onlyChatId]
  } else {
    const { data: subs, error: subsErr } = await supabaseAdmin
      .from('telegram_subscribers')
      .select('chat_id, night_mode')
      .eq('is_active', true)
    if (subsErr) throw subsErr
    const rows = (subs ?? []) as Array<{ chat_id: string; night_mode: boolean | null }>
    if (opts.nightDigest) {
      chatIds = rows.filter((s) => s.night_mode).map((s) => String(s.chat_id))
    } else if (isNightHours()) {
      result.night_held = rows.filter((s) => s.night_mode).length
      chatIds = rows.filter((s) => !s.night_mode).map((s) => String(s.chat_id))
    } else {
      chatIds = rows.map((s) => String(s.chat_id))
    }
  }

  // 대화방별 개인 키워드
  const personalByChat = new Map<string, string[]>()
  if (chatIds.length > 0) {
    const { data: personalRows, error: personalErr } = await supabaseAdmin
      .from('chat_alert_keywords')
      .select('chat_id, keyword')
      .in('chat_id', chatIds)
    if (personalErr) throw personalErr
    for (const row of personalRows ?? []) {
      const r = row as { chat_id: string; keyword: string }
      const list = personalByChat.get(String(r.chat_id)) ?? []
      list.push(r.keyword)
      personalByChat.set(String(r.chat_id), list)
    }
  }

  // 공용 매칭 (모든 대화방 공통)
  const commonMatches: Array<{ article: AlertArticle; label: string }> = []
  for (const article of saved) {
    const condition = conditions.find((c) => matchesAlertFilter(article, c))
    if (condition) {
      commonMatches.push({ article, label: `공용: ${condition}` })
      result.matched.push({ title: article.title, source_url: article.source_url, condition })
    }
  }
  const commonUrls = new Set(commonMatches.map((m) => m.article.source_url))

  // 대화방별 최근 24시간 동안 보낸 기사 제목 (같은 이야기 재발송 방지)
  const recentByChat = new Map<string, Set<string>[]>()
  if (chatIds.length > 0) {
    const since = new Date(Date.now() - SAME_STORY_SUPPRESS_MS).toISOString()
    const { data: sentRows, error: sentErr } = await supabaseAdmin
      .from('alert_deliveries')
      .select('chat_id, title')
      .in('chat_id', chatIds)
      .gte('sent_at', since)
    if (sentErr) throw sentErr
    for (const row of sentRows ?? []) {
      const r = row as { chat_id: string; title: string }
      const list = recentByChat.get(String(r.chat_id)) ?? []
      list.push(titleBigrams(r.title))
      recentByChat.set(String(r.chat_id), list)
    }
  }

  // 대화방별 메시지 구성: 매칭 기사 → 최근에 보낸 이야기 제외 → 같은 이야기끼리 한 줄로 묶기
  type StoryGroup = { article: AlertArticle; label: string; bigrams: Set<string>; titles: string[] }
  const messages: Array<{ chatId: string; groups: StoryGroup[] }> = []
  for (const chatId of chatIds) {
    const items = [...commonMatches]
    for (const keyword of personalByChat.get(chatId) ?? []) {
      for (const article of saved) {
        if (commonUrls.has(article.source_url) || items.some((i) => i.article.source_url === article.source_url)) continue
        if (matchesAlertFilter(article, keyword)) {
          items.push({ article, label: `내 키워드: ${keyword}` })
          result.personal_matched.push({ chat_id: chatId, title: article.title, condition: keyword })
        }
      }
    }

    const recent = recentByChat.get(chatId) ?? []
    const groups: StoryGroup[] = []
    for (const item of items) {
      const bigrams = titleBigrams(item.article.title)
      if (recent.some((r) => isSameStory(r, bigrams))) {
        result.suppressed += 1
        continue
      }
      const same = groups.find((g) => isSameStory(g.bigrams, bigrams))
      if (same) same.titles.push(item.article.title)
      else groups.push({ ...item, bigrams, titles: [item.article.title] })
    }
    if (groups.length > 0) messages.push({ chatId, groups: groups.slice(0, 20) })
  }

  result.matched_new_articles = new Set(messages.flatMap((m) => m.groups.map((g) => g.article.source_url))).size
  result.total_targets = messages.length
  if (messages.length === 0 || opts.dryRun || (FORCE_DRY_RUN && !opts.onlyChatId)) return result

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')

  const results = await Promise.all(
    messages.map(async ({ chatId, groups }) => {
      const lines = groups.map(({ article, label, titles }) => {
        const more = titles.length > 1 ? ` (외 ${titles.length - 1}건)` : ''
        return `• <a href="${article.source_url}">${htmlEscape(decodeEntities(article.title))}</a>${more} [${htmlEscape(label)}]`
      })
      const header = opts.nightDigest ? `🌙 <b>밤사이 키워드 뉴스</b> (23시~6시)` : `🚨 <b>키워드 뉴스 알림</b>`
      const msg = `${header}\n\n` + `${lines.join('\n')}\n\n` + `기준 키워드 건수: ${groups.length}건`
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // reply_markup: 알림을 받을 때마다 하단 메뉴 버튼을 최신 상태로 맞춘다
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: MAIN_MENU }),
        })
        const j = await res.json()
        if (res.ok && j?.ok) return { ok: true as const, chatId }
        return { ok: false as const, chatId, reason: j?.description ?? `HTTP ${res.status}` }
      } catch (e: any) {
        return { ok: false as const, chatId, reason: e?.message ?? 'network error' }
      }
    }),
  )

  for (const r of results) {
    if (r.ok) result.sent += 1
    else result.failed_details.push({ chat_id: r.chatId, reason: r.reason })
  }
  result.failed = result.failed_details.length

  // 보낸 기사 제목 기록 (테스트 발송은 기록하지 않음) + 보관 기간 지난 기록 정리
  if (!opts.onlyChatId) {
    const sentChats = new Set(results.filter((r) => r.ok).map((r) => r.chatId))
    const rows = messages
      .filter((m) => sentChats.has(m.chatId))
      .flatMap((m) => m.groups.flatMap((g) => g.titles.map((title) => ({ chat_id: m.chatId, title }))))
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('alert_deliveries').insert(rows)
      if (error) console.error('[news alert] record deliveries failed:', error)
    }
    const cutoff = new Date(Date.now() - DELIVERY_RETENTION_MS).toISOString()
    const { error: cleanupErr } = await supabaseAdmin.from('alert_deliveries').delete().lt('sent_at', cutoff)
    if (cleanupErr) console.error('[news alert] cleanup deliveries failed:', cleanupErr)
  }
  return result
}
