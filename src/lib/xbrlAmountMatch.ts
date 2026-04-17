import type { XbrlCatalogLine } from '@/data/xbrlHanwhaCatalog'

export type FnlttMatchRow = {
  corp_code: string
  sj_div: string
  fs_div: string
  sheet_code: string | null
  account_id: string | null
  account_nm: string | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
}

function normId(s: string | null | undefined): string {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[^#]*#/i, '')
}

/** 엑셀 DS 코드 ↔ OFS/CFS·PL/BS */
export function expectedSheetForLine(line: XbrlCatalogLine, fs_div: 'OFS' | 'CFS'): string {
  if (line.sj === 'CIS') return fs_div === 'OFS' ? 'DS320005' : 'DS320000'
  return fs_div === 'OFS' ? 'DS220005' : 'DS220000'
}

export function pickLineAmount(
  rows: FnlttMatchRow[],
  corp: string,
  line: XbrlCatalogLine,
  fs_div: 'OFS' | 'CFS',
  which: 'th' | 'fr',
): number | null {
  const ws = expectedSheetForLine(line, fs_div)
  const q = fs_div === 'OFS' ? line.qname_ofs : line.qname_cfs
  const targets = new Set([normId(line.id), normId(q)].filter((x) => x.length > 0))

  const subset = rows.filter(
    (r) =>
      r.corp_code === corp &&
      r.fs_div === fs_div &&
      r.sj_div === line.sj &&
      (!r.sheet_code || r.sheet_code === ws),
  )

  let bestAbs = -1
  let bestVal: number | null = null

  for (const r of subset) {
    const aid = normId(r.account_id)
    let hit = false
    for (const t of targets) {
      if (!t) continue
      if (aid === t || aid.endsWith(`:${t}`) || aid.endsWith(`_${t}`) || t.endsWith(aid)) {
        hit = true
        break
      }
    }
    if (!hit && line.label && (r.account_nm ?? '').trim() === line.label.trim()) hit = true
    if (!hit) continue

    const raw = which === 'th' ? r.thstrm_amount : r.frmtrm_amount
    if (raw == null || Number.isNaN(Number(raw))) continue
    const v = Number(raw)
    const abs = Math.abs(v)
    if (abs > bestAbs) {
      bestAbs = abs
      bestVal = v
    }
  }
  return bestVal
}
