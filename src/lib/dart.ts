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
