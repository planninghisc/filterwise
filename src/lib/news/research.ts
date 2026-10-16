// src/lib/news/research.ts
// 일일 브리핑의 "리서치 리포트 관련" 분류 (서버·클라이언트 공용)
// 기준: 우리 회사(한화투자증권) 리서치가 다뤄진 기사. 다른 증권사 연구원 인용만 있는 기사는 일반.
// 1) 제목이 우리 리서치 인용 형태('한화證 "…"', '…-한화')면 리서치
// 2) 제목에 리서치 단어(목표가·투자의견 등)가 있고, 제목이나 본문에 우리 회사 리서치가 나오면 리서치
// 3) 우리 회사가 제목의 주인공(위에 해당 안 함)이면 회사 뉴스 → 일반
// 4) 본문에 한화투자증권 연구원·리서치센터 또는 '한화투자증권은 ○○에 대해 투자의견/목표주가'가 나오면 리서치

const OUR = /한화투자증권|한화증권|한화證/

/** 제목이 우리 리서치 인용 형태 */
const TITLE_OUR_QUOTE = [
  /(?:한화투자증권|한화증권|한화證)\s*["“”'‘’]/, // 한화證 "포스코홀딩스, …"
  /[-–—]\s*한화(?:투자증권|證|증권)?\s*$/, // …목표가↓"-한화
]

/** 제목의 리서치 단어 ('리포트'는 [스페셜리포트] 같은 코너명이 많아 제외) */
const TITLE_RESEARCH_WORD = /목표\s*(?:주)?가|투자\s*의견|매수\s*(?:유지|의견)|커버리지|애널리스트|연구원|리서치/

/** 본문에 우리 회사 리서치가 나오는 형태 */
const BODY_OUR_RESEARCH = [
  /(?:한화투자증권|한화증권|한화證)\s*(?:리서치센터|리서치|연구원|애널리스트|센터장)/,
  /(?:한화투자증권|한화증권|한화證)\s+[가-힣]{2,4}\s*(?:연구원|애널리스트|리서치센터장|센터장)/, // 한화투자증권 김OO 연구원
  /[가-힣]{2,4}\s*(?:한화투자증권|한화증권|한화證)\s*(?:연구원|애널리스트|센터장)/, // 김OO 한화투자증권 연구원
  /(?:한화투자증권|한화증권|한화證)(?:은|는)\s*[^.]{0,30}?(?:투자\s*의견|목표\s*(?:주)?가)/, // 한화투자증권은 16일 코웨이에 대해 투자의견 …
]

function decode(s: string): string {
  return s.replace(/<[^>]*>?/g, ' ').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&amp;/gi, '&')
}

export function isResearchArticle(title: string, content?: string | null): boolean {
  const t = decode(title).trim()
  const body = decode(content ?? '')
  const bodyHasOurs = BODY_OUR_RESEARCH.some((re) => re.test(body))

  if (TITLE_OUR_QUOTE.some((re) => re.test(t))) return true
  if (TITLE_RESEARCH_WORD.test(t) && (OUR.test(t) || bodyHasOurs)) return true
  if (OUR.test(t)) return false
  return bodyHasOurs
}
