// src/app/api/test-telegram/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronOrSession } from '@/lib/requireCronOrSession'
import axios from 'axios'
import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'

export const dynamic = 'force-dynamic'

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

async function getStockInfo() {
  try {
    const response = await axios.get('https://finance.naver.com/item/sise_day.naver?code=003530&page=1', {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = iconv.decode(Buffer.from(response.data), 'euc-kr');
    const $ = cheerio.load(html);
    
    const row1_date = $('table.type2 tr:nth-child(3) td:nth-child(1) span').text().trim();
    const row1_priceStr = $('table.type2 tr:nth-child(3) td:nth-child(2) span').text().trim();
    const row2_priceStr = $('table.type2 tr:nth-child(4) td:nth-child(2) span').text().trim();
    
    if (!row1_priceStr || !row2_priceStr) return null;

    const currentPrice = parseInt(row1_priceStr.replace(/,/g, ''), 10);
    const prevPrice = parseInt(row2_priceStr.replace(/,/g, ''), 10);
    
    const diff = currentPrice - prevPrice;
    const rate = ((diff / prevPrice) * 100).toFixed(2);
    
    return { price: currentPrice, diff, rate, date: row1_date };
  } catch (e) {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const denied = await requireCronOrSession(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url);
    const targetChatId = searchParams.get('chat_id');

    if (!targetChatId) {
        return NextResponse.json({ error: 'chat_id parameter is required' }, { status: 400 });
    }

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
    const diffCount = newsCount - (yesterdayCount || 0);

    // ✅ [수정] "전일비" 추가 및 부호 처리
    const diffSign = diffCount > 0 ? '+' : '';
    const diffNewsStr = `(전일비 ${diffSign}${diffCount})`;

    const stock = await getStockInfo();
    let stockStr = '';
    
    if (stock) {
        const { price, diff, rate, date } = stock;
        const shortDate = date.slice(5); 
        const sign = diff > 0 ? '+' : ''; 
        
        // ✅ [수정] 이모지 제거
        stockStr = `📈 한화투자증권 주가 (${shortDate} 기준)\n`
                 + `   └ ${price.toLocaleString()}원 ${sign}${diff} (${sign}${rate}%)`;
    } else {
        stockStr = `📈 주가 정보\n   └ 정보 수신 실패`;
    }

    const linkUrl = `${BASE_URL}/news/daily-summary?date=${todayLabel}`

    const message = `🌅 <b>[오늘의 뉴스 브리핑]</b> (테스트 발송)\n\n`
    + `📅 기준: ${todayLabel}\n\n`
    + `📰 발행된 뉴스: 총 ${newsCount}건 ${diffNewsStr}\n\n` 
    + `${stockStr}\n\n`
    + `👇 아래 링크에서 상세 내용을 확인하세요.\n` 
    + `<a href="${linkUrl}">🔗 오늘의 브리핑 보러가기</a>`

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: targetChatId, text: message, parse_mode: 'HTML' })
    })

    const result = await res.json();

    return NextResponse.json({ 
      success: result.ok,
      target_chat_id: targetChatId,
      telegram_response: result
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}