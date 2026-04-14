// 코드 디렉토리: src/app/api/ingest/krx/monthly-listing/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * KRX 월별 상장 통계 수집 (코스닥)
 * - 내부적으로 요청 시작월을 11개월 당겨 더 넓게 가져온 뒤(=해당월 포함 직전 12개월 계산용)
 *   롤링 합계를 계산하고, 최종 업서트는 원래 요청 구간만 반영
 * - KRX EASY 단말 응답 키(확인됨):
 *   BAS_YYMM, LIST_COM_CNT, LIST_CAP, MKTCAP, LIST_MKTCAP, PUBOFR_AMT, TOT_PUBOFR_AMT
 * - 금액 저장 단위: 천억(100b) numeric
 * - 파생: 직전 12개월(해당월 포함) 공모금액 합계(조원)
 *
 * Query 예:
 *   /api/ingest/krx/monthly-listing?year=2025&startYm=2025-01&endYm=2025-12
 *   [&debug=1][&inspect=1]
 *
 * DB 테이블: public.krx_monthly_listing_stats (UNIQUE(prd_de, market))
 */

type ParsedRow = {
  prd_se: 'M'
  prd_de: string // YYYY-MM
  market: 'KOSDAQ'
  listed_count: number | null
  avg_capital_100b: number | null
  avg_mktcap_100b: number | null
  sum_mktcap_100b: number | null
  avg_offer_100b: number | null
  sum_offer_100b: number | null
  roll12_offer_trillion: number | null
  src: 'KRX'
  src_year: number
  src_url: string
}

const UA = 'Mozilla/5.0 (compatible; miniMIS/1.0)'
const KRX_JSON_BASE =
  process.env.KRX_JSON_BASE ?? 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd'
const DEFAULT_BLD = process.env.KRX_BLD_MDC03010203 ?? 'dbms/MDC/EASY/main/MDCEASY00401'
const DEFAULT_LOCALE = process.env.KRX_LOCALE ?? 'ko_KR'
const DEFAULT_MONEY = process.env.KRX_DEFAULT_MONEY ?? '1'
const DEFAULT_MKTID_EASY = process.env.KRX_DEFAULT_MKTID ?? 'KSQ'
const DEFAULT_MKTID_STD = 'KQ'

/* ───────────── 날짜 유틸 ───────────── */

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)
const ymToDate = (ym: string) => {
  const [yy, mm] = ym.split('-').map(Number)
  return new Date(yy, mm - 1, 1)
}
const dateToYm = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
const shiftYm = (ym: string, deltaMonths: number) => {
  const d = ymToDate(ym)
  d.setMonth(d.getMonth() + deltaMonths)
  return dateToYm(d)
}

/** "YYYY/MM" | "YYYY-MM" | "YYYY.MM" | "YYYYMM" 등 → 연/월 파싱 (없으면 fallbackYear 사용) */
function parseYearMonth(mRaw: string, fallbackYear: number) {
  const m = String(mRaw).trim()
  const re1 = /(\d{4})[./-](\d{1,2})/
  const re2 = /^(\d{4})(\d{2})$/
  const mm = m.match(re1) ?? m.match(re2)
  if (mm) {
    const yy = Number(mm[1])
    const mo = Number(mm[2])
    if (yy >= 2000 && mo >= 1 && mo <= 12) {
      return { year: yy, month: mo, prd_de: `${yy}-${pad2(mo)}` }
    }
  }
  // 최후수단: 월만 추출 후 fallbackYear 사용
  const onlyDigits = m.replace(/[^\d]/g, '')
  const mo = Number(onlyDigits.slice(-2))
  const safeMo = Number.isFinite(mo) && mo >= 1 && mo <= 12 ? mo : 1
  return { year: fallbackYear, month: safeMo, prd_de: `${fallbackYear}-${pad2(safeMo)}` }
}

/* ───────────── 단위 변환 ───────────── */

const wonTo100b = (n: number | null) => (n == null ? null : n / 1e11) // 원 → 천억
const wonToTrn = (n: number | null) => (n == null ? null : n / 1e12) // 원 → 조
const hundredBToThousandWon = (n: number | null) =>
  n == null ? null : Math.round(n * 1e8) // 천억 → 천원(bigint 저장용)
const safeNum = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v)

/** "1,361,014,507,000" → 1361014507000 (원) */
function parseWonRaw(val: unknown): number | null {
  if (val == null) return null
  const s = String(val).replace(/[^\d.-]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** 억/조 라벨이 있는 경우만 라벨 반영, 없으면 원 단위로 해석 */
function parseKrxMoneyToWon(val: unknown): number | null {
  if (val == null) return null
  const raw = String(val).trim()
  if (!raw || raw === '-' || /^na|null$/i.test(raw)) return null
  if (/조/.test(raw)) {
    const m = raw.replace(/[,\s]/g, '').match(/-?\d+(?:\.\d+)?/)
    return m ? Math.round(Number(m[0]) * 1e12) : null
  }
  if (/억/.test(raw)) {
    const m = raw.replace(/[,\s]/g, '').match(/-?\d+(?:\.\d+)?/)
    return m ? Math.round(Number(m[0]) * 1e8) : null
  }
  return parseWonRaw(raw)
}

/* ───────────── KRX fetch ───────────── */

type KrxJsonAny = {
  output?: any[]
  OutBlock_1?: any[]
  block1?: any[]
  list?: any[]
  data?: any[]
  [k: string]: unknown
}

async function fetchKrx(formObj: Record<string, string>) {
  const res = await fetch(KRX_JSON_BASE, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://data.krx.co.kr',
      Referer: 'https://data.krx.co.kr/',
    },
    body: new URLSearchParams(formObj).toString(),
    cache: 'no-store',
  })
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()

  // JSON 우선
  try {
    const json = JSON.parse(text) as KrxJsonAny
    const rows = json.output ?? json.OutBlock_1 ?? json.block1 ?? json.list ?? json.data ?? []
    return { ok: true as const, contentType, kind: 'json' as const, rows, rawText: text }
  } catch {
    /* fallthrough */
  }

  // CSV/TSV 백업
  if (/,|\t/.test(text)) {
    try {
      const wb = XLSX.read(text, { type: 'string' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
      return { ok: true as const, contentType, kind: 'csv' as const, rows, rawText: text }
    } catch {
      /* noop */
    }
  }

  return {
    ok: false as const,
    status: res.status,
    error: 'KRX_UNPARSABLE',
    contentType,
    rawText: text.slice(0, 1500),
  }
}

/* ───────────── EASY 전용 매퍼 (확정 키 하드코딩) ───────────── */

const EASY_KEYS = {
  month: 'BAS_YYMM',
  listed: 'LIST_COM_CNT',
  avg_cap: 'LIST_CAP',
  avg_mkt: 'MKTCAP',
  sum_mkt: 'LIST_MKTCAP',
  avg_offer: 'PUBOFR_AMT',
  sum_offer: 'TOT_PUBOFR_AMT',
}

function mapEasyJsonRows(rows: any[], fallbackYear: number): ParsedRow[] {
  const out: ParsedRow[] = []
  for (const it of rows) {
    if (!it || typeof it !== 'object') continue
    const row = it as Record<string, any>

    const mRaw = String(row[EASY_KEYS.month] ?? '').trim()
    if (!mRaw) continue
    const { year, prd_de } = parseYearMonth(mRaw, fallbackYear)

    const listed = row[EASY_KEYS.listed] != null
      ? Number(String(row[EASY_KEYS.listed]).replace(/[^\d-]/g, ''))
      : null

    // EASY의 금액은 원 단위 숫자 문자열
    const avgCapWon = parseWonRaw(row[EASY_KEYS.avg_cap])
    const avgMktWon = parseWonRaw(row[EASY_KEYS.avg_mkt])
    const sumMktWon = parseWonRaw(row[EASY_KEYS.sum_mkt])
    const avgOffWon = parseWonRaw(row[EASY_KEYS.avg_offer])
    const sumOffWon = parseWonRaw(row[EASY_KEYS.sum_offer])

    out.push({
      prd_se: 'M',
      prd_de,
      market: 'KOSDAQ',
      listed_count: Number.isFinite(listed as number) ? (listed as number) : null,
      avg_capital_100b: wonTo100b(avgCapWon),
      avg_mktcap_100b: wonTo100b(avgMktWon),
      sum_mktcap_100b: wonTo100b(sumMktWon),
      avg_offer_100b: wonTo100b(avgOffWon),
      sum_offer_100b: wonTo100b(sumOffWon),
      roll12_offer_trillion: null,
      src: 'KRX',
      src_year: year,
      src_url:
        'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC03010203',
    })
  }
  return out
}

/* ───────────── CSV/제네릭 백업 매퍼 (라벨 억/조 지원) ───────────── */

function mapCsvRows(rows2d: string[][], fallbackYear: number): ParsedRow[] {
  if (rows2d.length < 2) return []
  const header = rows2d[0].map((h) => String(h ?? '').trim())
  const findIdx = (pats: RegExp[], fb = -1) => {
    for (let i = 0; i < header.length; i += 1) if (pats.some((p) => p.test(header[i]))) return i
    return fb
  }
  const idxMonth = findIdx([/BAS|STD.*YM|기간|월|month/i], 0)
  const idxListed = findIdx([/LIST.*(CO|CNT)|기업수|건수/i], -1)
  const idxAvgCap = findIdx([/AVG|AVRG.*(CAP|CAPITAL)|자본금/i], -1)
  const idxAvgMkt = findIdx([/AVG|AVRG.*(MKTCAP)|평균.*시가총액/i], -1)
  const idxSumMkt = findIdx([/SUM|TOTAL.*(MKTCAP)|시가총액.*합계/i], -1)
  const idxAvgOff = findIdx([/AVG|AVRG.*(PBCT|OFFER)|평균.*공모/i], -1)
  const idxSumOff = findIdx([/SUM|TOTAL.*(PBCT|OFFER)|공모.*합계/i], -1)

  const out: ParsedRow[] = []
  for (let r = 1; r < rows2d.length; r += 1) {
    const row = rows2d[r] ?? []
    const mRaw = String(row[idxMonth] ?? '').trim()
    if (!mRaw) continue
    const { year, prd_de } = parseYearMonth(mRaw, fallbackYear)

    const listed =
      idxListed >= 0 ? Number(String(row[idxListed]).replace(/[^\d-]/g, '')) : null
    const avgCapWon = idxAvgCap >= 0 ? parseKrxMoneyToWon(row[idxAvgCap]) : null
    const avgMktWon = idxAvgMkt >= 0 ? parseKrxMoneyToWon(row[idxAvgMkt]) : null
    const sumMktWon = idxSumMkt >= 0 ? parseKrxMoneyToWon(row[idxSumMkt]) : null
    const avgOffWon = idxAvgOff >= 0 ? parseKrxMoneyToWon(row[idxAvgOff]) : null
    const sumOffWon = idxSumOff >= 0 ? parseKrxMoneyToWon(row[idxSumOff]) : null

    out.push({
      prd_se: 'M',
      prd_de: prd_de,
      market: 'KOSDAQ',
      listed_count: Number.isFinite(listed as number) ? (listed as number) : null,
      avg_capital_100b: wonTo100b(avgCapWon),
      avg_mktcap_100b: wonTo100b(avgMktWon),
      sum_mktcap_100b: wonTo100b(sumMktWon),
      avg_offer_100b: wonTo100b(avgOffWon),
      sum_offer_100b: wonTo100b(sumOffWon),
      roll12_offer_trillion: null,
      src: 'KRX',
      src_year: year,
      src_url:
        'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC03010203',
    })
  }
  return out
}

function mapGenericJsonRows(rows: any[], fallbackYear: number): ParsedRow[] {
  const out: ParsedRow[] = []
  for (const it of rows) {
    if (!it || typeof it !== 'object') continue
    const row = it as Record<string, any>
    const monthKey =
      Object.keys(row).find((k) => /BAS[_-]?YYMM|BAS[_-]?YM|STD[_-]?YM|기간|월|month/i.test(k)) ??
      null
    const mRaw = monthKey ? String(row[monthKey]).trim() : ''
    if (!mRaw) continue
    const { year, prd_de } = parseYearMonth(mRaw, fallbackYear)

    const get = (re: RegExp) => {
      const k = Object.keys(row).find((kk) => re.test(kk))
      return k ? row[k] : null
    }

    const listed = parseWonRaw(get(/LIST.*(CO|CNT)|기업수|건수/i))
    const avgCapWon = parseKrxMoneyToWon(get(/AVG|AVRG.*(CAP|CAPITAL)|자본금/i))
    const avgMktWon = parseKrxMoneyToWon(get(/AVG|AVRG.*(MKTCAP)|평균.*시가총액/i))
    const sumMktWon = parseKrxMoneyToWon(get(/SUM|TOTAL.*(MKTCAP)|시가총액.*합계/i))
    const avgOffWon = parseKrxMoneyToWon(get(/AVG|AVRG.*(PBCT|OFFER)|평균.*공모/i))
    const sumOffWon = parseKrxMoneyToWon(get(/SUM|TOTAL.*(PBCT|OFFER)|공모.*합계/i))

    out.push({
      prd_se: 'M',
      prd_de,
      market: 'KOSDAQ',
      listed_count: Number.isFinite(listed as number) ? (listed as number) : null,
      avg_capital_100b: wonTo100b(avgCapWon),
      avg_mktcap_100b: wonTo100b(avgMktWon),
      sum_mktcap_100b: wonTo100b(sumMktWon),
      avg_offer_100b: wonTo100b(avgOffWon),
      sum_offer_100b: wonTo100b(sumOffWon),
      roll12_offer_trillion: null,
      src: 'KRX',
      src_year: year,
      src_url:
        'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC03010203',
    })
  }
  return out
}

/* ───────────── 롤링 12개월(해당월 포함) 공모금액 합계(조원) ───────────── */

function fillRolling12OfferTrillion(rows: ParsedRow[]) {
  const byYm = new Map<string, ParsedRow>(rows.map((r) => [r.prd_de, r]))
  const yms = [...byYm.keys()].sort()
  for (const endYm of yms) {
    const endD = ymToDate(endYm)
    let sumWon = 0
    for (let k = 0; k < 12; k += 1) {
      const d = new Date(endD.getFullYear(), endD.getMonth() - k, 1)
      const key = dateToYm(d)
      const row = byYm.get(key)
      if (!row) continue
      if (row.sum_offer_100b != null) sumWon += row.sum_offer_100b * 1e11 // 천억→원
    }
    const target = byYm.get(endYm)
    if (target) target.roll12_offer_trillion = wonToTrn(sumWon)
  }
}

/* ───────────── 핸들러 ───────────── */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const yearStr = searchParams.get('year')
    const startYmOrig = searchParams.get('startYm')
    const endYm = searchParams.get('endYm')
    const debug = searchParams.get('debug') === '1'
    const dryrun = searchParams.get('dryrun') === '1' || searchParams.get('inspect') === '1'

    if (!yearStr || !startYmOrig || !endYm) {
      return NextResponse.json(
        { error: 'PARAM_MISSING: year/startYm/endYm' },
        { status: 400 },
      )
    }
    const fallbackYear = Number(yearStr)
    if (!Number.isInteger(fallbackYear) || fallbackYear < 2000) {
      return NextResponse.json({ error: 'PARAM_INVALID: year' }, { status: 400 })
    }

    // (핵심) 내부 수집 범위를 11개월 확장
    const startYmWide = shiftYm(startYmOrig, -11)

    const bld = (searchParams.get('bld') ?? DEFAULT_BLD).trim()
    const isEasy = /EASY/i.test(bld)
    const mktId = (searchParams.get('mktId') ?? (isEasy ? DEFAULT_MKTID_EASY : DEFAULT_MKTID_STD)).trim()
    const pdTpCd = (searchParams.get('pdTpCd') ?? 'M').trim()
    const money = (searchParams.get('money') ?? DEFAULT_MONEY).trim()
    const locale = (searchParams.get('locale') ?? DEFAULT_LOCALE).trim()

    const form: Record<string, string> = {
      bld,
      locale,
      mktId,
      pdTpCd,
      strtYy: startYmWide.slice(0, 4),
      strtMm: startYmWide.slice(5, 7),
      endYy: endYm.slice(0, 4),
      endMm: endYm.slice(5, 7),
      money,
      csvxls_isNo: 'false',
    }

    const fetched = await fetchKrx(form)
    if (!fetched.ok) {
      return NextResponse.json(
        {
          error: fetched.error,
          status: fetched.status,
          contentType: fetched.contentType,
          preview: debug ? fetched.rawText : undefined,
        },
        { status: fetched.status || 500 },
      )
    }

    // 매핑
    let allParsed: ParsedRow[] = []
    if (isEasy) {
      allParsed = mapEasyJsonRows(fetched.rows as any[], fallbackYear)
    } else {
      if (Array.isArray(fetched.rows) && Array.isArray((fetched.rows as any[])[0])) {
        allParsed = mapCsvRows(fetched.rows as string[][], fallbackYear)
      } else {
        allParsed = mapGenericJsonRows(fetched.rows as any[], fallbackYear)
      }
    }

    if (allParsed.length === 0) {
      return NextResponse.json(
        {
          error: 'NO_DATA_PARSED',
          preview: debug ? fetched.rawText?.slice(0, 1500) : undefined,
        },
        { status: 422 },
      )
    }

    // 롤링 합계(확장 구간 전체 기준)
    fillRolling12OfferTrillion(allParsed)

    // 최종 반영 구간: 사용자가 요청한 원래 구간
    const inRange = allParsed.filter((r) => r.prd_de >= startYmOrig && r.prd_de <= endYm)

    // (방어) 같은 키 중복 제거 — 마지막 값 우선
    const dedupMap = new Map<string, ParsedRow>()
    for (const r of inRange) dedupMap.set(`${r.prd_de}|${r.market}`, r)
    const deduped = [...dedupMap.values()]

    // 디버그/인스펙트 미리보기
    if (debug && dryrun) {
      const preview = deduped.map((r) => ({
        prd_de: r.prd_de,
        listed_count: r.listed_count,
        avg_capital_100b: r.avg_capital_100b,
        avg_mktcap_100b: r.avg_mktcap_100b,
        sum_mktcap_100b: r.sum_mktcap_100b,
        avg_offer_100b: r.avg_offer_100b,
        sum_offer_100b: r.sum_offer_100b,
        roll12_offer_trillion: r.roll12_offer_trillion,
      }))
      return NextResponse.json({
        ok: true,
        mode: 'inspect',
        range: { startYm: startYmOrig, endYm },
        widenedFetch: { startYmWide, requestedStartYm: startYmOrig },
        meta: { bld, mktId, pdTpCd, money, kind: fetched.kind, contentType: fetched.contentType },
        mapped_preview: preview,
      })
    }

    // 업서트 payload (NaN 방지)
    const rowsToUpsert = deduped.map((r) => {
      const avg_cap_100b = safeNum(r.avg_capital_100b)
      const avg_mkt_100b = safeNum(r.avg_mktcap_100b)
      const sum_mkt_100b = safeNum(r.sum_mktcap_100b)
      const avg_off_100b = safeNum(r.avg_offer_100b)
      const sum_off_100b = safeNum(r.sum_offer_100b)
      const roll12_trn = safeNum(r.roll12_offer_trillion)

      return {
        prd_se: r.prd_se,
        prd_de: r.prd_de,
        market: r.market,
        listed_count: r.listed_count,
        src: r.src,
        src_year: r.src_year,
        src_url: r.src_url,
        avg_capital_100b: avg_cap_100b,
        avg_mktcap_100b: avg_mkt_100b,
        sum_mktcap_100b: sum_mkt_100b,
        avg_offer_100b: avg_off_100b,
        sum_offer_100b: sum_off_100b,
        roll12_offer_trillion: roll12_trn,
        // 호환(천원 bigint) 백필 — null이면 undefined로 생략
        avg_capital_krw_thousand:
          avg_cap_100b == null ? undefined : Math.round(avg_cap_100b * 1e8),
        avg_mktcap_krw_thousand:
          avg_mkt_100b == null ? undefined : Math.round(avg_mkt_100b * 1e8),
        sum_mktcap_krw_thousand:
          sum_mkt_100b == null ? undefined : Math.round(sum_mkt_100b * 1e8),
        avg_offer_krw_thousand:
          avg_off_100b == null ? undefined : Math.round(avg_off_100b * 1e8),
        sum_offer_krw_thousand:
          sum_off_100b == null ? undefined : Math.round(sum_off_100b * 1e8),
      }
    })

    const { data, error } = await supabaseAdmin
      .from('krx_monthly_listing_stats')
      .upsert(rowsToUpsert, { onConflict: 'prd_de,market' })
      .select('prd_de')

    if (error) {
      return NextResponse.json(
        {
          error: 'DB_UPSERT_FAILED',
          detail: error.message,
          hint:
            'UNIQUE(prd_de,market) 존재 여부/컬럼 정의/NaN 여부 확인. (중복키는 사전 제거됨)',
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      range: { startYm: startYmOrig, endYm },
      widenedFetch: { startYmWide, requestedStartYm: startYmOrig },
      affected: Array.isArray(data) ? data.length : 0,
      parsedMonths: rowsToUpsert.map((p) => p.prd_de),
      meta: { bld, mktId, pdTpCd, money, kind: fetched.kind, contentType: fetched.contentType },
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'UNEXPECTED', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
