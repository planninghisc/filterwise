// src/app/api/fss/press/route.ts
export const runtime = 'nodejs' // Buffer/iconv 사용을 위해 Node 런타임 고정

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/** ---------- 인코딩/엔티티 유틸 ---------- */

type Candidate = { enc: 'utf8' | 'euc-kr' | 'cp949'; json?: unknown; score: number }

async function decodeBestJson(res: Response): Promise<unknown> {
  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)
  const iconv = (await import('iconv-lite')).default

  const cands: Candidate[] = [
    { enc: 'utf8', score: 0 },
    { enc: 'euc-kr', score: 0 },
    { enc: 'cp949', score: 0 },
  ]

  for (const c of cands) {
    try {
      const txt = c.enc === 'utf8' ? buf.toString('utf8') : iconv.decode(buf, c.enc)
      const j = JSON.parse(txt) as unknown
      c.json = j
      c.score = hangulScoreFromJson(j)
    } catch {
      c.score = -1
    }
  }
  cands.sort((a, b) => b.score - a.score)
  const best = cands[0]
  if (!best || best.score < 0 || typeof best.json === 'undefined') {
    throw new Error('Failed to decode/parse FSS response (utf8/euc-kr/cp949).')
  }
  return best.json
}

function hangulScoreFromJson(obj: unknown): number {
  try {
    const s = JSON.stringify(obj)
    if (!s) return -1
    let score = 0
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i)
      if (ch >= 0xac00 && ch <= 0xd7a3) score++ // 한글 음절
      if (ch === 0xfffd) score -= 2             // replacement char 감점
    }
    return score
  } catch {
    return -1
  }
}

function decodeHtmlEntities(input?: string | null): string | undefined {
  if (!input) return input ?? undefined
  let s = String(input)
  s = s.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&hellip;': '…',
    '&middot;': '·',
  }
  s = s.replace(/&[a-zA-Z]+?;|&#\d+;|&#x[0-9a-fA-F]+;/g, (m) => map[m] ?? m)
  return s
}

/** ---------- 타입 ---------- */

type FssPressItem = {
  contentId: string
  subject: string
  publishOrg: string
  originUrl: string
  viewCnt: string
  regDate: string
  atchfileUrl?: string
  atchfileNm?: string
  contentsKor?: string
}

type FssPressResponse = {
  resultCode: string
  resultMsg: string
  resultCnt: number
  result: FssPressItem[]
}

type FssRaw = {
  reponse?: unknown
  response?: unknown
  [k: string]: unknown
}

function normalizeMultiline(s?: string): string | undefined {
  if (!s) return s
  return s
    .replace(/rnrn/gi, '\n\n')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeJson(json: unknown): FssPressResponse {
  const j = json as FssRaw
  const root = (isRecord(j.reponse) ? j.reponse : isRecord(j.response) ? j.response : j) as Record<
    string,
    unknown
  >

  const result = root.result as unknown
  const arr: Record<string, unknown>[] = Array.isArray(result)
    ? (result as Record<string, unknown>[])
    : isRecord(result)
    ? [result as Record<string, unknown>]
    : []

  const resultCnt = Number(root.resultCnt ?? arr.length)

  const items: FssPressItem[] = arr.map((it) => {
    const subject = decodeHtmlEntities(String(it?.subject ?? '')) ?? ''
    const contents = decodeHtmlEntities(it?.contentsKor ? String(it.contentsKor) : undefined)
    const atchNm = decodeHtmlEntities(it?.atchfileNm ? String(it.atchfileNm) : undefined)
    return {
      contentId: String(it?.contentId ?? ''),
      subject,
      publishOrg: String(it?.publishOrg ?? ''),
      originUrl: String(it?.originUrl ?? ''),
      viewCnt: String(it?.viewCnt ?? '0'),
      regDate: String(it?.regDate ?? ''),
      atchfileUrl: it?.atchfileUrl ? String(it.atchfileUrl) : undefined,
      atchfileNm: atchNm,
      contentsKor: normalizeMultiline(contents),
    }
  })

  return {
    resultCode: String(root.resultCode ?? ''),
    resultMsg: String(root.resultMsg ?? ''),
    resultCnt,
    result: items,
  }
}

/** ---------- 라우트 ---------- */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') // YYYY-MM-DD
    const endDate = searchParams.get('endDate')     // YYYY-MM-DD
    const subject = searchParams.get('subject') || ''
    const save = searchParams.get('save') === '1'

    const authKey = process.env.FSS_AUTH_KEY
    if (!authKey) {
      return NextResponse.json({ error: 'FSS_AUTH_KEY is not set on the server.' }, { status: 500 })
    }
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required. (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const base = 'https://www.fss.or.kr/fss/kr/openApi/api/bodoInfo.jsp'
    const qs = new URLSearchParams({ apiType: 'json', startDate, endDate, authKey })
    const apiUrl = `${base}?${qs.toString()}`

    const upstream = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json,text/plain,*/*' },
    })
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${upstream.status} ${upstream.statusText}` },
        { status: 502 }
      )
    }

    const rawJson = await decodeBestJson(upstream)
    const normalized = normalizeJson(rawJson)

    const filtered = normalized.result.filter((item) =>
      subject ? item.subject.toLowerCase().includes(subject.toLowerCase()) : true
    )

    let saved = 0
    if (save && filtered.length > 0) {
      const payload = filtered.map((r) => ({
        content_id: r.contentId,
        subject: r.subject,
        publish_org: r.publishOrg,
        origin_url: r.originUrl,
        view_cnt: Number(r.viewCnt || 0),
        reg_date: new Date(r.regDate.replace(' ', 'T') + 'Z').toISOString(),
        atchfile_url: r.atchfileUrl ?? null,
        atchfile_nm: r.atchfileNm ?? null,
        contents_kor: r.contentsKor ?? null,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabaseAdmin.from('fss_press').upsert(payload, { onConflict: 'content_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      saved = payload.length
    }

    return NextResponse.json({
      resultCode: normalized.resultCode,
      resultMsg: normalized.resultMsg,
      resultCnt: filtered.length,
      result: filtered,
      period: { startDate, endDate },
      saved,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
