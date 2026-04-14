// src/app/api/kosis/unsold/list/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required environment variable: ${name}`)
  return v
}

type Row = {
  prd_de: string
  region_code: string
  region_name: string | null
  itm_id: string
  itm_name: string | null
  unit: string | null
  value: number | null
  updated_at: string | null
}

function validYm(s: string | null): s is string {
  return !!s && /^\d{6}$/.test(s)
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const sp = url.searchParams

    const start = sp.get('start')
    const end = sp.get('end')
    const regionName = sp.get('regionName')?.trim() ?? ''

    if (!validYm(start) || !validYm(end)) {
      return NextResponse.json(
        { ok: false, status: 400, message: 'start/end must be YYYYMM.' },
        { status: 400 },
      )
    }

    const supabase = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    )

    let query = supabase
      .from('kosis_unsold')
      .select(
        'prd_de, region_code, region_name, itm_id, itm_name, unit, value, updated_at',
        { head: false },
      )
      .gte('prd_de', start)
      .lte('prd_de', end)

    if (regionName) {
      query = query.ilike('region_name', `%${regionName}%`)
    }

    query = query
      .order('prd_de', { ascending: false })
      .order('region_name', { ascending: true })
      .order('itm_id', { ascending: true })

    const { data, error } = await query.returns<Row[]>()
    if (error) {
      return NextResponse.json(
        { ok: false, status: 500, message: String(error.message ?? error) },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, status: 200, data: data ?? [] })
  } catch (e) {
    return NextResponse.json(
      { ok: false, status: 500, message: String(e) },
      { status: 500 },
    )
  }
}
