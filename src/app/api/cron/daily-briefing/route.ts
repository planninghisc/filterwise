// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidCronSecret } from '@/lib/requireCronOrSession'
import { getStockInfo } from '@/lib/naverStock'
import { MAIN_MENU } from '@/lib/telegram/bot'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getKSTDate() {
  const now = new Date();
  return new Date(now.getTime() + (9 * 60 * 60 * 1000));
}

function getKSTDateString(date: Date) {
  return date.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    if (!isValidCronSecret(request)) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          hint: 'Use Authorization: Bearer <CRON_SECRET_KEY> or X-Cron-Secret: <CRON_SECRET_KEY>',
        },
        { status: 401 },
      )
    }

    const { data: subsData } = await supabase
      .from('telegram_subscribers')
      .select('chat_id')
      .eq('is_active', true)
    
    const subscriberIds = subsData?.map(s => s.chat_id) || []
    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    const kstNow = getKSTDate();
    const todayLabel = getKSTDateString(kstNow);
    
    const kstYesterday = new Date(kstNow);
    kstYesterday.setDate(kstYesterday.getDate() - 1);
    const yesterdayLabel = getKSTDateString(kstYesterday);

    const startISO = `${todayLabel}T00:00:00+09:00`
    const endISO = `${todayLabel}T23:59:59+09:00`
    const { count: todayCount } = await supabase.from('news_articles').select('*', { count: 'exact', head: true }).gte('published_at', startISO).lte('published_at', endISO)
    const newsCount = todayCount || 0;

    const yStartISO = `${yesterdayLabel}T00:00:00+09:00`
    const yEndISO = `${yesterdayLabel}T23:59:59+09:00`
    const { count: yesterdayCount } = await supabase.from('news_articles').select('*', { count: 'exact', head: true }).gte('published_at', yStartISO).lte('published_at', yEndISO)
    
    const yCount = yesterdayCount || 0;
    const diffCount = newsCount - yCount;
    
    // ✅ [수정] "전일비" 멘트 추가 및 부호 처리
    const diffSign = diffCount > 0 ? '+' : '';
    const diffNewsStr = `(전일비 ${diffSign}${diffCount})`;

    const stock = await getStockInfo();
    let stockStr = '';
    
    if (stock) {
        const { price, diff, rate, date } = stock;
        const shortDate = date.slice(5); 
        const sign = diff > 0 ? '+' : ''; 
        
        // ✅ [수정] 이모지 제거, 부호만 표시
        stockStr = `📈 한화투자증권 주가 (${shortDate} 기준)\n`
                 + `   └ ${price.toLocaleString()}원 ${sign}${diff} (${sign}${rate}%)`;
    } else {
        stockStr = `📈 주가 정보\n   └ 정보 수신 실패`;
    }

    let successCount = 0;
    let failedList: { chat_id: number, reason: string }[] = [];

    if (newsCount > 0) {
      const linkUrl = `${BASE_URL}/news/daily-summary?date=${todayLabel}`

      const message = `🌅 <b>[오늘의 뉴스 브리핑]</b>\n\n`
        + `📅 기준: ${todayLabel}\n\n`
        + `📰 발행된 뉴스: 총 ${newsCount}건 ${diffNewsStr}\n\n` 
        + `${stockStr}\n\n`
        + `👇 아래 링크에서 상세 내용을 확인하세요.\n` 
        + `<a href="${linkUrl}">🔗 오늘의 브리핑 보러가기</a>`

      const results = await Promise.all(subscriberIds.map(async (chat_id) => {
          try {
            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // reply_markup: 매일 브리핑으로 하단 메뉴 버튼을 최신 상태로 맞춘다
                body: JSON.stringify({ chat_id: chat_id, text: message, parse_mode: 'HTML', reply_markup: MAIN_MENU })
            })

            const json = await res.json()

            if (!json.ok) return { success: false, chat_id, reason: json.description }
            return { success: true, chat_id }
          } catch (e: any) {
            return { success: false, chat_id, reason: e.message || 'Network Error' }
          }
      }))

      results.forEach(r => {
          if (r.success) successCount++;
          else failedList.push({ chat_id: r.chat_id, reason: r.reason || 'Unknown' });
      });
    }

    return NextResponse.json({ 
      success: true, 
      query_date: todayLabel,
      news_count: newsCount,
      send_result: {
          total_targets: subscriberIds.length,
          success: successCount,
          failed: failedList.length,
          failed_details: failedList
      }
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}