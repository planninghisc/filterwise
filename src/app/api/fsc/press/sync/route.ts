// API 라우트 ②: 크롤링 + DB 저장(Supabase upsert)
// src/app/api/fsc/press/sync/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PressRow = {
  content_id: string
  title: string
  department: string | null
  views: number | null
  date: string // YYYY-MM-DD
  url: string
  attachments: { name: string; url: string }[]
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BASE = 'https://www.fsc.go.kr'
const LIST = `${BASE}/no010101`

/* -------------------- 유틸 -------------------- */
function errorToString(err: unknown): string {
  if (err instanceof Error) return `${err.name || 'Error'}: ${err.message || 'unknown error'}`
  try { return JSON.stringify(err) } catch { return String(err) }
}
function abs(href?: string | null): string {
  if (!href) return ''
  try { return new URL(href, BASE).toString() } catch { return href }
}
function parseIntSafe(s?: string | null): number | null {
  const n = Number(String(s ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : null
}
function pickText($el: { text: () => string }): string {
  return ($el.text() || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}
/** 용량표시/잡다한 공백 제거 */
function cleanFileName(name: string): string {
  let s = name.replace(/\s+/g, ' ').trim()
  s = s.replace(/\s*\((?:\d+(?:\.\d+)?)\s*(?:B|KB|MB|GB|TB)\)\s*$/i, '').trim()
  return s
}
function looksLikeFileName(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  return /\.[a-z0-9]{2,5}(\)|$)/i.test(t) || /(pdf|hwp|hwpx|zip|xlsx?|pptx?|docx?)$/i.test(t)
}

/* -------------------- HTTP -------------------- */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: BASE,
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} (${url})`)
  return await res.text()
}

/* -------------------- 목록 파서 -------------------- */
function extractListItems(html: string): { url: string; id: string }[] {
  const $ = cheerio.load(html)
  const out: { url: string; id: string }[] = []

  $('a[href]').each((_, a) => {
    const href = String($(a).attr('href') || '')
    const m = href.match(/\/no010101\/(\d+)/)
    if (m) out.push({ url: abs(href), id: m[1] })
  })

  const map = new Map<string, { url: string; id: string }>()
  for (const it of out) map.set(it.id, it)
  return Array.from(map.values())
}

/* -------------------- 상세 파서 -------------------- */
function parseDetail(html: string, url: string, contentId: string): PressRow {
  const $ = cheerio.load(html)

  // 제목: .subject 최우선 + 보정
  let title =
    $('div.subject').first().text().trim() ||
    $('h1, h2, h3, .view_tit, .tit, .title, .board-view h4').first().text().trim() ||
    ''
  const full = $('body').text().replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ').trim()
  const lines = full.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const dateLineIdx = lines.findIndex(s => /\b20\d{2}-\d{2}-\d{2}\b.*조회수\s*[:：]/.test(s))
  if ((!title || /알림마당|위원회 소식|보도자료/.test(title)) && dateLineIdx > 0) {
    const candidate = lines[dateLineIdx - 1]
    if (candidate && candidate.length > 3) title = candidate
  }
  if (!title) title = ($('title').first().text().split('-')[0] || '').trim() || '제목 미상'

  // 날짜/조회수/담당부서
  const date = (full.match(/\b(20\d{2}-\d{2}-\d{2})\b/) || [,''])[1]
  const views = parseIntSafe((full.match(/조회수\s*[:：]\s*([\d,]+)/) || [,''])[1])
  let department: string | null = null
  const deptM = full.match(/담당부서\s*[:：]?\s*([^\n]+?)(?:\s+담당자|\s+연락처|\s+전화|\s+조회수|$)/)
  if (deptM && deptM[1]) department = deptM[1].trim()

  // -------------------- 첨부파일: .file-list 블록 최우선 --------------------
  const attachments: { name: string; url: string }[] = []

  $('.file-list').each((_, block) => {
    const $block = $(block)
    // 파일명 후보
    let fileName = cleanFileName(pickText($block.find('span.name').first()))
    if (!fileName || /^\((?:\d+(?:\.\d+)?)\s*(?:B|KB|MB|GB|TB)\)$/i.test(fileName)) {
      const names = $block.find('span.name').toArray().map(el => cleanFileName(pickText($(el)))).filter(Boolean)
      if (names.length > 0) fileName = names.find(n => looksLikeFileName(n)) || names[0]
    }
    // 다운로드 URL
    const a = $block.find('.ico.download a[href]').first()
    const href = String(a.attr('href') || '')
    const fileUrl = abs(href)

    if (fileUrl) {
      if (!fileName) {
        try {
          const u = new URL(fileUrl)
          const qpName =
            u.searchParams.get('fileNm') ||
            u.searchParams.get('fileName') ||
            u.searchParams.get('filename') ||
            ''
          const pathName = u.pathname.split('/').pop() ?? ''
          const guess = (qpName || pathName || '').trim()
          fileName = (!guess || /^getfile(\.\w+)?$/i.test(guess)) ? '첨부파일' : guess
        } catch {
          fileName = '첨부파일'
        }
      }
      attachments.push({ name: fileName, url: fileUrl })
    }
  })

  // 보조 케이스: ul/li 구조
  if (attachments.length === 0) {
    $('ul.attach li, ul.file li, ul.files li, .file_down li, .fileArea li, .file-area li, .attach li, .board-file li')
      .each((_, li) => {
        const $li = $(li)
        let fileName = cleanFileName(pickText($li.find('span.name').first()))
        if (!fileName || /^\((?:\d+(?:\.\d+)?)\s*(?:B|KB|MB|GB|TB)\)$/i.test(fileName)) {
          const names = $li.find('span.name').toArray().map(el => cleanFileName(pickText($(el)))).filter(Boolean)
          if (names.length > 0) fileName = names.find(n => looksLikeFileName(n)) || names[0]
        }
        const a = $li.find('a[href*="/comm/getFile"]').first()
        const href = String(a.attr('href') || '')
        const fileUrl = abs(href)
        if (fileUrl) {
          if (!fileName) {
            try {
              const u = new URL(fileUrl)
              const qpName =
                u.searchParams.get('fileNm') ||
                u.searchParams.get('fileName') ||
                u.searchParams.get('filename') ||
                ''
              const pathName = u.pathname.split('/').pop() ?? ''
              const guess = (qpName || pathName || '').trim()
              fileName = (!guess || /^getfile(\.\w+)?$/i.test(guess)) ? '첨부파일' : guess
            } catch {
              fileName = '첨부파일'
            }
          }
          attachments.push({ name: fileName, url: fileUrl })
        }
      })
  }

  // 최종 폴백
  if (attachments.length === 0) {
    $('a[href*="/comm/getFile"]').each((_, a) => {
      const $a = $(a)
      const fileUrl = abs(String($a.attr('href') || ''))
      if (!fileUrl) return
      let fileName = cleanFileName(pickText($a.closest('.file-list, li').find('span.name').first()))
      if (!fileName) {
        try {
          const u = new URL(fileUrl)
          const qpName =
            u.searchParams.get('fileNm') ||
            u.searchParams.get('fileName') ||
            u.searchParams.get('filename') ||
            ''
          const pathName = u.pathname.split('/').pop() ?? ''
          const guess = (qpName || pathName || '').trim()
          fileName = (!guess || /^getfile(\.\w+)?$/i.test(guess)) ? '첨부파일' : guess
        } catch {
          fileName = '첨부파일'
        }
      }
      attachments.push({ name: fileName, url: fileUrl })
    })
  }

  // 중복 제거(url 기준)
  const uniq = new Map<string, { name: string; url: string }>()
  for (const att of attachments) {
    if (!uniq.has(att.url)) uniq.set(att.url, att)
  }

  return {
    content_id: contentId,
    title,
    department,
    views,
    date,
    url,
    attachments: Array.from(uniq.values()),
  }
}

/* -------------------- 라우트 -------------------- */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start') // YYYY-MM-DD
    const end = searchParams.get('end')     // YYYY-MM-DD
    const pages = parseIntSafe(searchParams.get('pages')) ?? 5

    if (!start || !end) {
      return NextResponse.json(
        { ok: false, error: 'start, end 쿼리가 필요합니다. (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    // 목록 페이지들
    const listUrls = Array.from({ length: Math.max(1, pages) }, (_, i) => {
      const qs = new URLSearchParams()
      qs.set('srchBeginDt', start)
      qs.set('srchEndDt', end)
      qs.set('curPage', String(i + 1))
      return `${LIST}?${qs.toString()}`
    })

    const listHtmls = await Promise.all(listUrls.map(async (u) => {
      try { return await fetchText(u) }
      catch (e) { throw new Error(`목록 수집 실패: ${errorToString(e)}`) }
    }))

    const detailLinks = listHtmls.flatMap(extractListItems)
    if (detailLinks.length === 0) {
      return NextResponse.json({ ok: true, saved: 0, range: { start, end }, sample: [] })
    }

    // 상세 파싱
    const rows: PressRow[] = []
    for (const { url, id } of detailLinks) {
      try {
        const html = await fetchText(url)
        const row = parseDetail(html, url, id)
        if (row.date && row.date >= start && row.date <= end && row.url) rows.push(row)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[fsc-press] 상세 파싱 실패:', id, errorToString(e))
      }
    }

    // 저장: content_id와 url 분리 업서트
    if (rows.length > 0) {
      const clean = rows
        .filter(r => r.url && r.url.trim().length > 0)
        .map(r => ({
          content_id: (r.content_id ?? '').toString(),
          title: r.title,
          department: r.department,
          views: r.views,
          date: r.date,
          url: r.url,
          attachments: r.attachments,
        }))

      const withId = clean.filter(r => r.content_id && r.content_id.trim() !== '')
      const withoutId = clean.filter(r => !r.content_id || r.content_id.trim() === '')

      if (withId.length > 0) {
        const { error: upErr1 } = await supabase
          .from('fsc_press')
          .upsert(withId, { onConflict: 'content_id' })
        if (upErr1) {
          throw new Error(
            `supabase upsert(content_id) error: ${errorToString({
              code: (upErr1 as { code?: string }).code,
              message: (upErr1 as { message?: string }).message,
              details: (upErr1 as { details?: unknown }).details,
            })}`
          )
        }
      }
      if (withoutId.length > 0) {
        const { error: upErr2 } = await supabase
          .from('fsc_press')
          .upsert(withoutId, { onConflict: 'url' })
        if (upErr2) {
          throw new Error(
            `supabase upsert(url) error: ${errorToString({
              code: (upErr2 as { code?: string }).code,
              message: (upErr2 as { message?: string }).message,
              details: (upErr2 as { details?: unknown }).details,
            })}`
          )
        }
      }
    }

    return NextResponse.json({
      ok: true,
      saved: rows.length,
      range: { start, end },
      sample: rows.slice(0, 3),
    })
  } catch (err: unknown) {
    const msg = errorToString(err)
    // eslint-disable-next-line no-console
    console.error('[fsc/sync] error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
