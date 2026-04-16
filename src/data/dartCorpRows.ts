/**
 * DART 분석 대상 증권사 — DB `dart_corp`가 주 목록이며, 비어 있을 때만 아래 기본 행을 씁니다.
 * 규모: tier = large | mid. 피어 그룹은 is_peer(중소형사와 독립적으로 겹칠 수 있음).
 */
export type DartCorpTier = 'large' | 'mid'

export type DartCorpRow = { corp_code: string; corp_name: string; tier?: DartCorpTier; is_peer?: boolean }

/** 규모 라벨만 */
export const DART_SIZE_TIER_LABEL: Record<DartCorpTier, string> = {
  large: '대형사',
  mid: '중소형사',
}

const TIER_ORDER: Record<DartCorpTier, number> = { large: 0, mid: 1 }

/** DB에 규모가 없을 때(구 스키마) 코드별 폴백 */
export const STATIC_TIER_BY_CODE: Record<string, DartCorpTier> = {
  '00104856': 'large',
  '00120182': 'large',
  '00138321': 'large',
  '00160144': 'large',
  '00164876': 'large',
  '00163682': 'large',
  '00148610': 'mid',
  '00110893': 'mid',
  '00113359': 'mid',
  '00117601': 'mid',
  '00136721': 'mid',
  '00137997': 'mid',
  '00148665': 'mid',
  '00684918': 'mid',
}

export const DART_CORP_ROWS: readonly DartCorpRow[] = [
  { corp_code: '00104856', corp_name: '삼성증권', tier: 'large', is_peer: false },
  { corp_code: '00110893', corp_name: '대신증권', tier: 'mid', is_peer: false },
  { corp_code: '00113359', corp_name: '교보증권', tier: 'mid', is_peer: false },
  { corp_code: '00117601', corp_name: '유안타증권', tier: 'mid', is_peer: false },
  { corp_code: '00120182', corp_name: 'NH투자증권', tier: 'large', is_peer: false },
  { corp_code: '00136721', corp_name: '신영증권', tier: 'mid', is_peer: false },
  { corp_code: '00137997', corp_name: '현대차증권', tier: 'mid', is_peer: false },
  { corp_code: '00138321', corp_name: '신한투자증권', tier: 'large', is_peer: false },
  { corp_code: '00148610', corp_name: '한화투자증권', tier: 'mid', is_peer: false },
  { corp_code: '00148665', corp_name: 'iM투자증권', tier: 'mid', is_peer: false },
  { corp_code: '00160144', corp_name: '한국투자증권', tier: 'large', is_peer: false },
  { corp_code: '00163682', corp_name: '메리츠증권', tier: 'large', is_peer: false },
  { corp_code: '00164876', corp_name: 'KB증권', tier: 'large', is_peer: false },
  { corp_code: '00684918', corp_name: 'IBK투자증권', tier: 'mid', is_peer: false },
] as const

export const DART_CORP_CODES: readonly string[] = DART_CORP_ROWS.map((c) => c.corp_code)

const FALLBACK_NAME: Record<string, string> = Object.fromEntries(
  DART_CORP_ROWS.map((c) => [c.corp_code, c.corp_name]),
)

function normalizeSizeTier(raw: string | null | undefined, corpCode: string): DartCorpTier {
  const t = String(raw ?? '').trim()
  if (t === 'large' || t === 'mid') return t
  if (t === 'peer') return 'mid'
  return STATIC_TIER_BY_CODE[corpCode] ?? 'mid'
}

/** 드롭다운·표시용: 규모 + (선택) 피어 */
export function formatDartCorpLabel(tier: DartCorpTier, is_peer: boolean): string {
  const base = DART_SIZE_TIER_LABEL[tier]
  if (tier === 'mid' && is_peer) return `${base} · 피어`
  return base
}

export type MergedDartCorp = { corp_code: string; corp_name: string; tier: DartCorpTier; is_peer: boolean }

type DbCorpRow = { corp_code: string; corp_name: string; tier?: string | null; is_peer?: boolean | null }

/** DB 목록을 우선합니다. DB가 비어 있으면 기본 14사를 씁니다. */
export function mergeDartCorpsFromDb(dbList: readonly DbCorpRow[]): MergedDartCorp[] {
  const mapRow = (c: DbCorpRow): MergedDartCorp => {
    const rawTier = String(c.tier ?? '').trim()
    const tier = normalizeSizeTier(c.tier, c.corp_code)
    const is_peer =
      tier === 'large' ? false : Boolean(c.is_peer) || rawTier === 'peer'
    return {
      corp_code: c.corp_code,
      corp_name: (c.corp_name ?? '').trim() || FALLBACK_NAME[c.corp_code] || c.corp_code,
      tier,
      is_peer,
    }
  }

  const sortFn = (a: MergedDartCorp, b: MergedDartCorp) => {
    const od = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    if (od !== 0) return od
    return a.corp_name.localeCompare(b.corp_name, 'ko')
  }

  if (dbList.length > 0) {
    return dbList.map(mapRow).sort(sortFn)
  }

  return DART_CORP_ROWS.map((c) =>
    mapRow({ corp_code: c.corp_code, corp_name: c.corp_name, tier: c.tier, is_peer: c.is_peer }),
  ).sort(sortFn)
}

