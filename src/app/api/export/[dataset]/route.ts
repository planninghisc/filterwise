// src/app/api/export/[dataset]/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { DATASETS, type DatasetKey, pickTable } from '@/lib/datasets'

export const dynamic = 'force-dynamic'

type Row = {
  prd_de: string
  prd_se: string | null
  region_code: string
  region_name: string | null
  itm_id: string
  itm_name: string | null
  unit: string | null
  value: number | null
}

function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function rowsToCsv(rows: Row[]): string {
  const header = [
    'prd_de',
    'prd_se',
    'region_code',
    'region_name',
    'itm_id',
    'itm_name',
    'unit',
    'value',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        toCsvValue(r.prd_de),
        toCsvValue(r.prd_se),
        toCsvValue(r.region_code),
        toCsvValue(r.region_name),
        toCsvValue(r.itm_id),
        toCsvValue(r.itm_name),
        toCsvValue(r.unit),
        toCsvValue(r.value),
      ].join(',')
    )
  }
  return lines.join('\r\n')
}

// URL에서 dataset 추출 (context 인자 사용 안 함)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const match = url.pathname.match(/\/api\/export\/([^/]+)\/?$/)
    const datasetParam = match?.[1]
    if (!datasetParam) {
      return NextResponse.json({ ok: false, error: 'Missing dataset' }, { status: 400 })
    }

    const dataset = datasetParam as DatasetKey
    if (!DATASETS[dataset]) {
      return NextResponse.json({ ok: false, error: 'Unknown dataset' }, { status: 400 })
    }

    const table = pickTable(dataset)

    // 쿼리 파라미터
    const start = url.searchParams.get('start') // 예: 202301
    const end = url.searchParams.get('end')     // 예: 202512
    const region = url.searchParams.get('region') // region_code
    const itm = url.searchParams.get('itm')       // itm_id

    // ✅ from()에 제네릭 제거, select() 뒤에 .returns<Row[]>()로 타입 지정
    let query = supabaseAdmin
      .from(table)
      .select(
        'prd_de, prd_se, region_code, region_name, itm_id, itm_name, unit, value',
        { head: false }
      )

    if (start) query = query.gte('prd_de', start)
    if (end) query = query.lte('prd_de', end)
    if (region && region !== 'ALL') query = query.eq('region_code', region)
    if (itm && itm !== 'ALL') query = query.eq('itm_id', itm)

    query = query
      .order('prd_de', { ascending: true })
      .order('region_code', { ascending: true })

    const { data, error } = await query.returns<Row[]>() // ← 여기!

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const csv = rowsToCsv(data ?? [])
    const now = new Date()
    const filename = `${dataset}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
