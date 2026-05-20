// src/lib/dart.ts

export type ReprtCode = '11011' | '11012' | '11013' | '11014'
export type FsDiv = 'OFS' | 'CFS'
/** OpenDART fnltt API → dart_fnltt.sj_div (주석·XBRL 세부 라인은 API 미제공) */
export type SjDiv = 'BS' | 'CIS' | 'CF' | 'SCE'

/**
 * OpenDART financial statement API 응답의 sj_div 값을 DB 저장용으로 정규화합니다.
 * 예전 코드는 CIS가 아닌 값을 모두 BS로 몰아 CF·자본변동이 BS에 섞일 수 있었습니다.
 */
export function normalizeDartSjDiv(v: unknown): SjDiv {
  const s = String(v ?? '')
    .trim()
    .toUpperCase()
  if (s === 'CIS' || s === 'IS' || s === 'PL') return 'CIS'
  if (s === 'BS') return 'BS'
  if (s === 'CF') return 'CF'
  if (s === 'SCE' || s === 'EQ' || s === 'SE') return 'SCE'
  return 'BS'
}

export type DartListResponse<T> = {
  status?: string
  message?: string
  list?: T[]
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.join('&')
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const data: unknown = await res.json()
  return data as T
}

export function toNumberOrZero(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'nan') return 0
    const n = Number(trimmed.replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    const n = Number(s.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

export type FnlttItem = {
  corp_code: string
  bsns_year: number
  reprt_code: ReprtCode
  fs_div: FsDiv
  sj_div: SjDiv
  account_nm: string | null
  account_id: string | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
  ord?: number | null
  currency?: string | null
}

export type CorpMeta = {
  corp_code: string
  corp_name: string
}

/** UI·기본값용 — 공시 시기 순(1분기 → 반기 → 3분기 → 연간) */
export const DART_REPRT_OPTIONS: ReadonlyArray<{ code: ReprtCode; name: string }> = [
  { code: '11013', name: '1분기보고서' },
  { code: '11012', name: '반기보고서' },
  { code: '11014', name: '3분기보고서' },
  { code: '11011', name: '사업보고서(연간)' },
] as const

/**
 * 오늘(또는 asOf) 기준 가장 최근에 공시된 것으로 보이는 보고서·사업연도.
 * 1분기(~5월), 반기(~8월), 3분기(~11월), 연간(다음해 ~3월) 공시 시점을 월 단위로 근사합니다.
 */
export function getDefaultDartReport(asOf: Date = new Date()): { year: number; reprt: ReprtCode } {
  const y = asOf.getFullYear()
  const m = asOf.getMonth() + 1

  if (m < 5) return { year: y - 1, reprt: '11011' }
  if (m < 8) return { year: y, reprt: '11013' }
  if (m < 11) return { year: y, reprt: '11012' }
  return { year: y, reprt: '11014' }
}
