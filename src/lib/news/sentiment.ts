// src/lib/news/sentiment.ts
// 뉴스 긍정/부정 판정 (규칙 기반, 서버·클라이언트 공용)
// - 제목 중심: 제목 점수 ×3 + 본문 앞부분(리드) 점수 ×1. 본문 전체는 일반 경제 용어가 많아 판정을 흐려서 보지 않는다.
// - 문맥 구문을 먼저 본다: "적자 축소", "목표가 하향", "실적 부진" 등은 단어 하나씩보다 정확하다.
// - 합계가 +2 이상이면 긍정, -2 이하면 부정, 그 사이는 중립 (리드에 단어 하나만 걸린 경우는 중립).

export type SentimentLabel = '긍정' | '부정' | '중립'

const LEAD_CHARS = 200
const TITLE_WEIGHT = 3
const THRESHOLD = 2

/** 문맥 구문: 맞으면 해당 부분을 지우고 점수를 매긴다 (단어 규칙과 중복 계산 방지) */
const PHRASES: Array<[RegExp, number]> = [
  // 상품·정책 이름에 들어간 단어는 판정에서 뺀다 (예: 국민성장펀드)
  [/성장s*펀드|성장s*사다리/g, 0],
  [/흑자\s*전환/g, 2],
  [/적자\s*(폭\s*)?(축소|감소|개선|탈출)/g, 2],
  [/손실\s*(폭\s*)?(축소|감소)/g, 2],
  [/(우려|불확실성|리스크)\s*(해소|완화)/g, 2],
  [/목표\s*(주)?가[^.,…]{0,12}?상향/g, 2],
  [/(투자\s*)?의견[^.,…]{0,8}?상향/g, 2],
  [/(사상\s*)?최대\s*(실적|매출|이익|순이익|영업이익)/g, 2],
  [/(실적|이익|순익|매출|수익성?|손익)[^.,…]{0,6}?(개선|증가|성장|호조|확대|급증|양호)/g, 2],
  [/흑자\s*(폭\s*)?축소/g, -2],
  [/적자\s*(전환|확대|지속|늪)/g, -2],
  [/목표\s*(주)?가[^.,…]{0,12}?하향/g, -2],
  [/(투자\s*)?의견[^.,…]{0,8}?하향/g, -2],
  [/(실적|이익|순익|매출|수익성?|마진|손익)[^.,…]{0,6}?(감소|악화|둔화|부진|하락|주춤|급감|흐림)/g, -2],
]

const POSITIVE = [
  '상승', '급등', '반등', '강세', '호재', '호조', '호실적', '개선', '증가', '성장', '흑자', '상향', '최고',
  '신고가', '돌파', '반전', '흥행', '달성', '회복', '수혜', '선정', '수상', '인가', '도약', '양호', '최선호', '순매수', '소각',
]
const NEGATIVE = [
  '하락', '급락', '약세', '악재', '악화', '감소', '손실', '적자', '하향', '부진', '둔화', '우려', '리스크', '불확실',
  '불투명', '부담', '주춤', '흐림', '이중고', '떨어', '추락', '최저', '신저가', '미달', '이탈', '실패', '징계', '제재',
  '과징금', '소송', '피소', '불복', '횡령', '배임', '사고', '장애', '오류', '민원', '분쟁', '논란', '압수수색', '적발',
  '흔들', '순매도', '엇갈',
]

function decode(s: string): string {
  return s
    .replace(/<[^>]*>?/g, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
}

/** 한 구간의 점수 (구문 → 단어 순) */
function scoreSegment(raw: string): number {
  let text = decode(raw)
  let score = 0
  for (const [re, pts] of PHRASES) {
    text = text.replace(re, () => {
      score += pts
      return ' '
    })
  }
  for (const w of POSITIVE) if (text.includes(w)) score += 1
  for (const w of NEGATIVE) if (text.includes(w)) score -= 1
  return score
}

export function sentimentScore(title: string, content?: string | null): number {
  const lead = decode(content ?? '').replace(/\s+/g, ' ').trim().slice(0, LEAD_CHARS)
  return scoreSegment(title) * TITLE_WEIGHT + scoreSegment(lead)
}

export function classifySentiment(title: string, content?: string | null): SentimentLabel {
  const score = sentimentScore(title, content)
  if (score >= THRESHOLD) return '긍정'
  if (score <= -THRESHOLD) return '부정'
  return '중립'
}
