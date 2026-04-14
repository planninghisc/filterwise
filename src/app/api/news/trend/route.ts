// src/app/api/news/trend/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Row = {
  id: string
  title: string
  content: string | null
  published_at: string | null
  fetched_at: string | null
}

function ymd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildRegexes(terms: string[]) {
  // 문서 단위 존재 여부만 판정하므로 'i'만 사용(대소문자 무시)
  return terms
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || '14')
    const termsParam = (searchParams.get('terms') || '').trim()
    const terms = termsParam ? termsParam.split(',') : ['한화투자증권']

    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await supabaseAdmin
      .from('news_articles')
      .select('id, title, content, published_at, fetched_at')
      .or(`published_at.gte.${since.toISOString()},published_at.is.null`)
      .order('published_at', { ascending: true })
      .limit(3000)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const byDay = new Map<string, Row[]>()
    for (const r of (data || []) as Row[]) {
      const d = new Date(r.published_at || r.fetched_at || Date.now())
      const key = ymd(d)
      const arr = byDay.get(key) || []
      arr.push(r)
      byDay.set(key, arr)
    }

    const regexes = buildRegexes(terms)
    const series = Array.from(byDay.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([date, rows]) => {
        const total = rows.length
        const counters = terms.map(() => 0)
        for (const r of rows) {
          const txt = `${r.title}\n${r.content || ''}`
          regexes.forEach((re, i) => {
            // 문서 내 해당 키워드가 1번 이상 등장하면 1로 카운트
            if (re.test(txt)) counters[i] += 1
          })
        }
        const item: Record<string, number | string> = { date, total }
        terms.forEach((t, i) => (item[t] = counters[i]))
        return item
      })

    return NextResponse.json({ ok: true, days, terms, series })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
