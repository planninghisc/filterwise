// src/app/api/news/test-fetch/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 

// 이 API는 브라우저에서 바로 접속해서 결과를 보기 위해 인증을 뺐습니다.
// (배포 후에는 삭제하거나 관리자 권한을 넣는 게 좋습니다)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // 1. 등록된 키워드 가져오기
    const { data: keywordData } = await supabase.from('alert_keywords').select('keyword')
    if (!keywordData || keywordData.length === 0) {
      return NextResponse.json({ message: '등록된 키워드가 없습니다.' })
    }
    const keywords = keywordData.map(k => k.keyword)

    // 결과 담을 리스트
    const logs = []

    // 2. 키워드별 시뮬레이션
    for (const keyword of keywords) {
      const articles = await fetchNaverNews(keyword)
      
      const keywordLog = {
        keyword: keyword,
        total_found: articles.length,
        items: [] as any[]
      }

      for (const article of articles) {
        const pubDate = new Date(article.pubDate)
        const now = new Date()
        const diffMinutes = (now.getTime() - pubDate.getTime()) / (1000 * 60)
        
        // 중복 체크 시뮬레이션
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('source_url', article.link)
          .single()

        let status = '✅ 발송 대상 (조건 만족)'
        if (diffMinutes > 20) status = `❌ 탈락 (시간 초과: ${Math.floor(diffMinutes)}분 전 기사)`
        else if (existing) status = '❌ 탈락 (이미 DB에 있음)'

        keywordLog.items.push({
          title: article.title.replace(/<[^>]*>?/gm, ''),
          published_at: pubDate.toLocaleTimeString(),
          time_ago: `${Math.floor(diffMinutes)}분 전`,
          status: status,
          link: article.link
        })
      }
      logs.push(keywordLog)
    }

    // JSON으로 예쁘게 보여줌
    return NextResponse.json({ 
      info: "현재 시간 기준, 서버가 판단한 뉴스 상태입니다.",
      server_time: new Date().toLocaleTimeString(),
      logs 
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}