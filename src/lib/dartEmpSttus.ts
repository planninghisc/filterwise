// OpenDART empSttus.json — 임직원 수 (dart-analysis·xbrl-analysis 등에서 공용)
import type { ReprtCode } from '@/lib/dart'

function getDartApiKey(): string | null {
  const key =
    process.env.DART_API_KEY ||
    process.env.OPEN_DART_API_KEY ||
    process.env.OPENDART_API_KEY ||
    process.env.DART_KEY ||
    null
  return key && key.trim() ? key.trim() : null
}

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').replace(/,/g, '').trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

type EmpApi = { status?: string; message?: string; list?: unknown[] }

function headcountFromEmpList(list: unknown[]): { count: number | null; note?: string } {
  if (list.length === 0) return { count: null }

  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const marker = `${r.fo_bbm ?? ''} ${r.sexdstn ?? ''}`
    if (/합계|전체|총계/.test(marker)) {
      const t = num(r.rgllbr_co) + num(r.cnttk_co) + num(r.etc_co)
      if (t > 0) return { count: Math.round(t) }
    }
  }

  let best = 0
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const t = num(r.rgllbr_co) + num(r.cnttk_co) + num(r.etc_co)
    if (t > best) best = t
  }
  if (best > 0) return { count: Math.round(best) }

  const ntot = num((list[0] as Record<string, unknown>)?.tot_emply_cnt)
  if (ntot > 0) return { count: Math.round(ntot) }

  return { count: null, note: 'unparsed' }
}

export async function fetchDartEmployeeHeadcount(
  corp_code: string,
  year: number,
  reprt: ReprtCode,
): Promise<{ count: number | null; note?: string }> {
  const key = getDartApiKey()
  if (!key) throw new Error('DART API key is missing.')

  const qs = new URLSearchParams({
    crtfc_key: key,
    corp_code,
    bsns_year: String(year),
    reprt_code: reprt,
  })
  const res = await fetch(`https://opendart.fss.or.kr/api/empSttus.json?${qs}`, { cache: 'no-store' })
  if (!res.ok) return { count: null, note: `HTTP ${res.status}` }
  const json = (await res.json()) as EmpApi
  const st = String(json.status ?? '')
  if (st === '013') return { count: null, note: 'no data' }
  if (st !== '000') return { count: null, note: json.message ?? st }
  const list = Array.isArray(json.list) ? json.list : []
  return headcountFromEmpList(list)
}
