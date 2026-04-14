// src/app/api/news/list/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const days = searchParams.get('days')
    const date = searchParams.get('date')

    let query = supabase
      .from('news_articles')
      .select('*') // ✅ '*'로 해두면 category 포함 모든 컬럼을 가져오므로 안전합니다.
      .order('published_at', { ascending: false })

    // 날짜 필터링 로직
    if (date) {
      // 특정 날짜 (KST 기준)
      // DB는 UTC로 저장되므로, 해당 날짜의 00:00~23:59 (KST) 범위를 UTC로 변환해서 검색해야 정확함
      // 여기서는 간단하게 문자열 매칭이나 범위 검색을 사용
      const start = `${date}T00:00:00+09:00`
      const end = `${date}T23:59:59+09:00`
      query = query.gte('published_at', start).lte('published_at', end)
    } else {
      // 최근 N일
      const d = parseInt(days || '3', 10)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - d)
      query = query.gte('published_at', cutoffDate.toISOString())
    }

    // 최대 300개 제한 (성능 고려)
    const { data, error } = await query.limit(300)

    if (error) throw error

    // 언론사 목록 추출 (필터용)
    const publishers = Array.from(new Set(data.map((n) => n.publisher).filter(Boolean))) as string[]

    return NextResponse.json({
      ok: true,
      list: data,
      publishers: publishers.sort(),
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}