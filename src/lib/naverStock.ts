// src/lib/naverStock.ts
// 네이버 금융 일별 시세 (finance.naver.com/item/sise_day.naver 는 2026-09 서비스 종료 → Npay 증권 모바일 API 사용)
import axios from 'axios'

export type DailyPrice = {
  /** YYYY.MM.DD (구 sise_day 페이지 포맷 유지) */
  date: string
  price: number
  /** 전일 대비 (네이버 공식 값, 권리락 등 기준가 조정 반영) */
  diff: number
  /** 등락률(%) 문자열, 예: "-1.98" */
  rate: string
}

type NaverPriceRow = {
  localTradedAt?: string
  closePrice?: string
  compareToPreviousClosePrice?: string
  fluctuationsRatio?: string
}

/** 최근 거래일부터 내림차순으로 반환 */
export async function fetchDailyPrices(code: string, count = 10): Promise<DailyPrice[]> {
  const url = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/price?pageSize=${count}&page=1`
  const { data } = await axios.get<NaverPriceRow[]>(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  })
  if (!Array.isArray(data)) return []

  return data
    .map((row) => ({
      date: String(row.localTradedAt ?? '').replace(/-/g, '.'),
      price: parseInt(String(row.closePrice ?? '').replace(/,/g, ''), 10),
      diff: parseInt(String(row.compareToPreviousClosePrice ?? '').replace(/,/g, ''), 10),
      rate: Number(row.fluctuationsRatio ?? NaN).toFixed(2),
    }))
    .filter((row) => row.date.length === 10 && Number.isFinite(row.price) && Number.isFinite(row.diff) && row.rate !== 'NaN')
}

/** 텔레그램 브리핑용: 최근 거래일 종가와 전일 대비 */
export async function getStockInfo(code = '003530') {
  try {
    const [latest] = await fetchDailyPrices(code, 1)
    if (!latest) return null

    return { price: latest.price, diff: latest.diff, rate: latest.rate, date: latest.date }
  } catch (e) {
    console.error(e)
    return null
  }
}
