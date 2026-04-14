// src/app/api/cron/news-alert/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 
import crypto from 'crypto'

export const maxDuration = 60 
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateTitleHash(title: string) {
  return crypto.createHash('md5').update(title).digest('hex');
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keywords = ['한화투자증권', '한화증권'] // 혹은 DB에서 가져오기
    const debugLogs: any[] = []

    for (const keyword of keywords) {
      // 1. 뉴스 수집 (인코딩 해결된 버전)
      const articles = await fetchNaverNews(keyword)
      
      const articlesToSave: any[] = [] 

      for (const article of articles) {
        // 이미 저장된 건지 확인 (URL 또는 해시)
        const titleHash = generateTitleHash(article.title);
        
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .or(`source_url.eq.${article.link},title_hash.eq.${titleHash}`)
          .maybeSingle()

        if (!existing) {
           articlesToSave.push({
             title: article.title, 
             // [중요] 긁어온 본문(fullContent)을 저장, 없으면 description 사용
             content: article.fullContent || article.description, 
             publisher: 'Naver Search', 
             source_url: article.link, 
             published_at: new Date(article.pubDate).toISOString(),
             title_hash: titleHash
           })
        }
      }

      // DB 저장
      if (articlesToSave.length > 0) {
        const { error } = await supabase.from('news_articles').insert(articlesToSave)
        if(error) console.error('Insert Error:', error)
      }

      debugLogs.push({ keyword, fetched: articles.length, new_saved: articlesToSave.length })
    }

    return NextResponse.json({ success: true, logs: debugLogs })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}