// src/app/api/rone/office-index/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  roneFetchAllRows,
  parseQuarter,
  filterSeoulIndexAnchorsForQuarter,
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1) 입력 파싱
    const body = (await req.json().catch(() => ({}))) as { period?: string }
    const periodRaw = String(body?.period ?? '').trim()
    if (!periodRaw) {
      return NextResponse.json({ error: 'period 가 필요합니다.' }, { status: 400 })
    }

    // 2) 분기 파싱
    const { year, q } = parseQuarter(periodRaw)

    // 3) STATBL_ID (과거 호환 포함)
    const STATBL_ID =
      process.env.RONE_OFFICE_INDEX_STATBL_ID ||
      process.env.RONE_OFFICE_STATBL_ID ||
      process.env.NEXT_PUBLIC_RONE_OFFICE_STATBL_ID ||
      process.env.NEXT_PUBLIC_RONE_STATBL_ID ||
      ''

    if (!STATBL_ID) {
      return NextResponse.json(
        { error: '임대가격지수 STATBL_ID 환경변수가 없습니다.' },
        { status: 500 }
      )
    }

    // 4) 페이지네이션 수집
    const rows = await roneFetchAllRows({
      STATBL_ID,
      DTACYCLE_CD: 'QY',
      pageSize: 1000,
      maxPages: 200,
    })

    // 5) 내부 헬퍼로 정규화된 hubs 확보
    const hubs = filterSeoulIndexAnchorsForQuarter(rows, year, q) as HubRow[]

    if (hubs.length === 0) {
      return NextResponse.json(
        {
          period: periodRaw,
          info: { year, quarter: q, statbl: STATBL_ID, message: '해당 분기 데이터가 발견되지 않았습니다.' },
          count: 0,
          rows: [],
        },
        { status: 200 }
      )
    }

    // 6) 업서트 페이로드 구성 (스키마에 정확히 맞춰 저장)
    const payload = hubs.map((h) => ({
      period: h.period, // NOT NULL
      wrttime_desc: h.period_desc ?? null,
      region_code: h.region_code, // NOT NULL (UNIQUE 키)
      region_name: h.region_name ?? null,
      value: toNumberOrNull(h.value), // numeric 컬럼 안전 변환
      unit: (h.unit ?? null) as string | null,
      source_statbl_id: STATBL_ID,
      source_dtacycle_cd: 'QY',
      raw: (h.raw ?? null) as Record<string, unknown> | null, // jsonb
    }))

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
