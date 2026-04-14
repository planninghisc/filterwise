// src/app/api/macro/update/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

function addDaysUTC(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function getPastDates(targetDate: string, days: number) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(addDaysUTC(targetDate, -i));
  }
  return dates; 
}

interface MacroRecord {
  base_date: string;
  kr_bond_3y: number;
  us_bond_10y: number;
  kospi_index: number;
  kospi_volume: number;
  usd_krw: number;
  updated_at: string;
  ai_analysis_daily?: string;
  ai_analysis_weekly?: string;
  ai_analysis_monthly?: string;
}

let apiErrorLogs: string[] = [];

async function fetchHistorySafe(symbol: string, options: any) {
  try {
    const data = await yahooFinance.historical(symbol, options);
    return data || [];
  } catch (error: any) {
    console.warn(`[Yahoo] ${symbol} 실패:`, error.message);
    apiErrorLogs.push(`${symbol}: ${error.message.substring(0, 30)}`);
    return [];
  }
}

async function fetchNaverBond3Y(days: number) {
  const result = new Map<string, any>();
  const maxPages = Math.ceil(days / 7) + 1; 
  
  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(`https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=IRR_GOVT03Y&page=${page}`);
      const html = await res.text();
      
      const rowRegex = /<td class="date">\s*([\d]{4}\.[\d]{2}\.[\d]{2})\s*<\/td>[\s\S]*?<td class="num">\s*([\d\.]+)\s*<\/td>/g;
      let match;
      let count = 0;
      
      while ((match = rowRegex.exec(html)) !== null) {
        const dateStr = match[1].replace(/\./g, '-'); 
        const val = parseFloat(match[2]);
        result.set(dateStr, { close: val });
        count++;
      }
      
      if (count === 0) break; 
    }
  } catch(e: any) {
     console.warn("[Naver] 국고채 3년물 수집 실패:", e.message);
     apiErrorLogs.push(`국고채수집실패: ${e.message.substring(0, 30)}`);
  }
  return result;
}

export async function POST(request: Request) {
  apiErrorLogs = []; 
  
  try {
    const { searchParams } = new URL(request.url);
    const targetDate = searchParams.get('date');
    const period = searchParams.get('period') || 'daily';

    if (!targetDate) {
      return NextResponse.json({ error: 'Date is required (YYYY-MM-DD)' }, { status: 400 });
    }

    let daysToFetch = 1;
    if (period === 'weekly') daysToFetch = 7;
    if (period === 'monthly') daysToFetch = 30;

    const fetchRange = Math.max(daysToFetch, 3); 
    const datesToFetch = getPastDates(targetDate, fetchRange);
    const recordsToInsert: MacroRecord[] = [];

    const period1 = new Date(addDaysUTC(targetDate, -fetchRange - 10));
    const period2 = new Date(addDaysUTC(targetDate, +1)); 

    const queryOptions = { period1, period2 };

    const [kospiData, usdKrwData, us10yData, kr3Map] = await Promise.all([
      fetchHistorySafe('^KS11', queryOptions),
      fetchHistorySafe('KRW=X', queryOptions),
      fetchHistorySafe('^TNX', queryOptions),
      fetchNaverBond3Y(fetchRange + 10) 
    ]);

    const debugMsg = `(수집범위: ${fetchRange}일)`;

    const makeMap = (data: any[]) => {
      const m = new Map<string, any>();
      data.forEach(d => {
        if (d.date) {
          const dateStr = d.date.toISOString().split('T')[0];
          m.set(dateStr, d);
        }
      });
      return m;
    };

    const kospiMap = makeMap(kospiData);
    const usdMap = makeMap(usdKrwData);
    const us10Map = makeMap(us10yData);

    const getValue = (map: Map<string, any>, targetStr: string, field: string = 'close') => {
      for (let i = 0; i < 7; i++) {
         const checkDate = addDaysUTC(targetStr, -i);
         if (map.has(checkDate)) return map.get(checkDate)[field] || map.get(checkDate)['adjClose'];
      }
      return null; 
    };

    for (const d of datesToFetch) {
      const kospiClose = getValue(kospiMap, d, 'close');
      const usdClose = getValue(usdMap, d, 'close');
      const us10Close = getValue(us10Map, d, 'close');
      const kr3Close = getValue(kr3Map, d, 'close'); 

      const kospiVolRaw = getValue(kospiMap, d, 'volume') || 0;
      const kospiVolume = kospiVolRaw > 0 ? Number((kospiVolRaw / 100000).toFixed(2)) : 9.5;

      recordsToInsert.push({
        base_date: d,
        kr_bond_3y: kr3Close ? Number(kr3Close.toFixed(3)) : 3.25, 
        us_bond_10y: us10Close ? Number(us10Close.toFixed(3)) : 4.15,
        kospi_index: kospiClose ? Number(kospiClose.toFixed(2)) : 2600,
        kospi_volume: Number(kospiVolume),
        usd_krw: usdClose ? Number(usdClose.toFixed(2)) : 1335,
        updated_at: new Date().toISOString(),
      });
    }

    recordsToInsert.sort((a, b) => new Date(a.base_date).getTime() - new Date(b.base_date).getTime());
    const latestData = recordsToInsert[recordsToInsert.length - 1]; 
    
    let previousData;
    if (period === 'daily') {
      previousData = recordsToInsert[recordsToInsert.length - 2]; 
    } else if (period === 'weekly') {
      previousData = recordsToInsert[recordsToInsert.length - Math.min(7, recordsToInsert.length)];
    } else {
      previousData = recordsToInsert[0];
    }
    
    if (!previousData) previousData = latestData;

    // ✅ 핵심 추가: 해당 기간의 DB 뉴스 조회 로직
    const startDate = previousData.base_date;
    const endDate = latestData.base_date;
    
    const { data: newsData } = await supabaseAdmin
      .from('news_articles')
      .select('title, category, publisher')
      .gte('published_at', `${startDate} 00:00:00`)
      .lte('published_at', `${endDate} 23:59:59`)
      .order('published_at', { ascending: false })
      .limit(30); // 너무 많으면 토큰 초과하므로 30개로 제한

    let newsContext = '수집된 주요 뉴스가 없습니다.';
    if (newsData && newsData.length > 0) {
      newsContext = newsData.map(n => `- [${n.category || '뉴스'}] ${n.title} (${n.publisher || '언론사'})`).join('\n');
    }

    // ✅ 핵심 수정: 프롬프트에 뉴스를 주입하고 스토리텔링 지시
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `
      너는 한국 대형 증권사의 전사 기획팀 책임자야.
      단순히 숫자를 읊어주는 수준을 넘어서, '국제 정세, 국내 정책, 주요 이벤트'가 시장 지표에 어떤 영향을 미쳤는지 입체적으로 분석해야 해.

      [기간: ${startDate} ~ ${endDate}]
      
      [1. 거시경제 지표 변화]
      - KOSPI 지수: ${previousData.kospi_index}pt -> ${latestData.kospi_index}pt
      - 원/달러 환율: ${previousData.usd_krw}원 -> ${latestData.usd_krw}원
      - 국고채 3년물: ${previousData.kr_bond_3y.toFixed(3)}% -> ${latestData.kr_bond_3y.toFixed(3)}%
      - 미국 10년물: ${previousData.us_bond_10y.toFixed(3)}% -> ${latestData.us_bond_10y.toFixed(3)}%

      [2. 해당 기간 주요 뉴스 및 이벤트 (DB 수집 데이터)]
      ${newsContext}

      위 지표와 뉴스를 종합하여 다음 두 가지를 작성해 줘:
      1. ${period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 시장 흐름 요약: 단순 수치 나열은 절대 금지! 제공된 '주요 뉴스'에서 드러난 이벤트나 이슈(예: 금리 결정, 미국 지표 발표, 지정학적 리스크, 특정 산업 호재 등)를 지표의 변동과 엮어서 스토리텔링 형식으로 3~4문장 요약해.
      2. 기획팀 시사점: 이러한 매크로 및 이슈 환경이 증권사 주요 수익원(브로커리지, 채권운용, IB 등)에 미칠 구체적인 영향과 기획팀 차원의 대응 포인트를 도출해 줘 (불릿 포인트 2개).
      마크다운을 쓰지 말고, 평문과 기호(-, 1. 등)만 사용해서 간결하고 전문적인 톤으로 작성해 줘.
    `;

    const result = await model.generateContent(prompt);
    const aiText = result.response.text();

    if (period === 'daily') latestData.ai_analysis_daily = aiText;
    if (period === 'weekly') latestData.ai_analysis_weekly = aiText;
    if (period === 'monthly') latestData.ai_analysis_monthly = aiText;

    const { error } = await supabaseAdmin
      .from('macro_indicators')
      .upsert(recordsToInsert, { onConflict: 'base_date' });

    if (error) throw error;

    let warningMsg = apiErrorLogs.length > 0 ? `\n(일부 지표 실패: ${apiErrorLogs.join(', ')})` : '';

    return NextResponse.json({ 
      success: true, 
      message: `${period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 분석 갱신 완료! ${debugMsg}${warningMsg}`,
      data: latestData 
    });

  } catch (error: any) {
    console.error('Macro update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}