// src/app/api/rone/office-index/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  roneFetchAllRows,
  parseQuarter,
  filterSeoulIndexAnchorsForQuarter,
  iterateQuartersInclusive,
} from '@/lib/rone'

type HubRow = {
  period: string // '202403' | '202401' 등
  period_desc?: string | null // '2024년 1분기' 등
  region_code: 'CBD' | 'KBD' | 'YBD'
  region_name?: string | null
  value: number | string | null
  unit?: string | null
  raw?: unknown
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message || 'Unknown error'
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function resolveOfficeIndexStatblId(): string {
  return (
    process.env.RONE_OFFICE_INDEX_STATBL_ID ||
    process.env.RONE_OFFICE_STATBL_ID ||
    process.env.NEXT_PUBLIC_RONE_OFFICE_STATBL_ID ||
    process.env.NEXT_PUBLIC_RONE_STATBL_ID ||
    ''
  )
}

function hubsToPayload(hubs: HubRow[], STATBL_ID: string) {
  return hubs.map((h) => ({
    period: h.period,
    wrttime_desc: h.period_desc ?? null,
    region_code: h.region_code,
    region_name: h.region_name ?? null,
    value: toNumberOrNull(h.value),
    unit: (h.unit ?? null) as string | null,
    source_statbl_id: STATBL_ID,
    source_dtacycle_cd: 'QY',
    raw: (h.raw ?? null) as Record<string, unknown> | null,
  }))
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      period?: string
      range?: { startYear: number; startQ: number; endYear: number; endQ: number }
    }

    const STATBL_ID = resolveOfficeIndexStatblId()
    if (!STATBL_ID) {
      return NextResponse.json(
        { error: '임대가격지수 STATBL_ID 환경변수가 없습니다.' },
        { status: 500 }
      )
    }

    // ----- 기간 일괄: R-ONE 1회 호출 후 분기별 필터·한 번에 upsert -----
    if (body?.range && typeof body.range === 'object') {
      const sy = Number(body.range.startYear)
      const sq = Number(body.range.startQ) as 1 | 2 | 3 | 4
      const ey = Number(body.range.endYear)
      const eq = Number(body.range.endQ) as 1 | 2 | 3 | 4
      if (![1, 2, 3, 4].includes(sq) || ![1, 2, 3, 4].includes(eq)) {
        return NextResponse.json({ error: 'range.startQ / range.endQ 는 1~4 여야 합니다.' }, { status: 400 })
      }
      if (!Number.isFinite(sy) || !Number.isFinite(ey)) {
        return NextResponse.json({ error: 'range.startYear / range.endYear 가 필요합니다.' }, { status: 400 })
      }

      const quarters = iterateQuartersInclusive(sy, sq, ey, eq)
      if (quarters.length > 48) {
        return NextResponse.json(
          { error: '한 번에 수집할 분기는 최대 48분기(약 12년)까지입니다. 기간을 나눠 주세요.' },
          { status: 400 },
        )
      }

      const ronePack = await roneFetchAllRows({
        STATBL_ID,
        DTACYCLE_CD: 'QY',
        pageSize: 1000,
        maxPages: 200,
      })
      const rows = ronePack.rows

      if (rows.length === 0) {
        return NextResponse.json({
          mode: 'range',
          info: {
            statbl: STATBL_ID,
            message: 'R-ONE에서 가져온 행이 없습니다.',
            page1ResultCode: ronePack.page1ResultCode ?? '',
            page1ResultMessage: ronePack.page1ResultMessage ?? '',
          },
          count: 0,
          rows: [],
          perQuarter: quarters.map(({ year, q }) => ({ year, quarter: q, matched: 0 })),
        })
      }

      const payload: ReturnType<typeof hubsToPayload> = []
      const perQuarter: Array<{ year: number; quarter: number; matched: number }> = []

      for (const { year, q } of quarters) {
        const hubs = filterSeoulIndexAnchorsForQuarter(rows, year, q) as HubRow[]
        perQuarter.push({ year, quarter: q, matched: hubs.length })
        if (hubs.length) payload.push(...hubsToPayload(hubs, STATBL_ID))
      }

      if (payload.length === 0) {
        return NextResponse.json({
          mode: 'range',
          info: {
            statbl: STATBL_ID,
            message: '선택 기간에 매칭된 허브 행이 없습니다.',
            roneRowCount: rows.length,
            page1ResultCode: ronePack.page1ResultCode ?? '',
            page1ResultMessage: ronePack.page1ResultMessage ?? '',
          },
          count: 0,
          rows: [],
          perQuarter,
        })
      }

      const { data, error } = await supabase
        .from('rone_office_index')
        .upsert(payload, { onConflict: 'period,region_code' })
        .select()

      if (error) throw new Error(errMsg(error))

      return NextResponse.json({
        mode: 'range',
        info: { statbl: STATBL_ID, quarters: quarters.length },
        count: data?.length ?? 0,
        rows: data ?? [],
        perQuarter,
      })
    }

    // ----- 단일 분기 -----
    const periodRaw = String(body?.period ?? '').trim()
    if (!periodRaw) {
      return NextResponse.json({ error: 'period 또는 range 가 필요합니다.' }, { status: 400 })
    }

    const { year, q } = parseQuarter(periodRaw)

    const ronePack = await roneFetchAllRows({
      STATBL_ID,
      DTACYCLE_CD: 'QY',
      pageSize: 1000,
      maxPages: 200,
    })
    const rows = ronePack.rows

    const hubs = filterSeoulIndexAnchorsForQuarter(rows, year, q) as HubRow[]

    if (hubs.length === 0) {
      return NextResponse.json(
        {
          period: periodRaw,
          info: {
            year,
            quarter: q,
            statbl: STATBL_ID,
            message:
              rows.length === 0
                ? 'R-ONE에서 가져온 행이 없습니다.'
                : '해당 분기 데이터가 발견되지 않았습니다.',
            roneRowCount: rows.length,
            page1ResultCode: ronePack.page1ResultCode ?? '',
            page1ResultMessage: ronePack.page1ResultMessage ?? '',
          },
          count: 0,
          rows: [],
        },
        { status: 200 }
      )
    }

    const payload = hubsToPayload(hubs, STATBL_ID)

    const { data, error } = await supabase
      .from('rone_office_index')
      .upsert(payload, { onConflict: 'period,region_code' })
      .select()

    if (error) {
      throw new Error(errMsg(error))
    }

    return NextResponse.json({
      period: periodRaw,
      info: { year, quarter: q, statbl: STATBL_ID },
      count: data?.length ?? 0,
      rows: data ?? [],
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}
