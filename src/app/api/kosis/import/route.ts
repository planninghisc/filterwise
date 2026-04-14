import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required environment variable: ${name}`)
  return v
}
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, '').trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}
function incMonth(yyyymm: string): string {
  const y = Number(yyyymm.slice(0, 4))
  const m = Number(yyyymm.slice(4))
  const d = new Date(y, m - 1 + 1, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthRange(start: string, end: string): string[] {
  if (!/^\d{6}$/.test(start) || !/^\d{6}$/.test(end)) return []
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = incMonth(cur)
  }
  return out
}

/** Dev/로컬에서만 헤더 없이 접근 허용 */
function isDevBypass(req: NextRequest): boolean {
  const isDev = process.env.NODE_ENV !== 'production'
  const host = req.headers.get('host') ?? ''
  const fromLocal = /^localhost(:\d+)?$/.test(host) || /^127\.0\.0\.1(:\d+)?$/.test(host)
  return isDev && fromLocal
}

/** KOSIS 표준 응답(실데이터) 형태 */
interface KosisRow {
  ORG_ID?: string
  TBL_ID?: string
  PRD_SE?: string
  PRD_DE?: string
  ITM_ID?: string
  ITM_NM?: string
  UNIT_NM?: string
  DT?: string | number
  C1?: string
  C1_NM?: string
  C2?: string
  C2_NM?: string
  [key: string]: unknown
}

/** KOSIS 에러 응답 형태 */
interface KosisErrorBody {
  errCd?: string
  errMsg?: string
  [key: string]: unknown
}

type DatasetKey = 'hcsi' | 'unsold' | 'unsold_after'

/** 기본 파라미터 */
const DEFAULTS = {
  hcsi: {
    orgId: '390',
    tblId: 'DT_39002_02',
    prdSe: 'M',
    itmId: 'ALL',
    objL1: 'ALL',
    regionKey: 'C1' as const,
  },
  unsold: {
    orgId: '101',
    tblId: 'DT_1YL202004E',
    prdSe: 'M',
    itmId: 'ALL',
    objL1: 'ALL',
    objL2: 'ALL',
    regionKey: 'C2' as const,
  },
  unsold_after: {
    orgId: '116',
    tblId: 'DT_MLTM_5328',
    prdSe: 'M',
    regionKey: 'C2' as const,
    // 성공 사례에서 확인된 필수 계층 파라미터
    itmId: '13103871088T1',
    objL1: '13102871088A.0001',
    objL2: '13102871088B.0001',
    objL3: '13102871088C.0001 13102871088C.0003',
    objL4: '13102871088D.0003',
  },
} as const

function pickRegion(r: KosisRow, prefer: 'C1' | 'C2'): { code: string; name: string | null } {
  const order = prefer === 'C2' ? (['C2', 'C1'] as const) : (['C1', 'C2'] as const)
  for (const key of order) {
    const code = (r as Record<string, unknown>)[key]
    const name = (r as Record<string, unknown>)[`${key}_NM`]
    if (typeof code === 'string' && code !== '') {
      return { code, name: typeof name === 'string' ? name : null }
    }
  }
  return { code: '000', name: null }
}

interface CommonDbRow {
  org_id: string
  tbl_id: string
  prd_se: string
  prd_de: string
  region_code: string
  region_name: string | null
  itm_id: string
  itm_name: string | null
  unit: string | null
  value: number | null
}
interface UnsoldAfterDbRow extends CommonDbRow {
  inserted_at: string
  updated_at: string
}
interface NormalDbRow extends CommonDbRow {
  raw: KosisRow
}

type AttemptOk = { scope: string; ok: true; count: number; usedParams: Record<string, string> }
type AttemptFail = { scope: string; ok: false; error: string; usedParams: Record<string, string> }
type Attempt = AttemptOk | AttemptFail

/** 고유키 문자열 */
function keyOf(r: Pick<CommonDbRow, 'org_id' | 'tbl_id' | 'prd_de' | 'region_code' | 'itm_id'>): string {
  return `${r.org_id}|${r.tbl_id}|${r.prd_de}|${r.region_code}|${r.itm_id}`
}

/** 동일 키가 한 번의 배치에 중복 들어오지 않도록 정리 */
function dedupeRows(rows: CommonDbRow[]): CommonDbRow[] {
  const m = new Map<string, CommonDbRow>()
  for (const r of rows) {
    m.set(keyOf(r), r) // 마지막 값이 남도록 덮어쓰기
  }
  return Array.from(m.values())
}

/** 배열을 청크로 나누기 */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function GET(req: NextRequest) {
  try {
    // ── 인증 ──
    const need = requireEnv('NEWS_CRON_SECRET')
    const gotHeader = req.headers.get('x-job-secret') || req.headers.get('X-Job-Secret')
    const gotQuery = req.nextUrl.searchParams.get('secret')
    const allow = isDevBypass(req) || gotHeader === need || (gotQuery && gotQuery === need)
    if (!allow) {
      return NextResponse.json({ ok: false, status: 401, message: 'Unauthorized' }, { status: 401 })
    }

    const sp = req.nextUrl.searchParams
    const dataset = (sp.get('dataset') as DatasetKey) || 'hcsi'
    if (!['hcsi', 'unsold', 'unsold_after'].includes(dataset)) {
      return NextResponse.json({ ok: false, status: 400, message: 'invalid dataset' }, { status: 400 })
    }

    const def = DEFAULTS[dataset]
    const orgId = sp.get('orgId') || def.orgId
    const tblId = sp.get('tblId') || def.tblId
    const prdSe = sp.get('prdSe') || def.prdSe
    const startPrdDe = sp.get('startPrdDe') || undefined
    const endPrdDe = sp.get('endPrdDe') || startPrdDe
    const itmId = sp.get('itmId') || (def as { itmId?: string }).itmId || undefined
    const objL1 = sp.get('objL1') || (def as { objL1?: string }).objL1 || undefined
    const objL2 = sp.get('objL2') || (def as { objL2?: string }).objL2 || undefined
    const objL3 = sp.get('objL3') || (def as { objL3?: string }).objL3 || undefined
    const objL4 = sp.get('objL4') || (def as { objL4?: string }).objL4 || undefined
    const regionKeyPref = (sp.get('regionKey') as 'C1' | 'C2' | null) || def.regionKey

    if (!startPrdDe) {
      return NextResponse.json({ ok: false, status: 400, message: 'startPrdDe is required (YYYYMM)' }, { status: 400 })
    }

    const months = monthRange(startPrdDe, endPrdDe || startPrdDe)
    if (months.length === 0) {
      return NextResponse.json({ ok: false, status: 400, message: 'Invalid period range' }, { status: 400 })
    }

    const supabase = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))

    const attempts: Attempt[] = []
    let totalUpserted = 0

    for (const scope of months) {
      const q = new URLSearchParams()
      q.set('method', 'getList')
      q.set('apiKey', requireEnv('KOSIS_API_KEY'))
      q.set('format', 'json')
      q.set('jsonVD', 'Y')
      q.set('orgId', orgId)
      q.set('tblId', tblId)
      if (prdSe) q.set('prdSe', prdSe)
      q.set('startPrdDe', scope)
      q.set('endPrdDe', scope)
      if (itmId) q.set('itmId', itmId)
      if (objL1) q.set('objL1', objL1)
      if (objL2) q.set('objL2', objL2)
      if (objL3) q.set('objL3', objL3)
      if (objL4) q.set('objL4', objL4)

      const usedParams = Object.fromEntries(q.entries())
      const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?${q.toString()}`

      // ===== KOSIS 호출 & 파싱 =====
      let bodyText = ''
      let arr: KosisRow[] = []
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
        bodyText = await res.text()

        if (!res.ok) {
          attempts.push({ scope, ok: false, error: `KOSIS error: HTTP ${res.status}`, usedParams })
          continue
        }

        const parsed: unknown = JSON.parse(bodyText)

        if (Array.isArray(parsed)) {
          arr = parsed
            .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
            .map((v) => v as KosisRow)
        } else if (parsed && typeof parsed === 'object') {
          const e = parsed as KosisErrorBody
          if (e.errCd) {
            const code = e.errCd
            const msg = e.errMsg ?? 'Unknown error'
            // 데이터 없음은 성공(0건)으로 처리
            if (code === '30' || /데이터가 존재하지 않습니다/.test(msg)) {
              attempts.push({ scope, ok: true, count: 0, usedParams })
              continue
            }
            attempts.push({ scope, ok: false, error: `KOSIS error ${code}: ${msg}`, usedParams })
            continue
          }
          if (JSON.stringify(parsed).includes('데이터가 존재하지 않습니다')) {
            attempts.push({ scope, ok: true, count: 0, usedParams })
            continue
          }
          attempts.push({ scope, ok: false, error: 'KOSIS response parse error', usedParams })
          continue
        } else {
          attempts.push({ scope, ok: false, error: 'KOSIS response parse error', usedParams })
          continue
        }
      } catch (e) {
        attempts.push({ scope, ok: false, error: `KOSIS fetch failed: ${String(e)}`, usedParams })
        continue
      }

      // ===== 맵핑 =====
      const mappedCommonRaw: CommonDbRow[] = arr
        .map((r): CommonDbRow | null => {
          const { code, name } = pickRegion(r, regionKeyPref)
          const prd_de = typeof r.PRD_DE === 'string' ? r.PRD_DE : undefined
          if (!prd_de) return null
          return {
            org_id: r.ORG_ID ?? orgId,
            tbl_id: r.TBL_ID ?? tblId,
            prd_se: r.PRD_SE ?? prdSe,
            prd_de,
            region_code: code,
            region_name: name,
            // ❗ ITM_ID가 응답에 없을 수도 있으므로, 그때만 기본값('ALL') 사용
            itm_id: r.ITM_ID ?? (itmId ?? 'ALL'),
            itm_name: r.ITM_NM ?? null,
            unit: r.UNIT_NM ?? null,
            value: toNumber(r.DT),
          }
        })
        .filter((v): v is CommonDbRow => v !== null)

      // ✅ upsert 전에 동일 키 중복 제거 (한 배치 내 중복으로 인한 "second time" 에러 차단)
      const mappedCommon = dedupeRows(mappedCommonRaw)

      // ===== DB 저장(월별) =====
      if (dataset === 'unsold_after') {
        const rows: UnsoldAfterDbRow[] = mappedCommon.map((b) => ({
          ...b,
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

        const { error } = await supabase.from('kosis_unsold_after').upsert(rows, {
          onConflict: 'tbl_id,itm_id,region_code,prd_de,org_id',
          ignoreDuplicates: false,
        })
        if (error) {
          attempts.push({
            scope,
            ok: false,
            error: `upsert failed: ${String((error as { message?: string }).message ?? error)}`,
            usedParams,
          })
          continue
        }
        attempts.push({ scope, ok: true, count: rows.length, usedParams })
        totalUpserted += rows.length
        continue
      }

      // ✅ hcsi/unsold도 upsert + 배치
      const table = dataset === 'hcsi' ? 'kosis_hcsi' : 'kosis_unsold'
      const rows: NormalDbRow[] = mappedCommon.map((b) => ({ ...b, raw: {} }))

      const batches = chunk(rows, 500)
      let okCount = 0
      let batchError: string | null = null

      for (const batch of batches) {
        const { error: upErr } = await supabase.from(table).upsert(batch, {
          onConflict: 'org_id,tbl_id,prd_de,region_code,itm_id',
          ignoreDuplicates: false,
        })
        if (upErr) {
          batchError = String((upErr as { message?: string }).message ?? upErr)
          break
        }
        okCount += batch.length
      }

      if (batchError) {
        attempts.push({ scope, ok: false, error: `upsert failed: ${batchError}`, usedParams })
        continue
      }

      attempts.push({ scope, ok: true, count: okCount, usedParams })
      totalUpserted += okCount
    }

    const successCount = attempts.filter((a) => a.ok).length
    return NextResponse.json({
      ok: successCount > 0,
      status: 200,
      upserted: totalUpserted,
      attempts,
      message: successCount > 0 ? 'completed with partial successes' : 'all attempts failed',
    })
  } catch (e) {
    return NextResponse.json({ ok: false, status: 500, message: String(e) }, { status: 500 })
  }
}
