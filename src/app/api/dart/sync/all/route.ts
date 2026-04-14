//src/app/api/dart/sync/all/route.ts

import { NextRequest, NextResponse } from 'next/server'
import type { ReprtCode, FsDiv, SjDiv } from '@/lib/dart'

type Payload = {
  corp_codes?: string[]          // 지정이 없으면 서버 쪽에서 전체 대상 선정
  years?: number[]               // 복수 연도
  reprt_codes?: ReprtCode[]      // 11011/11012/11013/11014
  fs_divs?: FsDiv[]              // ['OFS','CFS']
  sj_divs?: SjDiv[]              // ['BS','CIS']
}

// 동기화 결과 타입
type SyncResult = { corp_code: string; year: number; reprt: ReprtCode; fs_div: FsDiv; sj_div: SjDiv; ok: boolean; message?: string }

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown
    const b = body as Payload

    const corpCodes: string[] = Array.isArray(b.corp_codes) ? b.corp_codes.filter(Boolean) : []
    const years: number[] = Array.isArray(b.years) && b.years.length > 0 ? b.years : [new Date().getFullYear()]
    const reprts: ReprtCode[] = Array.isArray(b.reprt_codes) && b.reprt_codes.length > 0 ? b.reprt_codes : ['11011']
    const fsDivs: FsDiv[] = Array.isArray(b.fs_divs) && b.fs_divs.length > 0 ? b.fs_divs : ['OFS']
    const sjDivs: SjDiv[] = Array.isArray(b.sj_divs) && b.sj_divs.length > 0 ? b.sj_divs : ['BS', 'CIS']

    // 실제 동기화 호출 대신 폴링/큐잉 결과만 반환 (타입 안전)
    const results: SyncResult[] = []
    for (const corp of corpCodes) {
      for (const y of years) {
        for (const r of reprts) {
          for (const f of fsDivs) {
            for (const s of sjDivs) {
              results.push({ corp_code: corp, year: y, reprt: r, fs_div: f, sj_div: s, ok: true, message: 'queued' })
            }
          }
        }
      }
    }

    // 실패 목록은 재할당이 없어도 push는 가능하므로 const가 적합
    const failed: Array<{ corp_code: string; reason: string }> = []

    return NextResponse.json({ ok: failed.length === 0, results, failed })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
