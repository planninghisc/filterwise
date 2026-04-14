// src/app/api/news/fetch/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchNaverNews } from '@/lib/news/ingestNaver' // [변경] 새 함수 import
import crypto from 'crypto'

function generateTitleHash(title: string) {
  return crypto.createHash('md5').update(title).digest('hex');
}

export async function GET() {
  try {
    const keywords = ['한화투자증권', '한화증권']
    const debugLogs: any[] = []

    for (const keyword of keywords) {
      // 1. 뉴스 수집 (기본 10개)
      const articles = await fetchNaverNews(keyword)
      
      const articlesToSave: any[] = [] 

      for (const article of articles) {
        // 2. 중복 체크
        const titleHash = generateTitleHash(article.title);
        
        const { data: existing } = await supabaseAdmin
          .from('news_articles')
          .select('id')
          .or(`source_url.eq.${article.link},title_hash.eq.${titleHash}`)
          .maybeSingle()

        if (!existing) {
           articlesToSave.push({
             title: article.title, 
             content: article.fullContent || article.description, 
             publisher: 'Naver Search', 
             source_url: article.link, 
             published_at: new Date(article.pubDate).toISOString(),
             title_hash: titleHash
           })
        }
      }

      // 3. DB 저장
      if (articlesToSave.length > 0) {
        await supabaseAdmin.from('news_articles').insert(articlesToSave)
      }

      debugLogs.push({ keyword, fetched: articles.length, new_saved: articlesToSave.length })
    }

    return NextResponse.json({ ok: true, via: 'manual', logs: debugLogs })

  } catch (err: any) {
    console.error('[news fetch manual]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}