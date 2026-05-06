// src/app/api/news/trend/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  addKstCalendarDays,
  kstCalendarYmdFromInstant,
  kstDayRangeToPublishedAtFilter,
  kstTodayYmd,
} from '@/lib/kstDate'

type Row = {
  id: string
  title: string
  content: string | null
  published_at: string
}

function buildRegexes(terms: string[]) {
  return terms
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
}

/** Every KST calendar day from startYmd to endYmd inclusive (chronological). */
function enumerateKstDaysInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = []
  let cur = startYmd
  for (let guard = 0; guard < 400; guard++) {
    out.push(cur)
    if (cur === endYmd) break
    cur = addKstCalendarDays(cur, 1)
  }
  return out
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Math.min(Math.max(Number(searchParams.get('days') || '14'), 1), 90)
    const termsParam = (searchParams.get('terms') || '').trim()
    const terms = termsParam ? termsParam.split(',') : ['한화투자증권']

    const endYmd = kstTodayYmd()
    const startYmd = addKstCalendarDays(endYmd, -(days - 1))
    const { gte, lte } = kstDayRangeToPublishedAtFilter(startYmd, endYmd)

    const { data, error } = await supabaseAdmin
      .from('news_articles')
      .select('id, title, content, published_at')
      .gte('published_at', gte)
      .lte('published_at', lte)
      .not('published_at', 'is', null)
      .order('published_at', { ascending: true })
      .limit(8000)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const dayKeys = enumerateKstDaysInclusive(startYmd, endYmd)
    const byDay = new Map<string, Row[]>()
    for (const k of dayKeys) byDay.set(k, [])

    for (const r of (data || []) as Row[]) {
      if (!r.published_at) continue
      const key = kstCalendarYmdFromInstant(r.published_at)
      const arr = byDay.get(key)
      if (arr) arr.push(r)
    }

    const regexes = buildRegexes(terms)
    const series = dayKeys.map((date) => {
      const rows = byDay.get(date) || []
      const total = rows.length
      const counters = terms.map(() => 0)
      for (const r of rows) {
        const txt = `${r.title}\n${r.content || ''}`
        regexes.forEach((re, i) => {
          if (re.test(txt)) counters[i] += 1
        })
      }
      const item: Record<string, number | string> = { date, total }
      terms.forEach((t, i) => (item[t] = counters[i]))
      return item
    })

    return NextResponse.json({
      ok: true,
      days,
      terms,
      series,
      range_kst: { start: startYmd, end: endYmd },
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
