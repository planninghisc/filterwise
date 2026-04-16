// src/app/api/dart/sync/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeDartSjDiv, type ReprtCode, type FsDiv, type SjDiv } from '@/lib/dart'

type PostBody = {
  corp_code?: unknown
  corp_codes?: unknown
  year?: unknown
  reprt?: unknown
  fs_div?: unknown
  /** 단일 표 (하위 호환) */
  sj_div?: unknown
  /** 여러 표 동시 수집 (예: ['CIS','BS']) */
  sj_divs?: unknown
}

type Result = {
  corp_code: string
  year: number
  reprt: ReprtCode
  fs_div: FsDiv
  sj_div: SjDiv
  ok: boolean
  saved?: number
  message?: string
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

type DartFnlttApiItem = {
  sj_div?: string
  account_nm?: string
  account_id?: string
  thstrm_amount?: string
  frmtrm_amount?: string
  ord?: string | number
  currency?: string
}

type DartFnlttApiResponse = {
  status?: string
  message?: string
  list?: DartFnlttApiItem[]
}

type FnlttInsertRow = {
  corp_code: string
  bsns_year: number
  reprt_code: ReprtCode
  fs_div: FsDiv
  sj_div: SjDiv
  account_nm: string | null
  account_id: string | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
  ord: number | null
  currency: string | null
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s || s.toLowerCase() === 'nan' || s.toLowerCase() === 'null') return null
    const n = Number(s.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function getDartApiKey(): string | null {
  const key =
    process.env.DART_API_KEY ||
    process.env.OPEN_DART_API_KEY ||
    process.env.OPENDART_API_KEY ||
    process.env.DART_KEY ||
    null
  return key && key.trim() ? key.trim() : null
}

async function fetchDartFnltt(args: {
  corp_code: string
  year: number
  reprt: ReprtCode
  fs_div: FsDiv
}): Promise<DartFnlttApiResponse> {
  const key = getDartApiKey()
  if (!key) throw new Error('DART API key is missing. Set DART_API_KEY (or OPEN_DART_API_KEY).')

  const endpoint =
    args.fs_div === 'CFS'
      ? 'https://opendart.fss.or.kr/api/fnlttMultiAcnt.json'
      : 'https://opendart.fss.or.kr/api/fnlttSinglAcnt.json'

  const qs = new URLSearchParams({
    crtfc_key: key,
    corp_code: args.corp_code,
    bsns_year: String(args.year),
    reprt_code: args.reprt,
    fs_div: args.fs_div,
  })

  const res = await fetch(`${endpoint}?${qs.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`OpenDART HTTP ${res.status} ${res.statusText}`)
  const json = (await res.json()) as DartFnlttApiResponse
  return json
}

async function syncOne(args: {
  corp_code: string
  year: number
  reprt: ReprtCode
  fs_div: FsDiv
  sj_div: SjDiv
}): Promise<Result> {
  const upstream = await fetchDartFnltt(args)
  const code = String(upstream.status ?? '')
  const msg = String(upstream.message ?? '')
  const list = Array.isArray(upstream.list) ? upstream.list : []

  // OpenDART: 000=정상, 013=데이터 없음
  if (code !== '000' && code !== '013') {
    return {
      corp_code: args.corp_code,
      year: args.year,
      reprt: args.reprt,
      fs_div: args.fs_div,
      sj_div: args.sj_div,
      ok: false,
      saved: 0,
      message: `OpenDART ${code}: ${msg || 'unknown error'}`,
    }
  }

  const rows: FnlttInsertRow[] = list
    .map((it) => ({
      corp_code: args.corp_code,
      bsns_year: args.year,
      reprt_code: args.reprt,
      fs_div: args.fs_div,
      sj_div: normalizeDartSjDiv(it.sj_div),
      account_nm: (it.account_nm ?? '').toString().trim() || null,
      account_id: (it.account_id ?? '').toString().trim() || null,
      thstrm_amount: toNumberOrNull(it.thstrm_amount),
      frmtrm_amount: toNumberOrNull(it.frmtrm_amount),
      ord: toNumberOrNull(it.ord),
      currency: (it.currency ?? '').toString().trim() || null,
    }))
    .filter((r) => r.sj_div === args.sj_div)

  const { error: delErr } = await supabaseAdmin
    .from('dart_fnltt')
    .delete()
    .eq('corp_code', args.corp_code)
    .eq('bsns_year', args.year)
    .eq('reprt_code', args.reprt)
    .eq('fs_div', args.fs_div)
    .eq('sj_div', args.sj_div)
  if (delErr) throw new Error(`delete failed: ${delErr.message}`)

  if (rows.length > 0) {
    const { error: insErr } = await supabaseAdmin.from('dart_fnltt').insert(rows)
    if (insErr) throw new Error(`insert failed: ${insErr.message}`)
  }

  return {
    corp_code: args.corp_code,
    year: args.year,
    reprt: args.reprt,
    fs_div: args.fs_div,
    sj_div: args.sj_div,
    ok: true,
    saved: rows.length,
    message: code === '013' ? 'no data' : 'synced',
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => ({}))) as PostBody

    const fromArray = toStringArray(raw.corp_codes)
    const fromSingle = typeof raw.corp_code === 'string' && raw.corp_code.trim() ? [raw.corp_code.trim()] : []
    const targets = fromArray.length > 0 ? fromArray : fromSingle

    if (targets.length === 0) {
      return NextResponse.json({ ok: false, error: 'corp_code(s) is required' }, { status: 400 })
    }

    const year = typeof raw.year === 'number' ? raw.year : new Date().getFullYear()
    const reprt = (typeof raw.reprt === 'string' ? raw.reprt : '11011') as ReprtCode
    const fs_div = (typeof raw.fs_div === 'string' ? raw.fs_div : 'OFS') as FsDiv

    let sjDivList: SjDiv[]
    if (Array.isArray(raw.sj_divs) && raw.sj_divs.length > 0) {
      const seen = new Set<SjDiv>()
      for (const x of raw.sj_divs) {
        const s = normalizeDartSjDiv(String(x))
        if (!seen.has(s)) seen.add(s)
      }
      sjDivList = Array.from(seen)
    } else {
      sjDivList = [normalizeDartSjDiv(typeof raw.sj_div === 'string' ? raw.sj_div : 'BS')]
    }

    const results: Result[] = []
    for (const corp_code of targets) {
      for (const sj_div of sjDivList) {
        try {
          const one = await syncOne({ corp_code, year, reprt, fs_div, sj_div })
          results.push(one)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error'
          results.push({
            corp_code,
            year,
            reprt,
            fs_div,
            sj_div,
            ok: false,
            saved: 0,
            message: msg,
          })
        }
      }
    }

    const ok = results.every((r) => r.ok)
    return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
