// src/app/api/stock/history/route.ts
import { NextResponse } from 'next/server';
import { fetchDailyPrices } from '@/lib/naverStock';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code') || '003530'; // 기본값: 한화투자증권

    // 최근 10거래일 종가 (최근 7일 추이에 충분)
    const rows = await fetchDailyPrices(code, 10);

    // 날짜 포맷 변환 (2025.12.31 -> 2025-12-31)
    const data = rows.map((r) => ({ date: r.date.replace(/\./g, '-'), price: r.price }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
