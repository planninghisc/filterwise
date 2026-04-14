// src/lib/accountCanonical.ts
// 표준 계정 키 > 계정과목이 비슷하거나 유사한 친구들을 묶어주는 역할!

import { normalizeAccountName } from './normalize'

// ── 타입
export type CanonKeyBS =
  | 'BS_TOTAL_ASSETS'
  | 'BS_TOTAL_LIABILITIES'
  | 'BS_TOTAL_EQUITY'
  | 'BS_CURRENT_ASSETS'
  | 'BS_NONCURRENT_ASSETS'
  | 'BS_CURRENT_LIABILITIES'
  | 'BS_NONCURRENT_LIABILITIES'
  | 'BS_RETAINED_EARNINGS'
  | 'BS_CAPITAL_STOCK'
  | 'BS_CAPITAL_SURPLUS'
  | 'BS_TREASURY_STOCK'
  | 'BS_DEPOSITS_FROM_CUSTOMERS'
  | 'BS_DERIVATIVE_ASSETS'
  | 'BS_DERIVATIVE_LIABILITIES'
  | 'BS_FVPL_FINANCIAL_ASSETS'
  | 'BS_FVPL_FINANCIAL_LIABILITIES'
  | 'BS_FVOCI_FINANCIAL_ASSETS'

export type CanonKeyCIS =
  | 'PL_REVENUE'
  | 'PL_OPERATING_REVENUE'
  | 'PL_OPERATING_EXPENSES'
  | 'PL_SGA'
  | 'PL_COST_OF_SALES'
  | 'PL_GROSS_PROFIT'
  | 'PL_OPERATING_PROFIT'
  | 'PL_NON_OPERATING_INCOME'
  | 'PL_NON_OPERATING_EXPENSES'
  | 'PL_INTEREST_INCOME'
  | 'PL_INTEREST_EXPENSE'
  | 'PL_FEE_REVENUE'
  | 'PL_FEE_EXPENSE'
  | 'PL_PROFIT_BEFORE_TAX'
  | 'PL_INCOME_TAX_EXPENSE'
  | 'PL_NET_PROFIT'
  | 'PL_OCI'
  | 'PL_TOTAL_COMPREHENSIVE_INCOME'
  | 'PL_FOREX_GAIN'
  | 'PL_FOREX_LOSS'
  | 'PL_DERIVATIVES_GAIN'
  | 'PL_DERIVATIVES_LOSS'
  | 'PL_LOANS_GAIN'
  | 'PL_LOANS_LOSS'
  | 'PL_FVPL_GAIN'
  | 'PL_FVPL_LOSS'
  | 'PL_FVOCI_GAIN'
  | 'PL_FVOCI_LOSS'

export type CanonKey = CanonKeyBS | CanonKeyCIS
export type CanonOption = { key: CanonKey; label: string }

export const CANON_OPTIONS: {
  BS: ReadonlyArray<CanonOption>
  CIS: ReadonlyArray<CanonOption>
} = {
  BS: [
    { key: 'BS_TOTAL_ASSETS', label: '자산총계' },
    { key: 'BS_TOTAL_LIABILITIES', label: '부채총계' },
    { key: 'BS_TOTAL_EQUITY', label: '자본총계' },
    { key: 'BS_CURRENT_ASSETS', label: '유동자산' },
    { key: 'BS_NONCURRENT_ASSETS', label: '비유동자산' },
    { key: 'BS_CURRENT_LIABILITIES', label: '유동부채' },
    { key: 'BS_NONCURRENT_LIABILITIES', label: '비유동부채' },
    { key: 'BS_RETAINED_EARNINGS', label: '이익잉여금' },
    { key: 'BS_CAPITAL_STOCK', label: '자본금' },
    { key: 'BS_CAPITAL_SURPLUS', label: '자본잉여금' },
    { key: 'BS_TREASURY_STOCK', label: '자기주식' },
    { key: 'BS_DEPOSITS_FROM_CUSTOMERS', label: '예수부채' },
    { key: 'BS_DERIVATIVE_ASSETS', label: '파생상품자산' },
    { key: 'BS_DERIVATIVE_LIABILITIES', label: '파생상품부채' },
    { key: 'BS_FVPL_FINANCIAL_ASSETS', label: '당기손익-공정가치측정 금융자산' },
    { key: 'BS_FVPL_FINANCIAL_LIABILITIES', label: '당기손익-공정가치측정 금융부채' },
    { key: 'BS_FVOCI_FINANCIAL_ASSETS', label: '기타포괄손익-공정가치측정 금융자산' },
  ] as const,
  CIS: [
    { key: 'PL_REVENUE', label: '매출액' },
    { key: 'PL_OPERATING_REVENUE', label: '영업수익' },
    { key: 'PL_OPERATING_EXPENSES', label: '영업비용' },
    { key: 'PL_SGA', label: '판매비와관리비' },
    { key: 'PL_COST_OF_SALES', label: '매출원가' },
    { key: 'PL_GROSS_PROFIT', label: '매출총이익' },
    { key: 'PL_OPERATING_PROFIT', label: '영업이익' },
    { key: 'PL_NON_OPERATING_INCOME', label: '영업외수익' },
    { key: 'PL_NON_OPERATING_EXPENSES', label: '영업외비용' },
    { key: 'PL_INTEREST_INCOME', label: '이자수익' },
    { key: 'PL_INTEREST_EXPENSE', label: '이자비용' },
    { key: 'PL_FEE_REVENUE', label: '수수료수익' },
    { key: 'PL_FEE_EXPENSE', label: '수수료비용' },
    { key: 'PL_FOREX_GAIN', label: '외환거래이익' },
    { key: 'PL_FOREX_LOSS', label: '외환거래손실' },
    { key: 'PL_DERIVATIVES_GAIN', label: '파생상품거래 및 평가이익' },
    { key: 'PL_DERIVATIVES_LOSS', label: '파생상품거래 및 평가손실' },
    { key: 'PL_LOANS_GAIN', label: '대출채권 평가 및 처분이익' },
    { key: 'PL_LOANS_LOSS', label: '대출채권 평가 및 처분손실' },
    { key: 'PL_FVPL_GAIN', label: '당기손익공정가치측정금융상품 관련이익' },
    { key: 'PL_FVPL_LOSS', label: '당기손익공정가치측정금융상품 관련손실' },
    { key: 'PL_FVOCI_GAIN', label: '기타포괄손익공정가치측정금융상품 관련이익' },
    { key: 'PL_FVOCI_LOSS', label: '기타포괄손익공정가치측정금융상품 관련손실' },
    { key: 'PL_PROFIT_BEFORE_TAX', label: '법인세차감전이익' },
    { key: 'PL_INCOME_TAX_EXPENSE', label: '법인세비용' },
    { key: 'PL_NET_PROFIT', label: '당기순이익' },
    { key: 'PL_OCI', label: '기타포괄손익' },
    { key: 'PL_TOTAL_COMPREHENSIVE_INCOME', label: '총포괄손익' },
  ] as const,
}

export type CanonClassify = { key: CanonKey; score: number } | null

// ── 유틸
function hasAny(hay: string, needles: ReadonlyArray<string>): boolean {
  for (const n of needles) if (n && hay.includes(n)) return true
  return false
}
function passNegatives(hay: string, negatives?: ReadonlyArray<string>): boolean {
  if (!negatives || negatives.length === 0) return true
  for (const n of negatives) if (n && hay.includes(n)) return false
  return true
}

// ── 규칙 타입
type Rule = {
  key: CanonKey
  idEquals?: ReadonlyArray<string>
  idIncludes?: ReadonlyArray<string>
  nameIncludes?: ReadonlyArray<string>
  nameExcludes?: ReadonlyArray<string>
  scoreBy: { idEquals?: number; idIncludes?: number; nameIncludes?: number }
}

// ── BS 규칙
const RULES_BS: ReadonlyArray<Rule> = [
  { key: 'BS_TOTAL_ASSETS',
    idEquals: ['ifrs-full_assets'],
    idIncludes: ['assets'],
    nameIncludes: ['자산총계','총자산'],
    nameExcludes: ['부채와자본','자본과부채','equityandliabilities'],
    scoreBy: { idEquals: 100, idIncludes: 90, nameIncludes: 86 },
  },
  { key: 'BS_TOTAL_LIABILITIES',
    idEquals: ['ifrs-full_liabilities'],
    idIncludes: ['liabilities'],
    nameIncludes: ['부채총계','총부채'],
    nameExcludes: ['자본총계','총자본','equityandliabilities'],
    scoreBy: { idEquals: 100, idIncludes: 88, nameIncludes: 84 },
  },
  { key: 'BS_TOTAL_EQUITY',
    idEquals: ['ifrs-full_equity'],
    idIncludes: ['equity'],
    nameIncludes: ['자본총계','총자본'],
    scoreBy: { idEquals: 100, idIncludes: 88, nameIncludes: 84 },
  },
  { key: 'BS_CURRENT_ASSETS',
    idEquals: ['ifrs-full_currentassets'],
    idIncludes: ['currentassets'],
    nameIncludes: ['유동자산'],
    scoreBy: { idEquals: 95, idIncludes: 88, nameIncludes: 86 },
  },
  { key: 'BS_NONCURRENT_ASSETS',
    idEquals: ['ifrs-full_noncurrentassets'],
    idIncludes: ['noncurrentassets','non-currentassets'],
    nameIncludes: ['비유동자산','장기자산'],
    scoreBy: { idEquals: 95, idIncludes: 88, nameIncludes: 86 },
  },
  { key: 'BS_CURRENT_LIABILITIES',
    idEquals: ['ifrs-full_currentliabilities'],
    idIncludes: ['currentliabilities'],
    nameIncludes: ['유동부채'],
    scoreBy: { idEquals: 95, idIncludes: 88, nameIncludes: 86 },
  },
  { key: 'BS_NONCURRENT_LIABILITIES',
    idEquals: ['ifrs-full_noncurrentliabilities'],
    idIncludes: ['noncurrentliabilities','non-currentliabilities','longtermliabilities'],
    nameIncludes: ['비유동부채','장기부채'],
    scoreBy: { idEquals: 95, idIncludes: 88, nameIncludes: 86 },
  },
  { key: 'BS_RETAINED_EARNINGS',
    idEquals: ['ifrs-full_retainedearnings'],
    idIncludes: ['retainedearnings'],
    nameIncludes: ['이익잉여금','이익준비금'],
    scoreBy: { idEquals: 94, idIncludes: 88, nameIncludes: 86 },
  },
  { key: 'BS_CAPITAL_STOCK',
    idIncludes: ['issuedcapital','sharecapital','capitalstock'],
    nameIncludes: ['자본금','발행자본'],
    scoreBy: { idIncludes: 88, nameIncludes: 86 },
  },
  { key: 'BS_CAPITAL_SURPLUS',
    idIncludes: ['sharepremium','capitalreserves','capitalsurplus'],
    nameIncludes: ['자본잉여금','주식발행초과금','주식발행프리미엄'],
    scoreBy: { idIncludes: 88, nameIncludes: 86 },
  },
  { key: 'BS_TREASURY_STOCK',
    idIncludes: ['treasuryshares','treasurystock'],
    nameIncludes: ['자기주식'],
    scoreBy: { idIncludes: 88, nameIncludes: 86 },
  },
  { key: 'BS_DEPOSITS_FROM_CUSTOMERS',
    idEquals: ['ifrs-full_depositsfromcustomers'],
    idIncludes: ['depositsfromcustomers'],
    nameIncludes: ['예수부채'],
    scoreBy: { idEquals: 96, idIncludes: 90, nameIncludes: 88 },
  },
  { key: 'BS_DERIVATIVE_ASSETS',
    idIncludes: ['derivativeassets'],
    nameIncludes: ['파생상품자산'],
    scoreBy: { idIncludes: 88, nameIncludes: 90 },
  },
  { key: 'BS_DERIVATIVE_LIABILITIES',
    idIncludes: ['derivativeliabilities'],
    nameIncludes: ['파생상품부채'],
    scoreBy: { idIncludes: 88, nameIncludes: 90 },
  },
  { key: 'BS_FVPL_FINANCIAL_ASSETS',
    idIncludes: ['financialassetsatfairvalueprofitloss','fvpl'],
    nameIncludes: ['당기손익공정가치측정금융자산','당기손익공정가치측정금융자산'],
    scoreBy: { idIncludes: 90, nameIncludes: 92 },
  },
  { key: 'BS_FVPL_FINANCIAL_LIABILITIES',
    idIncludes: ['financialliabilitiesatfairvalueprofitloss','fvpl'],
    nameIncludes: ['당기손익공정가치측정금융부채','당기손익공정가치측정금융부채'],
    scoreBy: { idIncludes: 90, nameIncludes: 92 },
  },
  { key: 'BS_FVOCI_FINANCIAL_ASSETS',
    idIncludes: ['financialassetsatfairvalueothercomprehensiveincome','fvoci'],
    nameIncludes: ['기타포괄손익공정가치측정금융자산'],
    scoreBy: { idIncludes: 90, nameIncludes: 92 },
  },
]

// ── PL 규칙
const RULES_CIS: ReadonlyArray<Rule> = [
  { key: 'PL_REVENUE',
    idEquals: ['ifrs-full_revenue'],
    idIncludes: ['revenue'],
    nameIncludes: ['매출액'],
    nameExcludes: ['영업수익'],
    scoreBy: { idEquals: 96, idIncludes: 86, nameIncludes: 92 },
  },
  { key: 'PL_OPERATING_REVENUE',
    idIncludes: ['operatingrevenue'],
    nameIncludes: ['영업수익'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_OPERATING_EXPENSES',
    idIncludes: ['operatingexpenses'],
    nameIncludes: ['영업비용'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_SGA',
    idIncludes: ['sellinggeneralandadministrative','sellingadministrative'],
    nameIncludes: ['판매비와관리비','판매관리비','판관비'],
    scoreBy: { idIncludes: 86, nameIncludes: 92 },
  },
  { key: 'PL_COST_OF_SALES',
    idEquals: ['ifrs-full_costofsales'],
    idIncludes: ['costofsales'],
    nameIncludes: ['매출원가'],
    scoreBy: { idEquals: 96, idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_GROSS_PROFIT',
    idEquals: ['ifrs-full_grossprofit'],
    idIncludes: ['grossprofit'],
    nameIncludes: ['매출총이익','매출총손익'],
    scoreBy: { idEquals: 96, idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_OPERATING_PROFIT',
    idEquals: ['ifrs-full_profitlossfromoperatingactivities'],
    idIncludes: ['profitlossfromoperatingactivities','operatingprofit','operatingincome','ebit'],
    nameIncludes: ['영업이익'],
    scoreBy: { idEquals: 100, idIncludes: 92, nameIncludes: 94 },
  },
  { key: 'PL_NON_OPERATING_INCOME',
    idIncludes: ['nonoperatingincome','otherincome'],
    nameIncludes: ['영업외수익','기타수익','영업외이익'],
    nameExcludes: ['이자수익','수수료수익'],
    scoreBy: { idIncludes: 86, nameIncludes: 90 },
  },
  { key: 'PL_NON_OPERATING_EXPENSES',
    idIncludes: ['nonoperatingexpenses','otherexpenses'],
    nameIncludes: ['영업외비용','기타비용','영업외손실'],
    nameExcludes: ['이자비용','수수료비용'],
    scoreBy: { idIncludes: 86, nameIncludes: 90 },
  },
  { key: 'PL_INTEREST_INCOME',
    idIncludes: ['financeincome','interestincome'],
    nameIncludes: ['이자수익','금융수익'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_INTEREST_EXPENSE',
    idIncludes: ['financecosts','interestexpense'],
    nameIncludes: ['이자비용','금융비용'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_FEE_REVENUE',
    idIncludes: ['feeandcommissionincome','commissionincome','feeincome'],
    nameIncludes: ['수수료수익','수수료이익'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_FEE_EXPENSE',
    idIncludes: ['feeandcommissionexpense','commissionexpense','feeexpense'],
    nameIncludes: ['수수료비용','수수료손실'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_FOREX_GAIN',
    idIncludes: ['foreignexchangegain','forexgain'],
    nameIncludes: ['외환거래이익','외화환산이익'],
    scoreBy: { idIncludes: 86, nameIncludes: 92 },
  },
  { key: 'PL_FOREX_LOSS',
    idIncludes: ['foreignexchangeloss','forexloss'],
    nameIncludes: ['외환거래손실','외화환산손실'],
    scoreBy: { idIncludes: 86, nameIncludes: 92 },
  },
  { key: 'PL_DERIVATIVES_GAIN',
    idIncludes: ['derivativegain','derivativesgain'],
    nameIncludes: ['파생상품거래및평가이익'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_DERIVATIVES_LOSS',
    idIncludes: ['derivativeloss','derivativesloss'],
    nameIncludes: ['파생상품거래및평가손실'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_LOANS_GAIN',
    idIncludes: ['loansgain','loanassetsgain'],
    nameIncludes: ['대출채권평가및처분이익'],
    scoreBy: { idIncludes: 86, nameIncludes: 92 },
  },
  { key: 'PL_LOANS_LOSS',
    idIncludes: ['loansloss','loanassetsloss'],
    nameIncludes: ['대출채권평가및처분손실'],
    scoreBy: { idIncludes: 86, nameIncludes: 92 },
  },
  { key: 'PL_FVPL_GAIN',
    idIncludes: ['fairvalueprofitlossgain','fvplgain'],
    nameIncludes: ['당기손익공정가치측정금융상품관련이익','당기손익공정가치지정금융상품관련이익'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_FVPL_LOSS',
    idIncludes: ['fairvalueprofitlossloss','fvplloss'],
    nameIncludes: ['당기손익공정가치측정금융상품관련손실','당기손익공정가치지정금융상품관련손실'],
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_FVOCI_GAIN',
    idIncludes: ['fvocigain'],
    nameIncludes: ['기타포괄손익공정가치측정금융상품관련이익'],
    scoreBy: { idIncludes: 86, nameIncludes: 92 },
  },
  { key: 'PL_FVOCI_LOSS',
    idIncludes: ['fvociloss'],
    nameIncludes: ['기타포괄손익공정가치측정금융상품관련손실'],
    scoreBy: { idIncludes: 86, nameIncludes: 92 },
  },
  { key: 'PL_PROFIT_BEFORE_TAX',
    idIncludes: ['profitbeforetax','incomebeforetax','profitlossbeforetax'],
    nameIncludes: ['법인세차감전이익','법인세비용차감전이익','법인세차감전손익','법인세비용차감전손익'],
    scoreBy: { idIncludes: 90, nameIncludes: 94 },
  },
  { key: 'PL_INCOME_TAX_EXPENSE',
    idIncludes: ['incometaxexpense','taxexpense'],
    nameIncludes: ['법인세비용','법인세'],
    scoreBy: { idIncludes: 88, nameIncludes: 90 },
  },
  { key: 'PL_NET_PROFIT',
    idEquals: ['ifrs-full_profitloss'],
    idIncludes: ['profitloss','netincome','netprofit'],
    nameIncludes: ['당기순이익','분기순이익','반기순이익','당기순손익'],
    nameExcludes: ['영업이익'],
    scoreBy: { idEquals: 100, idIncludes: 90, nameIncludes: 94 },
  },
  { key: 'PL_OCI',
    idIncludes: ['othercomprehensiveincome','oci'],
    nameIncludes: ['기타포괄손익'],
    nameExcludes: ['귀속'], // 귀속 표는 제외
    scoreBy: { idIncludes: 88, nameIncludes: 92 },
  },
  { key: 'PL_TOTAL_COMPREHENSIVE_INCOME',
    idIncludes: ['totalcomprehensiveincome'],
    nameIncludes: ['총포괄손익','총포괄이익'],
    nameExcludes: ['귀속'],
    scoreBy: { idIncludes: 90, nameIncludes: 92 },
  },
]

// ── 매칭 엔진
export function classifyToCanon(
  sj: 'BS' | 'CIS',
  account_id?: string | null,
  account_nm?: string | null
): CanonClassify {
  const id = (account_id ?? '').toLowerCase()
  const nmN = normalizeAccountName(account_nm)
  const rules = sj === 'BS' ? RULES_BS : RULES_CIS

  let best: { key: CanonKey; score: number } | null = null

  for (const r of rules) {
    let s = 0

    if (id && r.idEquals && hasAny(id, r.idEquals)) {
      s = Math.max(s, r.scoreBy.idEquals ?? 0)
    }
    if (id && r.idIncludes && hasAny(id, r.idIncludes)) {
      s = Math.max(s, r.scoreBy.idIncludes ?? 0)
    }
    if (nmN && passNegatives(nmN, r.nameExcludes) && r.nameIncludes && hasAny(nmN, r.nameIncludes)) {
      s = Math.max(s, r.scoreBy.nameIncludes ?? 0)
    }

    if (s > 0 && (!best || s > best.score)) best = { key: r.key, score: s }
  }

  // 헤더 교정: 부채와자본총계 → 자산총계로 보정
  if (!best && sj === 'BS') {
    if (nmN.includes('부채와자본총계') || nmN.includes('자본과부채총계') || id.includes('equityandliabilities')) {
      best = { key: 'BS_TOTAL_ASSETS', score: 70 }
    }
  }
  return best
}

export function canonLabel(key: CanonKey): string {
  const found = CANON_OPTIONS.BS.find(x => x.key === key) ?? CANON_OPTIONS.CIS.find(x => x.key === key)
  return found?.label ?? key
}
