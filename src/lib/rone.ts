// src/lib/rone.ts
// R-ONE OpenAPI 헬퍼 + 데이터 필터(분기/지역 매칭)

export type RoneRow = {
  STATBL_ID: string
  UI_NM: string | null
  ITM_ID: number | null
  ITM_NM: string | null
  ITM_FULLNM: string | null
  CLS_ID: number | null
  CLS_NM: string | null
  CLS_FULLNM: string | null
  GRP_ID: number | null
  GRP_NM: string | null
  GRP_FULLNM: string | null
  DTA_VAL: number | null
  DTACYCLE_CD: 'QY' | 'MM' | 'YY' | string
  WRTTIME_IDTFR_ID: string // 예: 202403 또는 202409 등
  WRTTIME_DESC: string     // 예: "2024년 3분기"
}

const RONE_BASE = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do'

// API Key 탐색(서버/클라 환경 변수 모두 대응)
function getRoneKey(): string {
  return (
    process.env.RONE_API_KEY ||
    process.env.NEXT_PUBLIC_RONE_API_KEY ||
    process.env.RONE_KEY ||
    process.env.NEXT_PUBLIC_RONE_KEY ||
    ''
  )
}

// 분기 헬퍼
export function toQuarterPeriod(year: number, quarter: 1 | 2 | 3 | 4): string {
  const mm = quarter === 1 ? '03' : quarter === 2 ? '06' : quarter === 3 ? '09' : '12'
  return `${year}${mm}`
}

export function parseQuarter(period: string): { year: number; q: 1 | 2 | 3 | 4 } {
  const s = String(period || '').trim()
  // YYYYMM (03/06/09/12 → 1/2/3/4분기)
  const m1 = s.match(/^(\d{4})(\d{2})$/)
  if (m1) {
    const y = Number(m1[1])
    const mm = Number(m1[2])
    if ([3, 6, 9, 12].includes(mm)) return { year: y, q: (mm / 3) as 1 | 2 | 3 | 4 }
    if (1 <= mm && mm <= 4) return { year: y, q: mm as 1 | 2 | 3 | 4 } // YYYY0Q 형태도 허용
  }
  // YYYYQn / YYYYn
  const m2 = s.match(/^(\d{4})[Qq]?([1-4])$/)
  if (m2) return { year: Number(m2[1]), q: Number(m2[2]) as 1 | 2 | 3 | 4 }

  // 기본값: 현재
  const d = new Date()
  return { year: d.getFullYear(), q: (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 }
}

export function toQuarterDesc(year: number, q: 1 | 2 | 3 | 4): string {
  return `${year}년 ${q}분기`
}

// ----------------------
// 단일 페이지 호출기
// ----------------------
type SttsApiBox = { row?: unknown }

function isSttsApiBox(x: unknown): x is SttsApiBox {
  return typeof x === 'object' && x !== null && 'row' in (x as Record<string, unknown>)
}

export async function roneFetchRows(params: {
  STATBL_ID: string
  DTACYCLE_CD?: string
  pIndex?: number
  pSize?: number // ← 1000 이하만 사용 권장
}): Promise<RoneRow[]> {
  const KEY = getRoneKey()
  if (!KEY) throw new Error('R-ONE API KEY가 환경변수에 없습니다. (RONE_API_KEY 등)')

  const url = new URL(RONE_BASE)
  url.searchParams.set('KEY', KEY)
  url.searchParams.set('Type', 'json') // 대문자
  url.searchParams.set('STATBL_ID', params.STATBL_ID)
  url.searchParams.set('DTACYCLE_CD', params.DTACYCLE_CD ?? 'QY')
  url.searchParams.set('pIndex', String(params.pIndex ?? 1))
  url.searchParams.set('pSize', String(params.pSize ?? 1000)) // ✅ 1000으로 제한

  const res = await fetch(url.toString(), { cache: 'no-store' })
  const text = await res.text()

  try {
    const json: unknown = JSON.parse(text)
    const boxes = (json as Record<string, unknown>)?.SttsApiTblData as unknown
    const box = Array.isArray(boxes)
      ? (boxes.find(isSttsApiBox) as SttsApiBox | undefined)
      : undefined

    const rowsUnknown = box?.row
    if (!Array.isArray(rowsUnknown)) throw new Error('row 배열이 없습니다.')

    // 런타임 상 RoneRow 형태로 내려오므로 단언
    return rowsUnknown as RoneRow[]
  } catch {
    const head = text.trim().slice(0, 300)
    throw new Error(`R-ONE 응답이 JSON이 아닙니다. 미리보기: ${head}`)
  }
}

// ----------------------
// 전체 페이지 자동 수집기
// ----------------------
export async function roneFetchAllRows(params: {
  STATBL_ID: string
  DTACYCLE_CD?: string
  pageSize?: number // 기본 1000
  maxPages?: number // 안전장치, 기본 200페이지(=최대 20만건)
}): Promise<RoneRow[]> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 1000, 1), 1000)
  const maxPages = params.maxPages ?? 200

  const all: RoneRow[] = []
  for (let i = 1; i <= maxPages; i++) {
    const page = await roneFetchRows({
      STATBL_ID: params.STATBL_ID,
      DTACYCLE_CD: params.DTACYCLE_CD ?? 'QY',
      pIndex: i,
      pSize: pageSize,
    })
    all.push(...page)
    if (page.length < pageSize) break // 마지막 페이지 도달
  }
  return all
}

// ---- 기존 지수용 (환경변수 키 호환 강화) ----
export async function fetchOfficeIndexForPeriod(period: string): Promise<RoneRow[]> {
  // 형식 검증(분기 파싱); 반환값은 사용하지 않아도 함수 호출 자체는 의미가 있습니다.
  parseQuarter(period)

  const STATBL_ID =
    process.env.RONE_OFFICE_INDEX_STATBL_ID ||   // 현재 권장 키
    process.env.RONE_OFFICE_STATBL_ID ||         // 과거 키
    process.env.NEXT_PUBLIC_RONE_OFFICE_STATBL_ID ||
    process.env.NEXT_PUBLIC_RONE_STATBL_ID ||
    ''
  if (!STATBL_ID) throw new Error('임대가격지수 STATBL_ID 환경변수가 없습니다.')
  // 전체 페이지 수집
  const rows = await roneFetchAllRows({ STATBL_ID, DTACYCLE_CD: 'QY' })
  return rows
}

// ---- 공실률: 연도별 STATBL_ID 선택 ----
export function pickVacancyStatblId(year: number, q: 1 | 2 | 3 | 4): string {
  if (year > 2024 || (year === 2024 && q >= 3)) return (process.env.RONE_OFFICE_VACANCY_TT ?? 'TT244763134428698')
  if (year >= 2022) return (process.env.RONE_OFFICE_VACANCY_2022 ?? 'A_2024_00253')
  if (year === 2021) return (process.env.RONE_OFFICE_VACANCY_2021 ?? 'A_2024_00250')
  return (process.env.RONE_OFFICE_VACANCY_2020 ?? 'A_2024_00247')
}

// =========================
// 분기/지역 필터 (공통 유틸)
// =========================

const HUB_PATTERNS: Record<'CBD'|'KBD'|'YBD', RegExp[]> = {
  CBD: [ /^서울>도심(?:$|>)/ ],
  KBD: [ /^서울>강남(?:$|>)/ ],
  YBD: [ /^서울>여의도[·ㆍ.]?마포(?:$|>)/, /^서울>여의도마포(?:$|>)/ ],
}

const HUB_FALLBACK_SUBCLS: Record<'CBD'|'KBD'|'YBD', string[]> = {
  CBD: ['충무로','종로','시청','을지로'],
  KBD: ['테헤란로','강남대로','논현역','교대역','남부터미널','도산대로','신사역'],
  YBD: ['여의도','영등포역','공덕역','당산역'],
}

function normalizeDesc(s?: string | null): string {
  return (s ?? '').replace(/[\s\u00A0]/g, '')
}

function timeMatch(rows: RoneRow[], year: number, q: 1|2|3|4): RoneRow[] {
  const desc = normalizeDesc(`${year}년 ${q}분기`)
  const id1 = `${year}0${q}`
  const mm = q * 3
  const id2 = `${year}${String(mm).padStart(2, '0')}`

  let cands = rows.filter(r => normalizeDesc(r.WRTTIME_DESC) === desc)
  if (cands.length) return cands

  cands = rows.filter(r => r.WRTTIME_IDTFR_ID === id1 || r.WRTTIME_IDTFR_ID === id2)
  if (cands.length) return cands

  cands = rows.filter(r => normalizeDesc(r.WRTTIME_DESC).includes(desc))
  return cands
}

function preferHigherLevel(a: RoneRow, b: RoneRow): number {
  const da = (a.CLS_FULLNM ?? '').split('>').length
  const db = (b.CLS_FULLNM ?? '').split('>').length
  if (da !== db) return da - db
  return (a.CLS_ID ?? 0) - (b.CLS_ID ?? 0)
}

// =========================
// 공실률 전용: 관대한 필터
// =========================
export function filterSeoulHubsForQuarter(rows: RoneRow[], year: number, q: 1 | 2 | 3 | 4) {
  const inQuarter = timeMatch(rows, year, q)

  const pickByHub = (hub: 'CBD'|'KBD'|'YBD') => {
    const patterns = HUB_PATTERNS[hub]

    const fullnmMatched = inQuarter
      .filter(r => patterns.some(re => re.test(r.CLS_FULLNM ?? '')))
      .sort(preferHigherLevel)

    if (fullnmMatched.length) return fullnmMatched[0]

    const clsMatched = inQuarter
      .filter(r => {
        const c = r.CLS_NM ?? ''
        if (hub === 'CBD') return /도심/.test(c)
        if (hub === 'KBD') return /강남/.test(c)
        return /(여의도.?마포|여의도|영등포|공덕|당산)/.test(c)
      })
      .sort(preferHigherLevel)
    if (clsMatched.length) return clsMatched[0]

    const fallbacks = HUB_FALLBACK_SUBCLS[hub]
    const fb = inQuarter
      .filter(r => fallbacks.some(nm => (r.CLS_NM ?? '').includes(nm) || (r.CLS_FULLNM ?? '').includes(nm)))
      .sort(preferHigherLevel)
    return fb[0] ?? null
  }

  const out = [
    { hub: 'CBD' as const, row: pickByHub('CBD') },
    { hub: 'KBD' as const, row: pickByHub('KBD') },
    { hub: 'YBD' as const, row: pickByHub('YBD') },
  ].filter(x => x.row)

  return out.map(({ hub, row }) => ({
    period: row!.WRTTIME_IDTFR_ID,
    period_desc: row!.WRTTIME_DESC ?? toQuarterDesc(year, q),
    region_code: hub,
    region_name: hub === 'CBD' ? '서울 도심' : hub === 'KBD' ? '서울 강남' : '서울 여의도·마포',
    unit: row!.UI_NM ?? null,
    value: row!.DTA_VAL ?? null,
    raw: row!,
  }))
}

// =========================
// 임대가격지수 전용: "정확도 우선" 필터
// =========================
export function filterSeoulIndexAnchorsForQuarter(rows: RoneRow[], year: number, q: 1 | 2 | 3 | 4) {
  const inQuarter = timeMatch(rows, year, q)

  const pickStrict = (prefixes: string[]) => {
    // 깊이 2 (상위 집계행)만 추림
    const top = inQuarter.filter(r => (r.CLS_FULLNM ?? '').split('>').length === 2)
    // 완전일치
    let cand = top.find(r => prefixes.includes(r.CLS_FULLNM ?? ''))
    if (cand) return cand
    // 시작일치(표기차 보정)
    cand = top.find(r => prefixes.some(p => (r.CLS_FULLNM ?? '').startsWith(p)))
    if (cand) return cand
    return null
  }

  const CBD = pickStrict(['서울>도심'])
  const KBD = pickStrict(['서울>강남'])
  const YBD = pickStrict(['서울>여의도·마포', '서울>여의도마포'])

  // 폴백: 공실률용 관대한 선택 재사용
  const general = filterSeoulHubsForQuarter(rows, year, q)
  const byHub = (hub: 'CBD'|'KBD'|'YBD', strictRow: RoneRow | null) => {
    if (strictRow) return strictRow
    const g = general.find(x => x.region_code === hub)
    return (g?.raw as RoneRow) ?? null
  }

  const out = [
    { hub: 'CBD' as const, row: byHub('CBD', CBD) },
    { hub: 'KBD' as const, row: byHub('KBD', KBD) },
    { hub: 'YBD' as const, row: byHub('YBD', YBD) },
  ].filter(x => x.row)

  return out.map(({ hub, row }) => ({
    period: row!.WRTTIME_IDTFR_ID,
    period_desc: row!.WRTTIME_DESC ?? toQuarterDesc(year, q),
    region_code: hub,
    region_name: hub === 'CBD' ? '서울 도심' : hub === 'KBD' ? '서울 강남' : '서울 여의도·마포',
    unit: row!.UI_NM ?? null,
    value: row!.DTA_VAL ?? null,
    raw: row!,
  }))
}
