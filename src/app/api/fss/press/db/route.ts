// src/app/api/fss/press/db/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Row = {
  content_id: string
  subject: string | null
  publish_org: string | null
  origin_url: string | null
  view_cnt: number | null
  reg_date: string | null
  atchfile_url: string | null
  atchfile_nm: string | null
  contents_kor: string | null
}

type ApiResultItem = {
  contentId: string
  subject: string | null
  publishOrg: string | null
  originUrl: string | null
  viewCnt: number | null
  regDate: string | null
  atchfileUrl: string | null
  atchfileNm: string | null
  contentsKor: string | null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') // YYYY-MM-DD
    const endDate = searchParams.get('endDate')     // YYYY-MM-DD
    const subject = searchParams.get('subject') || ''

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required. (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    let query = supabaseAdmin
      .from('fss_press')
      .select(
        'content_id, subject, publish_org, origin_url, view_cnt, reg_date, atchfile_url, atchfile_nm, contents_kor'
      )
      .gte('reg_date', new Date(startDate + 'T00:00:00Z').toISOString())
      .lte('reg_date', new Date(endDate + 'T23:59:59Z').toISOString())
      .order('reg_date', { ascending: false })

    if (subject) {
      query = query.ilike('subject', `%${subject}%`)
    }

    const { data, error } = await query.returns<Row[]>()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const result: ApiResultItem[] = (data ?? []).map((r) => ({
      contentId: r.content_id,
      subject: r.subject,
      publishOrg: r.publish_org,
      originUrl: r.origin_url,
      viewCnt: r.view_cnt,
      regDate: r.reg_date,
      atchfileUrl: r.atchfile_url,
      atchfileNm: r.atchfile_nm,
      contentsKor: r.contents_kor,
    }))

    return NextResponse.json({
      resultCnt: result.length,
      result,
      period: { startDate, endDate },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
