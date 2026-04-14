// src/app/api/weekly-ir/data/route.ts
import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

function addDaysUTC(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

async function fetchKrxClosingPrice(code: string, dateStr: string) {
  const apiKey = process.env.KRX_API_KEY;
  if (!apiKey) return null; 
  
  const yyyymmdd = dateStr.replace(/-/g, '');
  const baseUrl = 'https://openapi.krx.co.kr/openapi/v1/equities/marketdata';
  
  try {
    const res = await fetch(`${baseUrl}?basDd=${yyyymmdd}&isuSrtCd=${code}`, {
      headers: { 'AUTH_KEY': apiKey }
    });
    if (!res.ok) return null;
    
    const json = await res.json();
    if (json.OutBlock_1 && json.OutBlock_1.length > 0) {
       const priceStr = json.OutBlock_1[0].clpr || json.OutBlock_1[0].TDD_CLSPRC; 
       if (!priceStr) return null;
       return parseFloat(priceStr.toString().replace(/,/g, ''));
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function getAccurateWeekData(krxCode: string, yahooCode: string, period1: string, period2: string, weekDays: string[]) {
  let fallbackMap = new Map();
  try {
    const yData = await yahooFinance.historical(yahooCode, { period1, period2 });
    yData.forEach((d: any) => fallbackMap.set(d.date.toISOString().split('T')[0], d.close));
  } catch(e) {}

  const result = [];
  for (const d of weekDays) {
     let close = await fetchKrxClosingPrice(krxCode, d);
     if (close === null) close = fallbackMap.get(d) || null; 
     if (close !== null) result.push({ date: new Date(d), close });
  }
  return result;
}

function calculateReturn(data: any[]) {
  if (!data || data.length === 0) return { start: 0, end: 0, diff: 0, rate: 0, startDate: '-', endDate: '-' };

  data.sort((a, b) => a.date.getTime() - b.date.getTime());

  const first = data[0];
  const last = data[data.length - 1];
  const diff = last.close - first.close;
  const rate = first.close !== 0 ? (diff / first.close) * 100 : 0;
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  return {
    start: Number(first.close.toFixed(2)),
    end: Number(last.close.toFixed(2)),
    diff: Number(diff.toFixed(2)),
    rate: Number(rate.toFixed(2)),
    startDate: fmt(first.date),
    endDate: fmt(last.date)
  };
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 });

    const prevMonday = addDaysUTC(date, -7);
    const prevFriday = addDaysUTC(date, -3);
    const period1 = addDaysUTC(prevMonday, -1);
    const period2 = addDaysUTC(prevFriday, +2);

    const weekDays = [];
    for (let i = 7; i >= 3; i--) weekDays.push(addDaysUTC(date, -i));

    const [
      hanwhaData, yuantaData, kyoboData, shinyoungData, hyundaiData,
      kospiRaw, sp500Raw, shanghaiRaw, hceRaw
    ] = await Promise.all([
      getAccurateWeekData('003530', '003530.KS', period1, period2, weekDays),
      getAccurateWeekData('003470', '003470.KS', period1, period2, weekDays),
      getAccurateWeekData('030610', '030610.KS', period1, period2, weekDays),
      getAccurateWeekData('001720', '001720.KS', period1, period2, weekDays),
      getAccurateWeekData('001500', '001500.KS', period1, period2, weekDays),
      yahooFinance.historical('^KS11', { period1, period2 }).catch(() => []),
      yahooFinance.historical('^GSPC', { period1, period2 }).catch(() => []),
      yahooFinance.historical('000001.SS', { period1, period2 }).catch(() => []),
      yahooFinance.historical('^HSCE', { period1, period2 }).catch(() => [])
    ]);

    const hanwha = calculateReturn(hanwhaData);
    const yuanta = calculateReturn(yuantaData);
    const kyobo = calculateReturn(kyoboData);
    const shinyoung = calculateReturn(shinyoungData);
    const hyundai = calculateReturn(hyundaiData);
    const kospi = calculateReturn(kospiRaw);
    const sp500 = calculateReturn(sp500Raw);
    const shanghai = calculateReturn(shanghaiRaw);
    const hce = calculateReturn(hceRaw);

    const stock_data = {
      hanwha, yuanta, kyobo, shinyoung, hyundai, kospi, sp500, shanghai, hce
    };

    const sign = (num: number) => num > 0 ? `+${num}` : `${num}`;
    const signPct = (num: number) => num > 0 ? `+${num.toFixed(2)}` : `${num.toFixed(2)}`;
    const hwDirection = hanwha.diff > 0 ? '상승' : '하락';

    // ✅ 지수 및 수급 수기 입력을 위한 템플릿 기호 적용
    const market_text =
`- 당사 주간 주가는 ${Math.abs(hanwha.diff)}원 ${hwDirection}(${signPct(hanwha.rate)}%) ${hanwha.end}원으로 마감. 증권업종지 대비 {증권업대비}%로 {강세약세} 시현, 수급(${hanwha.startDate}~${hanwha.endDate}): 외인({외인수급}만주), 기관({기관수급}만주), 개인({개인수급}만주)
- 주간 경쟁사 상승/하락률: 유안타(${signPct(yuanta.rate)}%), 교보(${signPct(kyobo.rate)}%), 신영(${signPct(shinyoung.rate)}%), 현대차(${signPct(hyundai.rate)}%)
- 주간 증권업종지수는 {증권등락}pt({증권등락률}%)로 {증권종가}pt로 마감
- 주간 S&P500 지수는 ${sign(sp500.diff)}pt(${signPct(sp500.rate)}%)로 ${sp500.end}pt로 마감
- 주간 상해종합지수는 ${sign(shanghai.diff)}pt(${signPct(shanghai.rate)}%)로 ${shanghai.end}pt로 마감
- 주간 홍콩H 지수는 ${sign(hce.diff)}pt(${signPct(hce.rate)}%)로 ${hce.end}pt로 마감
- 주간 KOSPI지수는 ${sign(kospi.diff)}pt(${signPct(kospi.rate)}%)로 ${kospi.end}pt로 마감`;

    const raw_data = weekDays.map((d) => {
      const findClose = (arr: any[]) => {
        const item = arr.find(x => x.date.toISOString().split('T')[0] === d);
        return item ? item.close : '-';
      };
      return {
        date: d,
        hanwha: findClose(hanwhaData),
        yuanta: findClose(yuantaData),
        kyobo: findClose(kyoboData),
        shinyoung: findClose(shinyoungData),
        hyundai: findClose(hyundaiData),
        kospi: findClose(kospiRaw),
        sp500: findClose(sp500Raw),
        shanghai: findClose(shanghaiRaw),
        hce: findClose(hceRaw),
      };
    });

    return NextResponse.json({
      success: true,
      data: { stock_data, market_text, raw_data }
    });

  } catch (error: any) {
    console.error('Weekly IR data error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}