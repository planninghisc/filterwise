// src/app/api/dart/employees/route.ts
// OpenDART empSttus.json — 정기보고서 직원 현황 (임직원 수)
import { NextRequest, NextResponse } from 'next/server'
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

/** 응답 list 행에서 정규직+계약직+기타 합계 추출 (합계/전체 행 우선) */
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

async function fetchEmp(corp_code: string, year: number, reprt: ReprtCode): Promise<{ count: number | null; note?: string }> {
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const corpCodes = (searchParams.get('corp_codes') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (corpCodes.length === 0) {
      return NextResponse.json({ ok: false, error: 'corp_codes가 필요합니다.' }, { status: 400 })
    }

    const items: Array<{ corp_code: string; headcount: number | null; note?: string }> = []
    for (const corp_code of corpCodes) {
      try {
        const r = await fetchEmp(corp_code, year, reprt)
        items.push({ corp_code, headcount: r.count, note: r.note })
        await new Promise((r) => setTimeout(r, 120))
      } catch (e: unknown) {
        items.push({
          corp_code,
          headcount: null,
          note: e instanceof Error ? e.message : 'error',
        })
      }
    }

    return NextResponse.json({ ok: true, year, reprt, items })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
