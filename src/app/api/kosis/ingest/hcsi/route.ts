// src/app/api/kosis/ingest/hcsi/route.ts
import { NextResponse, type NextRequest } from 'next/server'

type InBody = { start?: string; end?: string }

function getSecret(req: NextRequest): string | null {
  const fromHeader = req.headers.get('x-job-secret') || req.headers.get('X-Job-Secret')
  if (fromHeader && fromHeader.trim().length > 0) return fromHeader.trim()
  const fromEnv = process.env.NEWS_CRON_SECRET
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as InBody
    const secret = getSecret(req)
    if (!secret) {
      return NextResponse.json(
        { ok: false, status: 500, message: 'Missing NEWS_CRON_SECRET (server). .env.local에 값을 설정하고 서버를 재시작해 주세요.' },
        { status: 500 },
      )
    }

    const origin = req.nextUrl.origin
    const url = new URL('/api/kosis/import', origin)
    url.searchParams.set('dataset', 'hcsi')
    url.searchParams.set('orgId', '390')
    url.searchParams.set('tblId', 'DT_39002_02')
    url.searchParams.set('prdSe', 'M')
    url.searchParams.set('itmId', 'ALL')
    url.searchParams.set('objL1', 'ALL')
    url.searchParams.set('regionKey', 'C1')
    if (body.start) url.searchParams.set('startPrdDe', body.start)
    if (body.end) url.searchParams.set('endPrdDe', body.end)

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Job-Secret': secret },
      cache: 'no-store',
    })

    const text = await resp.text()
    let data: unknown
    try { data = JSON.parse(text) } catch { data = { ok: false, status: resp.status, message: text.slice(0, 500) } }

    return NextResponse.json(data, { status: resp.status })
  } catch (e) {
    return NextResponse.json({ ok: false, status: 500, message: String(e) }, { status: 500 })
  }
}
