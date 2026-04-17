// src/app/api/dart/employees/route.ts
// OpenDART empSttus.json — 정기보고서 직원 현황 (임직원 수)
import { NextRequest, NextResponse } from 'next/server'
import type { ReprtCode } from '@/lib/dart'
import { fetchDartEmployeeHeadcount } from '@/lib/dartEmpSttus'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const corpCodes = (searchParams.get('corp_codes') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (corpCodes.length === 0) {
      return NextResponse.json({ ok: false, error: 'corp_codes가 필요합니다.' }, { status: 400 })
    }

    const items: Array<{ corp_code: string; headcount: number | null; note?: string }> = []
    for (const corp_code of corpCodes) {
      try {
        const r = await fetchDartEmployeeHeadcount(corp_code, year, reprt)
        items.push({ corp_code, headcount: r.count, note: r.note })
        await new Promise((res) => setTimeout(res, 120))
      } catch (e: unknown) {
        items.push({
          corp_code,
          headcount: null,
          note: e instanceof Error ? e.message : 'error',
        })
      }
    }

    return NextResponse.json({ ok: true, year, reprt, items })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
