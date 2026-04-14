// src/app/api/stock/history/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code') || '003530'; // 기본값: 한화투자증권

    // 네이버 금융 '일별 시세' 페이지 (1페이지 = 최근 10일치)
    // 필요하면 page=2 까지 긁어도 되지만, 최근 7일 추이에는 1페이지면 충분합니다.
    const url = `https://finance.naver.com/item/sise_day.naver?code=${code}&page=1`;

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    // 네이버 금융은 EUC-KR 이므로 디코딩 필요
    const html = iconv.decode(Buffer.from(response.data), 'euc-kr');
    const $ = cheerio.load(html);

    const data: { date: string; price: number }[] = [];

    // 테이블 파싱
    $('table.type2 tr').each((_, el) => {
      const dateStr = $(el).find('td:nth-child(1) span').text().trim();
      const priceStr = $(el).find('td:nth-child(2) span').text().trim();

      if (dateStr && priceStr) {
        // 날짜 포맷 변환 (2025.12.31 -> 2025-12-31)
        const date = dateStr.replace(/\./g, '-');
        // 가격 쉼표 제거 (3,450 -> 3450)
        const price = parseInt(priceStr.replace(/,/g, ''), 10);
        
        data.push({ date, price });
      }
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}