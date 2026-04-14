// src/lib/dart.ts

export type ReprtCode = '11011' | '11012' | '11013' | '11014'
export type FsDiv = 'OFS' | 'CFS'
export type SjDiv = 'BS' | 'CIS'

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
