// src/app/api/cron/news-alert/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver'
import crypto from 'crypto'
import { isValidCronSecret } from '@/lib/requireCronOrSession'

export const maxDuration = 60 
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateTitleHash(title: string) {
  return crypto.createHash('md5').update(title).digest('hex');
}

function htmlEscape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function matchesAlertFilter(article: { title?: string | null; content?: string | null }, filter: string | null): boolean {
  const raw = (filter ?? '').trim()
  if (!raw) return true
  const hay = `${article.title ?? ''}\n${article.content ?? ''}`.toLowerCase()
  if (raw.includes('|')) {
    const anyTerms = raw
      .split('|')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    if (anyTerms.length === 0) return true
    return anyTerms.some((t) => hay.includes(t))
  }
  const allTerms = raw
    .split(/\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (allTerms.length === 0) return true
  return allTerms.every((t) => hay.includes(t))
}

export async function GET(request: Request) {
  try {
    if (!isValidCronSecret(request)) {
      return NextResponse.json(
        { error: 'Unauthorized', hint: 'Authorization: Bearer <CRON_SECRET_KEY> or X-Cron-Secret' },
        { status: 401 },
      )
    }

    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return NextResponse.json({ success: false, error: 'TELEGRAM_BOT_TOKEN missing' }, { status: 500 })
    }

    const { data: keywordRows, error: keywordErr } = await supabase
      .from('alert_keywords')
      .select('keyword, alert_filter')
      .order('created_at', { ascending: false })
    if (keywordErr) throw keywordErr

    const keywords = (keywordRows ?? [])
      .map((r) => ({
        keyword: String((r as { keyword?: string }).keyword ?? '').trim(),
        alert_filter: ((r as { alert_filter?: string | null }).alert_filter ?? null) as string | null,
      }))
      .filter((r) => r.keyword.length > 0)

    if (keywords.length === 0) {
      return NextResponse.json({ success: true, logs: [], sent: 0, note: 'alert_keywords empty' })
    }

    const debugLogs: any[] = []
    const newlySavedAll: Array<{ title: string; content: string | null; source_url: string; keyword: string; alert_filter: string | null }> = []

    for (const kw of keywords) {
      // 1. 뉴스 수집 (인코딩 해결된 버전)
      const articles = await fetchNaverNews(kw.keyword)
      
      const articlesToSave: any[] = [] 

      for (const article of articles) {
        // 이미 저장된 건지 확인 (URL 또는 해시)
        const titleHash = generateTitleHash(article.title);
        
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .or(`source_url.eq.${article.link},title_hash.eq.${titleHash}`)
          .maybeSingle()

        if (!existing) {
          const row = {
            title: article.title,
            // [중요] 긁어온 본문(fullContent)을 저장, 없으면 description 사용
            content: article.fullContent || article.description,
            publisher: 'Naver Search',
            source_url: article.link,
            published_at: new Date(article.pubDate).toISOString(),
            title_hash: titleHash
          }
          articlesToSave.push(row)
          if (matchesAlertFilter({ title: row.title, content: row.content }, kw.alert_filter)) {
            newlySavedAll.push({
              title: row.title,
              content: row.content,
              source_url: row.source_url,
              keyword: kw.keyword,
              alert_filter: kw.alert_filter,
            })
          }
        }
      }

      // DB 저장
      if (articlesToSave.length > 0) {
        const { error } = await supabase.from('news_articles').insert(articlesToSave)
        if(error) console.error('Insert Error:', error)
      }

      debugLogs.push({ keyword: kw.keyword, alert_filter: kw.alert_filter, fetched: articles.length, new_saved: articlesToSave.length })
    }

    const uniqueByUrl = new Map<string, (typeof newlySavedAll)[number]>()
    for (const a of newlySavedAll) {
      if (!uniqueByUrl.has(a.source_url)) uniqueByUrl.set(a.source_url, a)
    }
    const toNotify = Array.from(uniqueByUrl.values()).slice(0, 20)

    let sent = 0
    let targets = 0
    const failed: Array<{ chat_id: string; reason: string }> = []
    if (toNotify.length > 0) {
      const { data: subs, error: subsErr } = await supabase
        .from('telegram_subscribers')
        .select('chat_id')
        .eq('is_active', true)
      if (subsErr) throw subsErr

      const chatIds = (subs ?? []).map((s) => String((s as { chat_id: string }).chat_id))
      targets = chatIds.length

      if (chatIds.length > 0) {
        const lines = toNotify.map((a) => {
          const marker = a.alert_filter ? ` [조건:${htmlEscape(a.alert_filter)}]` : ''
          return `• <a href="${a.source_url}">${htmlEscape(a.title)}</a>${marker}`
        })
        const msg =
          `🚨 <b>키워드 뉴스 알림</b>\n\n` +
          `${lines.join('\n')}\n\n` +
          `기준 키워드 건수: ${toNotify.length}건`

        const results = await Promise.all(
          chatIds.map(async (chatId) => {
            try {
              const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: msg,
                  parse_mode: 'HTML',
                  disable_web_page_preview: true,
                }),
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
          if (r.ok) sent += 1
          else failed.push({ chat_id: r.chatId, reason: r.reason })
        }
      }
    }

    return NextResponse.json({
      success: true,
      logs: debugLogs,
      telegram: {
        matched_new_articles: toNotify.length,
        total_targets: targets,
        sent,
        failed: failed.length,
        failed_details: failed,
      },
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}