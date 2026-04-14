// src/app/api/rone/office-vacancy/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  roneFetchAllRows,
  parseQuarter,
  pickVacancyStatblId,
  filterSeoulHubsForQuarter,
} from '@/lib/rone'

type HubRow = {
  period: string
  period_desc?: string | null
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

    // 2) 분기 파싱 및 통계표 선택
    const { year, q } = parseQuarter(periodRaw)
    const STATBL_ID = pickVacancyStatblId(year, q)
    if (!STATBL_ID) {
      return NextResponse.json(
        { error: '공실률 통계표 STATBL_ID 를 결정할 수 없습니다.' },
        { status: 500 }
      )
    }

    // 3) 페이지네이션 수집
    const rows = await roneFetchAllRows({
      STATBL_ID,
      DTACYCLE_CD: 'QY',
      pageSize: 1000,
      maxPages: 200,
    })

    // 4) 내부 헬퍼로 정규화된 hubs 확보
    const hubs = filterSeoulHubsForQuarter(rows, year, q) as HubRow[]

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

    // 5) 업서트 페이로드 (스키마에 맞춤)
    const payload = hubs.map((h) => ({
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

    const { data, error } = await supabase
      .from('rone_office_vacancy')
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
