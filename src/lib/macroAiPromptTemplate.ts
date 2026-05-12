/**
 * 거시경제 AI 분석 프롬프트 템플릿.
 * `{{키}}` 형태는 서버에서 아래 ctx로 치환됩니다.
 */
export const MACRO_PROMPT_PLACEHOLDER_KEYS = [
  'PERIOD_KR',
  'START_DATE',
  'END_DATE',
  'KOSPI_PREV',
  'KOSPI_NOW',
  'USD_KRW_PREV',
  'USD_KRW_NOW',
  'KR_BOND_3Y_PREV',
  'KR_BOND_3Y_NOW',
  'US_BOND_10Y_PREV',
  'US_BOND_10Y_NOW',
  'NEWS_CONTEXT',
] as const

export type MacroPromptCtx = Record<(typeof MACRO_PROMPT_PLACEHOLDER_KEYS)[number], string>

export const DEFAULT_MACRO_PROMPT_TEMPLATE = `너는 한국 대형 증권사의 전사 기획팀 책임자야.
단순히 숫자를 읊어주는 수준을 넘어서, '국제 정세, 국내 정책, 주요 이벤트'가 시장 지표에 어떤 영향을 미쳤는지 입체적으로 분석해야 해.

[기간: {{START_DATE}} ~ {{END_DATE}}]

[1. 거시경제 지표 변화]
- KOSPI 지수: {{KOSPI_PREV}}pt -> {{KOSPI_NOW}}pt
- 원/달러 환율: {{USD_KRW_PREV}}원 -> {{USD_KRW_NOW}}원
- 국고채 3년물: {{KR_BOND_3Y_PREV}}% -> {{KR_BOND_3Y_NOW}}%
- 미국 10년물: {{US_BOND_10Y_PREV}}% -> {{US_BOND_10Y_NOW}}%

[2. 해당 기간 주요 뉴스 및 이벤트 (DB 수집 데이터)]
{{NEWS_CONTEXT}}

위 지표와 뉴스를 종합하여 다음 두 가지를 작성해 줘:
1. {{PERIOD_KR}} 시장 흐름 요약: 단순 수치 나열은 절대 금지! 제공된 '주요 뉴스'에서 드러난 이벤트나 이슈(예: 금리 결정, 미국 지표 발표, 지정학적 리스크, 특정 산업 호재 등)를 지표의 변동과 엮어서 스토리텔링 형식으로 3~4문장 요약해.
2. 기획팀 시사점: 이러한 매크로 및 이슈 환경이 증권사 주요 수익원(브로커리지, 채권운용, IB 등)에 미칠 구체적인 영향과 기획팀 차원의 대응 포인트를 도출해 줘 (불릿 포인트 2개).
마크다운을 쓰지 말고, 평문과 기호(-, 1. 등)만 사용해서 간결하고 전문적인 톤으로 작성해 줘.
`

export function applyMacroPromptTemplate(template: string, ctx: MacroPromptCtx): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = ctx[key as keyof MacroPromptCtx]
    return v != null ? v : `{{${key}}}`
  })
}

export function buildMacroPromptCtx(input: {
  period: 'daily' | 'weekly' | 'monthly'
  startDate: string
  endDate: string
  previousData: {
    kospi_index: number
    usd_krw: number
    kr_bond_3y: number
    us_bond_10y: number
  }
  latestData: {
    kospi_index: number
    usd_krw: number
    kr_bond_3y: number
    us_bond_10y: number
  }
  newsContext: string
}): MacroPromptCtx {
  const periodKr =
    input.period === 'daily' ? '일간' : input.period === 'weekly' ? '주간' : '월간'
  const p = input.previousData
  const l = input.latestData
  return {
    PERIOD_KR: periodKr,
    START_DATE: input.startDate,
    END_DATE: input.endDate,
    KOSPI_PREV: String(p.kospi_index),
    KOSPI_NOW: String(l.kospi_index),
    USD_KRW_PREV: String(p.usd_krw),
    USD_KRW_NOW: String(l.usd_krw),
    KR_BOND_3Y_PREV: p.kr_bond_3y.toFixed(3),
    KR_BOND_3Y_NOW: l.kr_bond_3y.toFixed(3),
    US_BOND_10Y_PREV: p.us_bond_10y.toFixed(3),
    US_BOND_10Y_NOW: l.us_bond_10y.toFixed(3),
    NEWS_CONTEXT: input.newsContext,
  }
}
