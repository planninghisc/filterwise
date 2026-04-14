// src/app/api/fsc/press/db/route.ts
// API 라우트 ③: DB 조회 (UI에서 사용)
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DbRow = {
  id: string
  title: string
  department: string | null
  views: number | null
  date: string
  url: string
  attachments: { name: string; url: string }[] | null
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url)
    const startDate = u.searchParams.get('start') || ''
    const endDate = u.searchParams.get('end') || ''
    const subject = (u.searchParams.get('subject') || '').trim()

    let q = supabase
      .from('fsc_press')
      .select('*')
      .order('date', { ascending: false })

    if (startDate && endDate) {
      q = q.gte('date', startDate).lte('date', endDate)
    } else if (startDate) {
      q = q.gte('date', startDate)
    } else if (endDate) {
      q = q.lte('date', endDate)
    }

    if (subject) {
      // 간단 like 검색
      q = q.ilike('title', `%${subject}%`)
    }

    const { data, error } = await q
    if (error) throw error

    const rows: DbRow[] = (data ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      department: r.department ? String(r.department) : null,
      views: r.views != null ? Number(r.views) : null,
      date: String(r.date),
      url: String(r.url),
      attachments: (r.attachments as DbRow['attachments']) ?? null,
    }))

    return NextResponse.json({
      ok: true,
      period: { startDate: startDate || null, endDate: endDate || null },
      resultCnt: rows.length,
      result: rows,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
