// src/app/api/rone/office-index/list/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type Region = 'CBD' | 'KBD' | 'YBD'
type Row = {
  period: string
  wrttime_desc: string | null
  region_code: Region
  region_name: string | null
  value: number | null
  unit?: string | null
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function qMonth(q: number): '03' | '06' | '09' | '12' {
  return ['03', '06', '09', '12'][q - 1] as '03' | '06' | '09' | '12'
}
function toDbPeriod(y: number, q: number): string {
  return `${y}${qMonth(q)}`
}
function toDbPeriod5(y: number, q: number): string {
  return `${y}0${q}`
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url)
    const startYear = Number(url.searchParams.get('startYear'))
    const startQ = Number(url.searchParams.get('startQ'))
    const endYear = Number(url.searchParams.get('endYear'))
    const endQ = Number(url.searchParams.get('endQ'))
    const regionParam = (url.searchParams.get('region') ?? 'ALL').toUpperCase()
    const region = (['CBD', 'KBD', 'YBD'].includes(regionParam)
      ? (regionParam as Region)
      : 'ALL') as Region | 'ALL'

    if (!startYear || !startQ || !endYear || !endQ) {
      return NextResponse.json({ error: '유효한 기간을 입력해 주세요.' }, { status: 400 })
    }

    const start = toDbPeriod(startYear, startQ)
    const end = toDbPeriod(endYear, endQ)
    let query = supabase
      .from('rone_office_index')
      .select('period, wrttime_desc, region_code, region_name, value, unit')
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
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ rows: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
