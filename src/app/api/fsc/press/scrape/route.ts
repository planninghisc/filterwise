// src/app/api/fsc/press/scrape/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE = 'https://www.fsc.go.kr'
const LIST_PATH = '/no010101'

type PressRow = {
  id: string
  title: string
  date: string
  department: string | null
  views: number | null
  url: string
  attachments: { name: string; url: string }[]
}

function fmt(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseIntSafe(s?: string | null): number | null {
  const n = Number(String(s ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : null
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ✅ 에러 메시지 직렬화 유틸
function errorToString(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name || 'Error'
    const msg = err.message || 'unknown error'
    return `${name}: ${msg}`
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function pickCharset(ct?: string | null): 'euc-kr' | 'utf-8' {
  const s = (ct || '').toLowerCase()
  if (s.includes('euc-kr') || s.includes('ks_c_5601') || s.includes('cp949')) return 'euc-kr'
  return 'utf-8'
}

async function fetchDecoded(url: string, tryCount = 3, timeoutMs = 12000): Promise<string> {
  let lastErr: unknown
  for (let i = 0; i < tryCount; i++) {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Upgrade-Insecure-Requests': '1',
          'Referer': BASE,
        },
        cache: 'no-store',
        signal: controller.signal,
      })
      clearTimeout(tid)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`)
      }

      const buf = new Uint8Array(await res.arrayBuffer())
      const ct = res.headers.get('content-type')
      let charset = pickCharset(ct)

      // 메타 태그 기반 재감지
      const head = iconv.decode(buf.slice(0, Math.min(buf.length, 4096)), charset)
      const m = head.match(/charset\s*=\s*["']?([\w-]+)/i)
      if (m && m[1]) {
        const c = m[1].toLowerCase()
        if (c.includes('euc-kr') || c.includes('ks_c_5601') || c.includes('cp949')) charset = 'euc-kr'
        else charset = 'utf-8'
      }
      return iconv.decode(buf, charset)
    } catch (e) {
      clearTimeout(tid)
      lastErr = e
      await sleep(400 * Math.pow(2, i)) // 400 → 800 → 1600ms
    }
  }
  // 맥락 포함 에러
  throw new Error(`fetchDecoded failed: ${errorToString(lastErr)}`)
}

function extractDetailLinksFromList(html: string): string[] {
  const $ = cheerio.load(html)
  const hrefs = new Set<string>()

  $('a[href]').each((_, a) => {
    const href = String($(a).attr('href') || '')
    const m = href.match(/^\/no010101\/\d+/)
    if (m) hrefs.add(m[0])
  })

  if (hrefs.size === 0) {
    const re = /href="(\/no010101\/\d+)[^"]*"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) hrefs.add(m[1])
  }

  return Array.from(hrefs)
}

function extractFromDetail(html: string, url: string): Omit<PressRow, 'id' | 'url' | 'attachments'> & {
  attachments: PressRow['attachments']
} {
  const $ = cheerio.load(html)

  const title =
    ($('h1, h2, h3').first().text() || '').trim().replace(/\s+/g, ' ') ||
    (($('title').text().split('-')[0] || '').trim())

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()

  const dateMatch = bodyText.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  const date = dateMatch ? dateMatch[1] : ''

  const viewsMatch = bodyText.match(/조회수\s*:\s*([0-9,]+)/)
  const views = viewsMatch ? parseIntSafe(viewsMatch[1]) : null

  let department: string | null = null
  const deptMatch = bodyText.match(/담당부서\s*[: ]\s*([^\s].*?)\s+(담당자|연락처|조회수|$)/)
  if (deptMatch && deptMatch[1]) department = deptMatch[1].replace(/\s+/g, ' ').trim()
  else {
    const deptLoose = bodyText.match(/담당부서\s*[: ]\s*([^\s].{0,30})/)
    department = deptLoose ? deptLoose[1].trim() : null
  }

  const attachments: { name: string; url: string }[] = []
  $('a[href]').each((_, a) => {
    const href = String($(a).attr('href') || '')
    if (!href) return
    const lower = href.toLowerCase()
    if (/\.(pdf|hwp|hwpx|xlsx|xls|zip)$/.test(lower)) {
      const nameText =
        ($(a).text() || $(a).prev().text() || $(a).parent().text() || '').replace(/\s+/g, ' ').trim()
      const abs = href.startsWith('http') ? href : new URL(href, BASE).toString()
      attachments.push({ name: nameText || abs.split('/').pop() || '첨부파일', url: abs })
    }
  })

  return { title, date, department, views, attachments }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const days = parseIntSafe(searchParams.get('days')) ?? 7

    const endDate = end || fmt(new Date())
    const startDate = start || fmt(new Date(Date.now() - (days ?? 7) * 24 * 60 * 60 * 1000))

    const out: PressRow[] = []
    const maxPages = 20
    const concurrency = 3

    for (let page = 1; page <= maxPages; page++) {
      const listUrl = `${BASE}${LIST_PATH}?srchBeginDt=${encodeURIComponent(startDate)}&srchEndDt=${encodeURIComponent(endDate)}&curPage=${page}`
      const html = await fetchDecoded(listUrl)

      if (/게시물\s*이\s*없습니다/.test(html)) break

      const links = extractDetailLinksFromList(html)
      if (links.length === 0) break

      for (let i = 0; i < links.length; i += concurrency) {
        const chunk = links.slice(i, i + concurrency)
        const chunkRows = await Promise.all(
          chunk.map(async (path) => {
            const url = `${BASE}${path}`
            const id = path.split('/').pop() || ''
            const detail = await fetchDecoded(url)
            const f = extractFromDetail(detail, url)
            const row: PressRow = {
              id,
              url,
              title: f.title,
              date: f.date,
              department: f.department,
              views: f.views,
              attachments: f.attachments,
            }
            return row
          })
        )
        out.push(...chunkRows)
        await sleep(200)
      }

      if (links.length < 10) break
    }

    const inRange = out.filter((r) => r.date >= startDate && r.date <= endDate)
    inRange.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

    return NextResponse.json({ ok: true, startDate, endDate, count: inRange.length, rows: inRange })
  } catch (err: unknown) {
    const msg = errorToString(err)
    // 서버 로그에 자세히 남겨 원인 추적
    // eslint-disable-next-line no-console
    console.error('[fsc/scrape] error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
