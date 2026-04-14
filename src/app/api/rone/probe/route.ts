// src/app/api/rone/probe/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import {
  roneFetchAllRows,
  parseQuarter,
  filterSeoulIndexAnchorsForQuarter,
  filterSeoulHubsForQuarter,
} from '@/lib/rone'

type ProbeKind = 'index' | 'vacancy'
type HubRow = {
  period: string
  period_desc?: string | null
  region_code: 'CBD' | 'KBD' | 'YBD'
  region_name?: string | null
  value: number | string | null
  unit?: string | null
  raw?: unknown
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message || 'Unknown error'
  try { return JSON.stringify(e) } catch { return String(e) }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url)
    const kind = (url.searchParams.get('kind') ?? 'index') as ProbeKind // index | vacancy
    const periodRaw = String(url.searchParams.get('period') ?? '').trim()
    if (!periodRaw) {
      return NextResponse.json({ error: 'period 쿼리 파라미터가 필요합니다.' }, { status: 400 })
    }
    const { year, q } = parseQuarter(periodRaw)

    const statbl =
      kind === 'index'
        ? process.env.RONE_OFFICE_INDEX_STATBL_ID
        : process.env.RONE_OFFICE_VACANCY_STATBL_ID

    if (!statbl) {
      return NextResponse.json({ error: 'STATBL_ID 환경변수가 없습니다.' }, { status: 500 })
    }

    const rows = await roneFetchAllRows({
      STATBL_ID: statbl,
      DTACYCLE_CD: 'QY',
      pageSize: 1000,
      maxPages: 50,
    })

    const hubs =
      kind === 'index'
        ? (filterSeoulIndexAnchorsForQuarter(rows, year, q) as HubRow[])
        : (filterSeoulHubsForQuarter(rows, year, q) as HubRow[])

    const preview = hubs.slice(0, 6).map((h) => ({
      period: h.period,
      region_code: h.region_code,
      region_name: h.region_name ?? null,
      value: toNum(h.value),
      unit: h.unit ?? null,
    }))

    return NextResponse.json({
      info: { kind, period: periodRaw, year, quarter: q, statbl },
      count: hubs.length,
      preview,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}
