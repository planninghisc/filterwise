// src/app/api/rone/office-vacancy/export/route.ts
export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const TABLE = 'rone_office_vacancy' as const

function qMonth(q: number): '03' | '06' | '09' | '12' {
  return ['03', '06', '09', '12'][q - 1] as '03' | '06' | '09' | '12'
}
function toDbPeriod5(y: number, q: number): string {
  return `${y}0${q}`
}
function toDbPeriod(y: number, q: number): string {
  return `${y}${qMonth(q)}`
}
function descFromPeriod(p: string): string {
  const y = p.slice(0, 4)
  const m = p.slice(4)
  const q = ({ '03': 1, '06': 2, '09': 3, '12': 4 } as const)[m as '03' | '06' | '09' | '12']
  return `${y}년 ${q}분기`
}

type Row = {
  period: string
  wrttime_desc: string | null
  region_code: 'CBD' | 'KBD' | 'YBD'
  region_name: string | null
  value: number | null
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const url = new URL(req.url)
    const startYear = Number(url.searchParams.get('startYear'))
    const startQ = Number(url.searchParams.get('startQ'))
    const endYear = Number(url.searchParams.get('endYear'))
    const endQ = Number(url.searchParams.get('endQ'))
    const region = (url.searchParams.get('region') ?? 'ALL') as 'ALL' | 'CBD' | 'KBD' | 'YBD'

    if (!startYear || !startQ || !endYear || !endQ) {
      return new Response('Invalid query', { status: 400 })
    }

    const start = toDbPeriod(startYear, startQ)
    const end = toDbPeriod(endYear, endQ)

    const supabase = createClient(
      SUPABASE_URL,
      (SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY) as string
    )

    let query = supabase
      .from(TABLE)
      .select('period, wrttime_desc, region_code, region_name, value')
      .or(
        [
          `and(period.gte.${start},period.lte.${end})`,
          `and(period.gte.${toDbPeriod5(startYear, startQ)},period.lte.${toDbPeriod5(endYear, endQ)})`,
        ].join(',')
      )
      .order('period', { ascending: false })
      .order('region_code', { ascending: true })

    if (region !== 'ALL') query = query.eq('region_code', region)

    const { data, error } = await query.returns<Row[]>()
    if (error) throw new Error(error.message)

    const rows = (data ?? []).map((r) => [
      r.wrttime_desc || descFromPeriod(r.period),
      r.period,
      r.region_name || r.region_code,
      r.value,
    ])

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['분기(설명)', '시점코드', '지역', '값'], ...rows])
    XLSX.utils.book_append_sheet(wb, ws, 'office_vacancy')

    // ✅ 웹 Response 호환: ArrayBuffer 로 생성
    const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const filename = `office_vacancy_${start}-${end}${region !== 'ALL' ? '_' + region : ''}.xlsx`

    return new Response(ab, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(`Export failed: ${msg}`, { status: 500 })
  }
}
