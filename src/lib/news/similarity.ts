// src/lib/news/similarity.ts
// 같은 내용을 여러 매체가 제목만 바꿔 낸 기사("같은 이야기")를 판별한다.
// 제목을 정규화한 뒤 두 글자 단위(bigram) 집합의 자카드 유사도로 비교.
// 기준값 0.3: 최근 7일 운영 데이터로 비교 — 0.4는 같은 사건의 다른 제목을 놓치고,
// 0.25부터는 관련만 있는 다른 기사(예: 운용사별 펀드 기사)까지 묶여서 0.3으로 정함.
export const SAME_STORY_THRESHOLD = 0.3

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'" }

/** 네이버 검색 결과 제목에 섞인 HTML 엔티티(&quot; 등)를 글자로 되돌린다 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#?[a-z0-9]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
}

/** 비교용 정규화: 엔티티 해제, [모닝 리포트] 같은 머리말 제거, 기호·공백 제거 */
function normalizeTitle(title: string): string {
  return decodeEntities(title)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}

export function titleBigrams(title: string): Set<string> {
  const s = normalizeTitle(title)
  const out = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}

export function isSameStory(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false
  let common = 0
  for (const x of a) if (b.has(x)) common++
  return common / (a.size + b.size - common) >= SAME_STORY_THRESHOLD
}
