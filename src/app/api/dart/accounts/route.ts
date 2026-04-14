import { NextRequest, NextResponse } from 'next/server'
import type { ReprtCode, FsDiv, SjDiv } from '@/lib/dart'

type Row = {
  account_id: string | null
  account_nm: string | null
}

type AccountItem = { account_nm: string; account_id: string | null; key: string }

function normalizeSjDiv(v?: string | null): SjDiv {
  const s = (v ?? '').toUpperCase()
  if (s === 'CIS' || s === 'PL' || s === 'IS') return 'CIS'
  return 'BS'
}

function sjQueryValues(base: SjDiv): Array<SjDiv | 'IS'> {
  return base === 'BS' ? ['BS'] : ['CIS', 'IS']
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')           // 모든 공백 제거
    .replace(/[()\[\]{}·,./\\-]+/g, '') // 흔한 구분 기호 제거
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode
    const fsDiv = (searchParams.get('fs_div') ?? 'OFS') as FsDiv
    const sjDiv = normalizeSjDiv(searchParams.get('sj_div'))

    // 명시적으로 바꾸고 싶다면 ?group_by=account_id 전달 가능 (기본 account_id)
    const groupBy = (searchParams.get('group_by') ?? 'account_id').toLowerCase()

    const { data, error } = await (await import('@/lib/supabaseAdmin')).supabaseAdmin
      .from('dart_fnltt')
      .select('account_id, account_nm')
      .eq('bsns_year', year)
      .eq('reprt_code', reprt)
      .eq('fs_div', fsDiv)
      .in('sj_div', sjQueryValues(sjDiv))

    if (error) throw error

    const rows: Row[] = (data ?? []).map((r) => ({
      account_id: r.account_id,
      account_nm: r.account_nm,
    }))

    // ── 그룹핑: account_id 기준(기본), account_id 없으면 정규화된 이름으로
    type Agg = { id: string | null; names: Map<string, number> }
    const byId = new Map<string, Agg>()   // id 존재 그룹
    const byNm = new Map<string, Agg>()   // id 없음 → 정규화된 이름 그룹

    for (const r of rows) {
      const nm = (r.account_nm ?? '').trim()
      if (!r.account_id) {
        const key = normalizeName(nm)
        const agg = byNm.get(key) ?? { id: null, names: new Map<string, number>() }
        agg.names.set(nm, (agg.names.get(nm) ?? 0) + 1)
        byNm.set(key, agg)
      } else {
        const id = r.account_id
        const agg = byId.get(id) ?? { id, names: new Map<string, number>() }
        agg.names.set(nm, (agg.names.get(nm) ?? 0) + 1)
        byId.set(id, agg)
      }
    }

    // 대표 이름 선택: 가장 많이 등장한 이름(동률이면 길이가 긴 이름 → 사전순)
    function pickName(m: Map<string, number>): string {
      const arr = Array.from(m.entries())
      arr.sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]      // 빈도 desc
        if (b[0].length !== a[0].length) return b[0].length - a[0].length // 길이 desc
        return a[0].localeCompare(b[0], 'ko')      // 이름 asc
      })
      return arr[0]?.[0] ?? ''
    }

    const list: AccountItem[] = []

    // account_id 그룹
    for (const [id, agg] of byId.entries()) {
      const name = pickName(agg.names) || id
      list.push({
        account_id: id,
        account_nm: name,
        key: `${id}|${name}`,
      })
    }

    // id 없는 그룹(정규화된 이름 그룹)
    for (const [nmKey, agg] of byNm.entries()) {
      const name = pickName(agg.names) || nmKey
      list.push({
        account_id: null,
        account_nm: name,
        key: `NA|${name}`,
      })
    }

    // 정렬: account_id 우선 → 이름
    list.sort((a, b) => {
      if (a.account_id && !b.account_id) return -1
      if (!a.account_id && b.account_id) return 1
      const an = a.account_nm.toLowerCase()
      const bn = b.account_nm.toLowerCase()
      return an.localeCompare(bn, 'ko')
    })

    // 필요 시 group_by=simple이면(예: 디버그) 이름만 기반 묶기 등도 확장 가능
    if (groupBy !== 'account_id') {
      // 현재는 account_id만 지원(요청대로). 필요하면 추가 분기 작성.
    }

    return NextResponse.json({ ok: true, list })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
