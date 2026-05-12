// src/app/api/macro/update/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateContentWithResilience } from '@/lib/geminiGenerate';
import { macroModelOrderFromId } from '@/lib/macroAiOptions';
import {
  applyMacroPromptTemplate,
  buildMacroPromptCtx,
  DEFAULT_MACRO_PROMPT_TEMPLATE,
} from '@/lib/macroAiPromptTemplate';
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
    const msg = String(error?.message ?? 'unknown error').replace(/\s+/g, ' ').trim();
    apiErrorLogs.push(`${symbol}: ${msg.substring(0, 80)}`);
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

/** 네이버 금융 일별 매매기준율 — Yahoo KRW=X 실패·날짜 불일치 시에도 국내 시세 확보 */
async function fetchNaverUsdKrw(days: number) {
  const result = new Map<string, { close: number }>();
  const maxPages = Math.ceil(days / 10) + 3;

  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(
        `https://finance.naver.com/marketindex/exchangeDailyQuote.naver?marketindexCd=FX_USDKRW&page=${page}`
      );
      const html = await res.text();

      const rowRegex =
        /<tr[^>]*>\s*<td class="date">\s*([\d]{4}\.[\d]{2}\.[\d]{2})\s*<\/td>\s*<td class="num">\s*([\d,\.]+)\s*<\/td>/g;
      let match;
      let count = 0;

      while ((match = rowRegex.exec(html)) !== null) {
        const dateStr = match[1].replace(/\./g, '-');
        const val = parseFloat(match[2].replace(/,/g, ''));
        if (Number.isFinite(val)) {
          result.set(dateStr, { close: val });
          count++;
        }
      }

      if (count === 0) break;
    }
  } catch (e: any) {
    console.warn('[Naver] USD/KRW 수집 실패:', e.message);
    apiErrorLogs.push(`USD/KRW수집실패: ${e.message.substring(0, 30)}`);
  }
  return result;
}

export async function POST(request: Request) {
  apiErrorLogs = []; 
  
  try {
    let promptTemplateOverride: string | undefined;
    let geminiModelOptionId: string | undefined;
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        if (typeof body?.promptTemplate === 'string') {
          promptTemplateOverride = body.promptTemplate;
        }
        if (typeof body?.geminiModelOptionId === 'string') {
          geminiModelOptionId = body.geminiModelOptionId;
        }
      } catch {
        /* 본문 없음/파싱 실패 시 쿼리만으로 진행 */
      }
    }

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

    const [kospiData, usdKrwData, us10yData, kr3Map, usdNaverMap] = await Promise.all([
      fetchHistorySafe('^KS11', queryOptions),
      fetchHistorySafe('KRW=X', queryOptions),
      fetchHistorySafe('^TNX', queryOptions),
      fetchNaverBond3Y(fetchRange + 10),
      fetchNaverUsdKrw(fetchRange + 15),
    ]);

    // KRW=X는 종종 빈 응답/간헐 에러가 있어도 네이버 환율 데이터가 있으면 실질 영향이 없음.
    // 사용자 경고 문구에서 중복 불안을 줄이기 위해 해당 경고는 제거.
    if (usdNaverMap.size > 0) {
      apiErrorLogs = apiErrorLogs.filter((log) => !log.startsWith('KRW=X:'));
    }

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
    const usdYahooMap = makeMap(usdKrwData);
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
      const usdClose =
        getValue(usdNaverMap, d, 'close') ?? getValue(usdYahooMap, d, 'close');
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

    const periodTyped =
      period === 'weekly' || period === 'monthly' ? period : 'daily';

    const promptCtx = buildMacroPromptCtx({
      period: periodTyped,
      startDate,
      endDate,
      previousData: {
        kospi_index: previousData.kospi_index,
        usd_krw: previousData.usd_krw,
        kr_bond_3y: previousData.kr_bond_3y,
        us_bond_10y: previousData.us_bond_10y,
      },
      latestData: {
        kospi_index: latestData.kospi_index,
        usd_krw: latestData.usd_krw,
        kr_bond_3y: latestData.kr_bond_3y,
        us_bond_10y: latestData.us_bond_10y,
      },
      newsContext,
    });

    const template =
      promptTemplateOverride != null && promptTemplateOverride.trim().length > 0
        ? promptTemplateOverride
        : DEFAULT_MACRO_PROMPT_TEMPLATE;
    const prompt = applyMacroPromptTemplate(template, promptCtx);

    const modelOrder = macroModelOrderFromId(geminiModelOptionId);
    const { text: aiText, modelUsed } = await generateContentWithResilience(genAI, prompt, {
      modelOrder,
    });

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
      data: latestData,
      modelUsed,
    });

  } catch (error: any) {
    console.error('Macro update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}