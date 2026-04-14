// src/app/api/news/backfill-7d/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 스크래핑 시간이 길어질 수 있으므로 연장

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateTitleHash(title: string) {
  return crypto.createHash('md5').update(title).digest('hex');
}

export async function GET(request: Request) {
  try {
    const keywords = ['한화투자증권', '한화증권']
    const debugLogs: any[] = []

    // 1. 기준 날짜: 오늘 포함 최근 3일 (3일 전 00:00 이후)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 3);
    cutoffDate.setHours(0, 0, 0, 0);

    // [안전장치] 무한루프 방지용 최대 수집 개수 (한 키워드당)
    const MAX_ITEMS_LIMIT = 300; 

    for (const keyword of keywords) {
      let allFetchedArticles: any[] = [];
      let start = 1;
      let hasMore = true;

      // 2. [반복 수집] 3일 치를 다 채울 때까지 계속 요청
      while (hasMore && allFetchedArticles.length < MAX_ITEMS_LIMIT) {
        // 한 번에 50개씩 가져옴 (너무 많이 가져오면 스크래핑 타임아웃 위험)
        const batch = await fetchNaverNews(keyword, 50, start);
        
        if (batch.length === 0) {
          break; // 더 이상 기사가 없으면 종료
        }

        allFetchedArticles = [...allFetchedArticles, ...batch];

        // 이번 배치의 가장 마지막 기사 날짜 확인
        const lastItem = batch[batch.length - 1];
        const lastDate = new Date(lastItem.pubDate);

        // 마지막 기사가 이미 기준일(cutoffDate)보다 옛날이면 더 가져올 필요 없음
        if (lastDate < cutoffDate) {
          hasMore = false;
        } else {
          // 아직 최신 기사들이라면 다음 페이지(start + 50) 조회
          start += 50;
        }
      }

      // 3. [필터링 & 저장] 수집된 전체 기사 중 3일 이내 것만 DB 저장
      const articlesToSave: any[] = [] 

      for (const article of allFetchedArticles) {
        const pubDate = new Date(article.pubDate);
        if (pubDate < cutoffDate) continue; // 3일 지난 건 버림

        const titleHash = generateTitleHash(article.title);
        const { data: existing } = await supabase
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
             published_at: pubDate.toISOString(),
             title_hash: titleHash
           })
        }
      }

      // 일괄 저장 (Batch Insert)
      // 데이터가 많을 수 있으므로 50개씩 나눠서 저장 추천하지만, 여기선 한 번에 시도
      if (articlesToSave.length > 0) {
        const { error } = await supabase.from('news_articles').insert(articlesToSave)
        if (error) console.error(`Save Error (${keyword}):`, error)
      }

      debugLogs.push({ 
          keyword, 
          fetched_total: allFetchedArticles.length, 
          saved_count: articlesToSave.length 
      })
    }

    return NextResponse.json({ 
        success: true, 
        message: 'Deep Backfill completed (Recent 3 days)', 
        logs: debugLogs 
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}