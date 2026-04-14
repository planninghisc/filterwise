// src/app/api/cron/kosis/route.ts
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * 매일 09:00 KST(= 00:00 UTC)에 실행되도록 vercel.json 크론을 설정하고,
 * 이 라우트는 "해당 월의 10번째 영업일(주말 제외)"인 날에만 동작합니다.
 * - 그 날이면: 전월(YYYYMM)을 계산하여 각 데이터셋을 /api/kosis/import 로 호출
 * - 그 외 날이면: 'skipped' 응답
 *
 * 쿼리 파라미터(수동 테스트용):
 * - ?force=1      → 10영업일 조건 무시하고 즉시 실행
 * - ?ym=YYYYMM    → 기준 연월 강제(전월 계산 무시). ex) ym=202507 이면 2025-07 자체를 수집
 * - ?dryRun=1     → import 라우트로 dryRun=1 전달 (DB 미적재, 미리보기)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const force = ['1', 'true', 'yes', 'y'].includes((url.searchParams.get('force') ?? '').toLowerCase())
    const dryRun = ['1', 'true', 'yes', 'y'].includes((url.searchParams.get('dryRun') ?? '').toLowerCase())
    const ymOverride = url.searchParams.get('ym') ?? undefined

    // 1) 오늘이 KST 기준 몇 일인지 계산
    const nowKst = toKstDate(new Date())
    const is10thBizDay = isNthBusinessDay(nowKst, 10) // 주말만 제외(공휴일 제외)
    const origin = new URL(req.url).origin

    // 2) 수집 대상 연월(YYYYMM) 결정
    const targetYm = ymOverride
      ? ymOverride
      : yyyymm(addMonths(nowKst, -1)) // 전월

    // 3) 10영업일 조건 확인
    if (!force && !is10thBizDay) {
      return NextResponse.json({
        ok: true,
        status: 'skipped',
        reason: 'Not 10th business day (KST). Use ?force=1 to override.',
        todayKst: isoDate(nowKst),
        targetYm,
      })
    }

    // 4) 데이터셋 호출 설정
    //  - orgId/tblId는 환경변수로 관리하시길 권장합니다(하드코딩 지양).
    //  - 없는 경우, 아래 기본값을 사용(필요 시 수정).
    const datasets: Array<{
      name: 'hcsi' | 'unsold' | 'unsold_after',
      orgId: string,
      tblId: string,
      params: Record<string, string | undefined>
    }> = [
      {
        name: 'hcsi',
        orgId: process.env.KOSIS_HCSI_ORG_ID || '',
        tblId: process.env.KOSIS_HCSI_TBL_ID || '',
        // ALL이 허용되는 유형(프로젝트 기존 동작 기준)
        params: {
          prdSe: 'M',
          regionKey: 'C1',
          itmId: 'ALL',
          objL1: 'ALL',
          objL2: undefined,
          objL3: undefined,
        },
      },
      {
        name: 'unsold',
        orgId: process.env.KOSIS_UNSOLD_ORG_ID || '',
        tblId: process.env.KOSIS_UNSOLD_TBL_ID || '',
        // ALL이 허용되는 유형(프로젝트 기존 동작 기준)
        params: {
          prdSe: 'M',
          regionKey: 'C2',
          itmId: 'ALL',
          objL1: 'ALL',
          objL2: 'ALL',
        },
      },
      {
        name: 'unsold_after',
        orgId: process.env.KOSIS_UNSOLD_AFTER_ORG_ID || '116',
        tblId: process.env.KOSIS_UNSOLD_AFTER_TBL_ID || 'DT_MLTM_5328',
        // 공사완료후 미분양(민간/전국) — 필요 시 환경변수로 바꾸세요.
        params: {
          prdSe: 'M',
          regionKey: 'C2',
          itmId: process.env.KOSIS_UNSOLD_AFTER_ITM_ID || '13103871088T1',
          objL1: process.env.KOSIS_UNSOLD_AFTER_OBJL1 || '13102871088A.0001', // 전국
          objL2: process.env.KOSIS_UNSOLD_AFTER_OBJL2 || '13102871088B.0001', // 민간부문
          objL3: process.env.KOSIS_UNSOLD_AFTER_OBJL3 || '13102871088C.0001 13102871088C.0003',
          objL4: process.env.KOSIS_UNSOLD_AFTER_OBJL4 || '13102871088D.0003',
          // objL5..objL8 필요시 env로 추가
        },
      },
    ]

    // 5) 유효성 체크
    const invalid = datasets.filter(d => !d.orgId || !d.tblId)
    if (invalid.length > 0) {
      return NextResponse.json({
        ok: false,
        error: 'Missing orgId/tblId for some datasets. Set env vars.',
        missing: invalid.map(d => d.name),
        hint: [
          'KOSIS_HCSI_ORG_ID, KOSIS_HCSI_TBL_ID',
          'KOSIS_UNSOLD_ORG_ID, KOSIS_UNSOLD_TBL_ID',
          'KOSIS_UNSOLD_AFTER_ORG_ID, KOSIS_UNSOLD_AFTER_TBL_ID',
        ],
      }, { status: 400 })
    }

    // 6) 각 데이터셋을 내부 import 라우트로 호출
    const results = await Promise.allSettled(
      datasets.map(async (d) => {
        const importUrl = new URL('/api/kosis/import', origin)
        importUrl.searchParams.set('dataset', d.name)
        importUrl.searchParams.set('orgId', d.orgId)
        importUrl.searchParams.set('tblId', d.tblId)
        importUrl.searchParams.set('prdSe', d.params.prdSe || 'M')
        importUrl.searchParams.set('startPrdDe', targetYm)
        importUrl.searchParams.set('endPrdDe', targetYm)
        importUrl.searchParams.set('regionKey', d.params.regionKey || '')
        if (dryRun) importUrl.searchParams.set('dryRun', '1')

        // 선택 파라미터 주입(값이 있으면만)
        for (const [k, v] of Object.entries(d.params)) {
          if (!v) continue
          if (['prdSe', 'regionKey'].includes(k)) continue // 이미 위에서 주입
          importUrl.searchParams.set(k, v)
        }

        const res = await fetch(importUrl.toString(), { cache: 'no-store' })
        const json = await res.json().catch(() => ({ ok: false, error: 'parse-failed' }))
        return {
          dataset: d.name,
          status: res.status,
          ok: json?.ok === true,
          body: json,
          url: importUrl.toString(),
        }
      })
    )

    const summary = results.map((r) => {
      if (r.status === 'fulfilled') return r.value
      return { dataset: 'unknown', status: 500, ok: false, body: { error: String(r.reason) } }
    })

    // 7) 응답
    return NextResponse.json({
      ok: true,
      ran: true,
      todayKst: isoDate(nowKst),
      targetYm,
      dryRun,
      results: summary,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

/* ===== 날짜/시간 유틸 (KST 기준) ===== */

function toKstDate(d: Date): Date {
  // UTC 기준 밀리초 + 9시간
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  // "현지" 자정 정렬 (시/분/초 0)
  return new Date(kst.getFullYear(), kst.getMonth(), kst.getDate())
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function yyyymm(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(d: Date, diff: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + diff, 1)
}

/** 해당 달의 N번째 영업일(주말 제외)인지 판정 */
function isNthBusinessDay(todayKst: Date, n: number): boolean {
  const y = todayKst.getFullYear()
  const m = todayKst.getMonth()
  let count = 0
  for (let day = 1; day <= 31; day++) {
    const t = new Date(y, m, day)
    if (t.getMonth() !== m) break
    if (isWeekend(t)) continue
    count++
    if (t.getDate() === todayKst.getDate()) {
      return count === n
    }
  }
  return false
}

function isWeekend(d: Date): boolean {
  const wd = d.getDay() // 0:일, 6:토
  return wd === 0 || wd === 6
}
