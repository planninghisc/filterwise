//src/app/api/dart/compare/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { CANON_OPTIONS, classifyToCanon, type CanonKey } from '@/lib/accountCanonical'
import { normalizeDartSjDiv, type ReprtCode, type FsDiv, type SjDiv } from '@/lib/dart'

type CanonSjDiv = 'BS' | 'CIS'
const asCanonSjDiv = (v: string): CanonSjDiv | null => (v === 'BS' || v === 'CIS' ? v : null)

type FnlttRow = {
  corp_code: string
  bsns_year: number
  reprt_code: ReprtCode
  fs_div: FsDiv
  sj_div: SjDiv
  account_nm: string | null
  account_id: string | null
  account_nm_norm?: string | null
  account_id_norm?: string | null
  canon_key?: string | null
  canon_score?: number | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
}

type CompareRow = {
  corp_code: string
  corp_name: string
  thstrm_amount: number
  frmtrm_amount: number
}


// 모든 CanonKey 집합 (타입 가드용)
const ALL_CANON_KEYS: readonly CanonKey[] = [
  ...CANON_OPTIONS.BS.map((o) => o.key),
  ...CANON_OPTIONS.CIS.map((o) => o.key),
] as const

function isCanonKey(s: string): s is CanonKey {
  return (ALL_CANON_KEYS as readonly string[]).includes(s)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const fsDiv = (searchParams.get('fs_div') ?? 'OFS') as FsDiv

    // 🔒 'PL' → 'CIS' 자동 정규화
    const sjDiv = normalizeDartSjDiv(searchParams.get('sj_div'))

    const canonKeyRaw = (searchParams.get('canon_key') ?? '').trim()
    const canonKey: CanonKey | null = canonKeyRaw && isCanonKey(canonKeyRaw) ? (canonKeyRaw as CanonKey) : null

    const accountNm = (searchParams.get('account_nm') ?? '').trim()
    const accountId = (searchParams.get('account_id') ?? '').trim()
    const corpCodes = (searchParams.get('corp_codes') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (!canonKey && !accountNm && !accountId) {
      return NextResponse.json(
        { ok: false, error: 'canon_key 또는 (account_nm/account_id) 중 하나는 필수입니다.' },
        { status: 400 },
      )
    }

    // ─────────────────────────────────────────────────────────
    // 쿼리: ⚠️ canon_key로 미리 필터링하지 않습니다.
    //      (캐시가 비어있을 때도 온더플라이 분류가 가능하도록)
    // ─────────────────────────────────────────────────────────
    let q = supabaseAdmin
      .from('dart_fnltt')
      .select(`
        corp_code, bsns_year, reprt_code, fs_div, sj_div,
        account_nm, account_id, account_nm_norm, account_id_norm,
        canon_key, canon_score, thstrm_amount, frmtrm_amount
      `)
      .eq('bsns_year', year)
      .eq('reprt_code', reprt)
      .eq('fs_div', fsDiv)
      .eq('sj_div', sjDiv)

    if (corpCodes.length > 0) q = q.in('corp_code', corpCodes)

    // 원천 기준으로 조회하는 경우에만 원천 필터 적용
    if (!canonKey) {
      if (accountId) q = q.eq('account_id', accountId)
      else q = q.eq('account_nm', accountNm)
    }

    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as FnlttRow[]

    const codesForNames =
      corpCodes.length > 0 ? corpCodes : [...new Set(rows.map((r) => r.corp_code))]
    const nameByCode = new Map<string, string>()
    if (codesForNames.length > 0) {
      const { data: corpRows, error: corpErr } = await supabaseAdmin
        .from('dart_corp')
        .select('corp_code, corp_name')
        .in('corp_code', codesForNames)
      if (corpErr) {
        console.warn('[compare] dart_corp lookup skipped:', corpErr.message)
      } else {
        for (const c of corpRows ?? []) {
          const row = c as { corp_code?: string; corp_name?: string | null }
          if (row.corp_code)
            nameByCode.set(row.corp_code, (row.corp_name ?? '').trim() || row.corp_code)
        }
      }
    }
    const corpLabel = (code: string) => nameByCode.get(code) || code

    const byCorp = new Map<string, CompareRow>()

    if (canonKey) {
      // ───────────────────────────────────────────────────
      // 캐논 기준: 캐시가 있으면 활용, 없으면 즉석 분류로 매칭
      // 회사별로 최고 score 1건을 대표로 사용
      // ───────────────────────────────────────────────────
      const bucket = new Map<
        string,
        { corp_code: string; corp_name: string; th: number; fr: number; score: number }
      >()

      for (const r of rows) {
        let matched = false
        let score = 0

        // 1) 캐시 우선
        if (r.canon_key === canonKey && typeof r.canon_score === 'number') {
          matched = true
          score = r.canon_score
        } else {
          // 2) 온더플라이 분류
          const canonSj = asCanonSjDiv(sjDiv)
          const c = canonSj ? classifyToCanon(canonSj, r.account_id, r.account_nm) : null
          if (c && c.key === canonKey) {
            matched = true
            score = c.score
          }
        }

        if (!matched) continue

        const corp = r.corp_code
        const corpName = corpLabel(corp)
        const th = r.thstrm_amount ?? 0
        const fr = r.frmtrm_amount ?? 0
        const prev = bucket.get(corp)
        const cand = { corp_code: corp, corp_name: corpName, th, fr, score }

        if (!prev || cand.score > prev.score || (cand.score === prev.score && Math.abs(cand.th) > Math.abs(prev.th))) {
          bucket.set(corp, cand)
        }
      }

      for (const v of bucket.values()) {
        byCorp.set(v.corp_code, {
          corp_code: v.corp_code,
          corp_name: v.corp_name,
          thstrm_amount: v.th,
          frmtrm_amount: v.fr,
        })
      }
    } else {
      // ───────────────────────────────────────────────────
      // 원천 기준: 같은 회사의 동일 원천계정( account_id + account_nm )을 합산
      // ───────────────────────────────────────────────────
      const keyOf = (r: FnlttRow) => `${r.corp_code}|${r.account_id ?? 'NA'}|${r.account_nm ?? ''}`
      const seen = new Set<string>()

      for (const r of rows) {
        const k = keyOf(r)
        if (seen.has(k)) continue
        seen.add(k)

        const corp = r.corp_code
        const corpName = corpLabel(corp)
        const th = r.thstrm_amount ?? 0
        const fr = r.frmtrm_amount ?? 0
        const prev =
          byCorp.get(corp) ?? { corp_code: corp, corp_name: corpName, thstrm_amount: 0, frmtrm_amount: 0 }
        prev.thstrm_amount += th
        prev.frmtrm_amount += fr
        byCorp.set(corp, prev)
      }
    }

    const out = Array.from(byCorp.values()).sort(
      (a, b) => (b.thstrm_amount ?? 0) - (a.thstrm_amount ?? 0),
    )
    return NextResponse.json({ ok: true, rows: out })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
