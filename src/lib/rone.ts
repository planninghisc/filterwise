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
type SttsApiBox = { row?: unknown; ROW?: unknown }

function rowPayloadFromBox(b: Record<string, unknown>): unknown {
  if ('row' in b) return b.row
  if ('ROW' in b) return b.ROW
  return undefined
}

function isSttsApiBox(x: unknown): x is SttsApiBox {
  return typeof x === 'object' && x !== null && ('row' in x || 'ROW' in x)
}

function pickField(obj: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name]
  }
  for (const name of names) {
    const target = name.toLowerCase()
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === target) return obj[k]
    }
  }
  return undefined
}

/** API가 소문자 키를 줄 때도 필터·분기 매칭이 동작하도록 정규화 */
function coerceRoneRow(raw: unknown): RoneRow {
  const empty: RoneRow = {
    STATBL_ID: '',
    UI_NM: null,
    ITM_ID: null,
    ITM_NM: null,
    ITM_FULLNM: null,
    CLS_ID: null,
    CLS_NM: null,
    CLS_FULLNM: null,
    GRP_ID: null,
    GRP_NM: null,
    GRP_FULLNM: null,
    DTA_VAL: null,
    DTACYCLE_CD: 'QY',
    WRTTIME_IDTFR_ID: '',
    WRTTIME_DESC: '',
  }
  if (typeof raw !== 'object' || raw === null) return empty

  const o = raw as Record<string, unknown>
  const pickStr = (...keys: string[]): string => {
    const v = pickField(o, ...keys)
    if (v == null) return ''
    return String(v)
  }
  const pickStrNull = (...keys: string[]): string | null => {
    const v = pickField(o, ...keys)
    if (v == null || v === '') return null
    return String(v)
  }
  const pickNumNull = (...keys: string[]): number | null => {
    const v = pickField(o, ...keys)
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const n = Number(v.replace(/,/g, '').trim())
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  const cycle = pickStr('DTACYCLE_CD')

  return {
    STATBL_ID: pickStr('STATBL_ID'),
    UI_NM: pickStrNull('UI_NM'),
    ITM_ID: pickNumNull('ITM_ID'),
    ITM_NM: pickStrNull('ITM_NM'),
    ITM_FULLNM: pickStrNull('ITM_FULLNM'),
    CLS_ID: pickNumNull('CLS_ID'),
    CLS_NM: pickStrNull('CLS_NM'),
    CLS_FULLNM: pickStrNull('CLS_FULLNM'),
    GRP_ID: pickNumNull('GRP_ID'),
    GRP_NM: pickStrNull('GRP_NM'),
    GRP_FULLNM: pickStrNull('GRP_FULLNM'),
    DTA_VAL: pickNumNull('DTA_VAL'),
    DTACYCLE_CD: (cycle || 'QY') as string,
    WRTTIME_IDTFR_ID: pickStr('WRTTIME_IDTFR_ID'),
    WRTTIME_DESC: pickStr('WRTTIME_DESC'),
  }
}

function normalizeRoneRowArray(row: unknown): RoneRow[] {
  if (row == null) return []
  if (Array.isArray(row)) return row.map((x) => coerceRoneRow(x))
  if (typeof row === 'object') {
    const o = row as Record<string, unknown>
    if (Object.keys(o).length === 0) return []
    return [coerceRoneRow(row)]
  }
  return []
}

/** R-ONE은 SttsApiTblData가 [{ head: [...] }, { row: [...] }] 형태인 경우가 많음 — row가 있는 블록을 모두 합친다. */
function extractRowsFromSttsApiTblData(boxes: unknown): RoneRow[] {
  if (boxes == null) return []
  if (isSttsApiBox(boxes)) {
    return normalizeRoneRowArray(rowPayloadFromBox(boxes as Record<string, unknown>))
  }
  if (!Array.isArray(boxes)) return []

  const merged: RoneRow[] = []
  for (const b of boxes) {
    if (!isSttsApiBox(b)) continue
    const part = normalizeRoneRowArray(rowPayloadFromBox(b as Record<string, unknown>))
    if (part.length) merged.push(...part)
  }
  return merged
}

/** head 블록 안의 RESULT (INFO-200 등) */
function extractResultFromHead(boxes: unknown): { code: string; message: string } | null {
  if (!Array.isArray(boxes)) return null
  for (const b of boxes) {
    if (typeof b !== 'object' || b === null) continue
    const head = (b as Record<string, unknown>).head
    if (!Array.isArray(head)) continue
    for (const h of head) {
      if (typeof h !== 'object' || h === null) continue
      const r = (h as Record<string, unknown>).RESULT as Record<string, unknown> | undefined
      if (r && typeof r.CODE === 'string') {
        return { code: String(r.CODE).toUpperCase(), message: String(r.MESSAGE ?? '') }
      }
    }
  }
  return null
}

/** head의 list_total_count — 페이지 크기보다 작은 페이지가 와도 전체 수집에 필요 */
function extractListTotalCount(boxes: unknown): number | null {
  if (!Array.isArray(boxes)) return null
  for (const b of boxes) {
    if (typeof b !== 'object' || b === null) continue
    const head = (b as Record<string, unknown>).head
    if (!Array.isArray(head)) continue
    for (const h of head) {
      if (typeof h !== 'object' || h === null) continue
      const rec = h as Record<string, unknown>
      const raw = rec.list_total_count ?? rec.LIST_TOTAL_COUNT ?? rec.listTotalCount
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      if (typeof raw === 'string') {
        const n = parseInt(String(raw).replace(/,/g, ''), 10)
        if (Number.isFinite(n)) return n
      }
    }
  }
  return null
}

export type RonePageParse = {
  rows: RoneRow[]
  listTotalCount: number | null
  /** 첫 블록·최상위 RESULT 코드(INFO-200, ERROR-xxx 등) */
  resultCode: string
  resultMessage: string
}

/** 본문에 JSON 객체가 두 번 이어 붙은 경우(개행 구분) 등 1차 파싱 실패 시 줄 단위 재시도 */
function parseJsonFlexible(text: string): unknown {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) throw new Error('R-ONE 응답이 비어 있습니다.')
  try {
    return JSON.parse(trimmed)
  } catch {
    const lines = trimmed.split(/\r?\n/)
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('{')) continue
      try {
        return JSON.parse(t)
      } catch {
        continue
      }
    }
    throw new Error(`R-ONE 응답이 JSON이 아닙니다. 미리보기: ${trimmed.slice(0, 240)}`)
  }
}

function parseRoneJsonFull(text: string): RonePageParse {
  const root = parseJsonFlexible(text) as Record<string, unknown>

  // 일부 응답은 최상위 RESULT만 오고 테이블이 없음
  const topResult = root?.RESULT as Record<string, unknown> | undefined
  const topCode = String(topResult?.CODE ?? '').toUpperCase().trim()
  const topMessage = String(topResult?.MESSAGE ?? '').trim()

  const boxes = root?.SttsApiTblData as unknown
  const listTotalCount = extractListTotalCount(boxes)
  const headResult = extractResultFromHead(boxes)
  const code = String(headResult?.code || topCode || '').trim()
  const message = String(headResult?.message || topMessage || '').trim()

  const rows = extractRowsFromSttsApiTblData(boxes)
  const resultCode = code
  const resultMessage = message

  if (rows.length > 0) return { rows, listTotalCount, resultCode, resultMessage }

  if (code && /^ERROR[-_]/i.test(code)) {
    throw new Error(`R-ONE 오류: ${code} ${message}`.trim())
  }

  // 행이 없을 때만 INFO-200 등을 빈 목록으로 처리 (기존에 row가 따로 오는 형식도 유지)
  if (code === 'INFO-200' || /데이터가\s*없습니다/i.test(message)) {
    return { rows: [], listTotalCount, resultCode, resultMessage }
  }

  if (boxes == null) return { rows: [], listTotalCount: null, resultCode, resultMessage }

  return { rows: [], listTotalCount, resultCode, resultMessage }
}

export async function roneFetchRows(params: {
  STATBL_ID: string
  DTACYCLE_CD?: string
  pIndex?: number
  pSize?: number // ← 1000 이하만 사용 권장
}): Promise<RonePageParse> {
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
    return parseRoneJsonFull(text)
  } catch (e) {
    if (e instanceof Error) throw e
    const head = text.trim().slice(0, 300)
    throw new Error(`R-ONE 응답 처리 실패. 미리보기: ${head}`)
  }
}

// ----------------------
// 전체 페이지 자동 수집기
// ----------------------
export type RoneFetchAllResult = {
  rows: RoneRow[]
  /** 첫 페이지 RESULT (진단용; 행이 0건일 때 원인 확인) */
  page1ResultCode?: string
  page1ResultMessage?: string
}

export async function roneFetchAllRows(params: {
  STATBL_ID: string
  DTACYCLE_CD?: string
  pageSize?: number // 기본 1000
  maxPages?: number // 안전장치, 기본 200페이지(=최대 20만건)
}): Promise<RoneFetchAllResult> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 1000, 1), 1000)
  const maxPages = params.maxPages ?? 200

  const all: RoneRow[] = []
  let totalFromHead: number | null = null
  let page1ResultCode: string | undefined
  let page1ResultMessage: string | undefined

  for (let i = 1; i <= maxPages; i++) {
    const { rows: page, listTotalCount, resultCode, resultMessage } = await roneFetchRows({
      STATBL_ID: params.STATBL_ID,
      DTACYCLE_CD: params.DTACYCLE_CD ?? 'QY',
      pIndex: i,
      pSize: pageSize,
    })

    if (i === 1) {
      page1ResultCode = resultCode || undefined
      page1ResultMessage = resultMessage || undefined
      if (listTotalCount != null && Number.isFinite(listTotalCount) && listTotalCount >= 0) {
        totalFromHead = listTotalCount
      }
    }

    if (page.length === 0) break

    all.push(...page)

    // R-ONE은 페이지당 행이 pSize보다 작을 수 있음 → 첫 페이지에서 잘못 종료하지 않도록 total 기준으로 이어감
    if (totalFromHead != null && totalFromHead > 0) {
      if (all.length >= totalFromHead) break
      continue
    }

    if (page.length < pageSize) break
  }
  return { rows: all, page1ResultCode, page1ResultMessage }
}

/** 시작~끝 분기(포함), 시작이 끝보다 크면 자동으로 뒤집음 */
export function iterateQuartersInclusive(
  startYear: number,
  startQ: 1 | 2 | 3 | 4,
  endYear: number,
  endQ: 1 | 2 | 3 | 4,
): Array<{ year: number; q: 1 | 2 | 3 | 4 }> {
  const rank = (y: number, q: number) => y * 4 + q
  let sy = startYear
  let sq = startQ
  let ey = endYear
  let eq = endQ
  if (rank(sy, sq) > rank(ey, eq)) {
    ;[sy, sq, ey, eq] = [ey, eq, sy, sq]
  }
  const out: Array<{ year: number; q: 1 | 2 | 3 | 4 }> = []
  let y = sy
  let q = sq
  while (true) {
    out.push({ year: y, q })
    if (y === ey && q === eq) break
    const nq = q + 1
    if (nq > 4) {
      y += 1
      q = 1
    } else {
      q = nq as 1 | 2 | 3 | 4
    }
  }
  return out
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
  const { rows } = await roneFetchAllRows({ STATBL_ID, DTACYCLE_CD: 'QY' })
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

/** 분류 경로 표기 차이(중점·공백 등) 정규화 — 여의도·마포 / 여의도마포 등 매칭용 */
function normalizeClsPath(s?: string | null): string {
  return normalizeDesc(
    String(s ?? '').replace(/[\u00B7\u30FB\u2027\u318D‧∙]/g, '·'),
  )
}

function descMatchesQuarterFlexible(desc: string | null | undefined, year: number, q: 1 | 2 | 3 | 4): boolean {
  const s = String(desc ?? '')
  // 예: "2025년 3분기", "2025년제3분기", "2025년 제 3 분기"
  const re = new RegExp(`${year}\\s*년\\s*제?\\s*${q}\\s*분기`)
  return re.test(s)
}

function timeMatch(rows: RoneRow[], year: number, q: 1|2|3|4): RoneRow[] {
  const descStrict = normalizeDesc(`${year}년${q}분기`)
  const descAlt = normalizeDesc(`${year}년제${q}분기`)

  let cands = rows.filter((r) => {
    const d = normalizeDesc(r.WRTTIME_DESC)
    return d === descStrict || d === descAlt
  })
  if (cands.length) return cands

  const id1 = `${year}0${q}`
  const mmEnd = q * 3
  const mmStart = (q - 1) * 3 + 1
  const ids = new Set([
    id1,
    `${year}${String(mmEnd).padStart(2, '0')}`,
    `${year}${String(mmStart).padStart(2, '0')}`,
  ])

  cands = rows.filter((r) => ids.has(String(r.WRTTIME_IDTFR_ID ?? '').trim()))
  if (cands.length) return cands

  cands = rows.filter((r) => descMatchesQuarterFlexible(r.WRTTIME_DESC, year, q))
  if (cands.length) return cands

  cands = rows.filter((r) => normalizeDesc(r.WRTTIME_DESC).includes(descStrict))
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
    const nprefixes = prefixes.map((p) => normalizeClsPath(p))

    const candidates = inQuarter.filter((r) => {
      const full = normalizeClsPath(r.CLS_FULLNM)
      return nprefixes.some((p) => full === p || full.startsWith(`${p}>`))
    })
    if (!candidates.length) return null

    // 얕은 분류(허브 집계행) 우선 — R-ONE이 세분류만 두거나 깊이가 바뀌어도 상위 행을 고름
    candidates.sort((a, b) => {
      const da = (a.CLS_FULLNM ?? '').split('>').length
      const db = (b.CLS_FULLNM ?? '').split('>').length
      if (da !== db) return da - db
      return (a.CLS_ID ?? 0) - (b.CLS_ID ?? 0)
    })
    return candidates[0]
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
