// src/lib/news/collect.ts
// 뉴스봇 수집/알림 공용 로직
// - 수집: BASE_KEYWORDS 로 네이버 검색한 한화투자증권 기사를 전부 news_articles 에 저장
// - 알림: 새로 저장된 기사 중 alert_keywords(+@ 키워드) 조건에 걸린 기사만 텔레그램 발송
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchNaverNews } from '@/lib/news/ingestNaver'
import { BASE_KEYWORDS, alertConditionOf } from '@/lib/news/keywords'

export { BASE_KEYWORDS }

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

/**
 * 새로 저장된 기사 중 +@ 키워드에 걸린 기사를 활성 구독자에게 발송
 * dryRun: 발송하지 않고 매칭 결과만 반환 / onlyChatId: 구독자 대신 이 chat_id 에만 발송 (테스트용)
 */
export async function sendKeywordAlerts(
  saved: Pick<SavedArticle, 'title' | 'content' | 'source_url'>[],
  opts: { dryRun?: boolean; onlyChatId?: string } = {},
) {
  const result = {
    conditions: [] as string[],
    matched: [] as Array<{ title: string; source_url: string; condition: string }>,
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
  if (conditions.length === 0) return result

  const toNotify: Array<{ article: (typeof saved)[number]; condition: string }> = []
  for (const article of saved) {
    const condition = conditions.find((c) => matchesAlertFilter(article, c))
    if (condition) toNotify.push({ article, condition })
  }
  const limited = toNotify.slice(0, 20)
  result.matched_new_articles = limited.length
  result.matched = limited.map(({ article, condition }) => ({ title: article.title, source_url: article.source_url, condition }))
  if (limited.length === 0 || opts.dryRun || (FORCE_DRY_RUN && !opts.onlyChatId)) return result

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')

  let chatIds: string[]
  if (opts.onlyChatId) {
    chatIds = [opts.onlyChatId]
  } else {
    const { data: subs, error: subsErr } = await supabaseAdmin
      .from('telegram_subscribers')
      .select('chat_id')
      .eq('is_active', true)
    if (subsErr) throw subsErr
    chatIds = (subs ?? []).map((s) => String((s as { chat_id: string }).chat_id))
  }
  result.total_targets = chatIds.length
  if (chatIds.length === 0) return result

  const lines = limited.map(
    ({ article, condition }) =>
      `• <a href="${article.source_url}">${htmlEscape(article.title)}</a> [조건:${htmlEscape(condition)}]`,
  )
  const msg = `🚨 <b>키워드 뉴스 알림</b>\n\n` + `${lines.join('\n')}\n\n` + `기준 키워드 건수: ${limited.length}건`

  const results = await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML', disable_web_page_preview: true }),
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
  return result
}
