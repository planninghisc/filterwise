// src/app/api/indexes/spgi/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type Row = {
  date: string
  value: number
  currency: string | null
  provider: string
  index_code: string
  updated_at: string | null
}

function parseQuery(req: NextRequest): { start?: string; end?: string } {
  const url = req.nextUrl
  const start = url.searchParams.get('start') ?? undefined
  const end = url.searchParams.get('end') ?? undefined
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('start must be YYYY-MM-DD')
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('end must be YYYY-MM-DD')
  if (start && end && start > end) throw new Error('start must be <= end')
  return { start, end }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { start, end } = parseQuery(req)
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('missing supabase env')

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    let q = supabase
      .from('index_series')
      .select('date,value,currency,provider,index_code,updated_at')
      .eq('family', 'spgi')
      .eq('index_code', '^SPGTINFR')
      .eq('provider', 'google_sheet')

    if (start) q = q.gte('date', start)
    if (end) q = q.lte('date', end)
    q = q.order('date', { ascending: true })

    const { data, error } = await q.returns<Row[]>()
    if (error) throw error

    return NextResponse.json({ ok: true, status: 200, data: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, status: 500, message: msg }, { status: 500 })
  }
}
