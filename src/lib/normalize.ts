// src/lib/normalize.ts

/* DART의 계정 정규화를 위한 모듈 특수기호 등 단순화
* 계정명 강한 정규화: 공백/구두점/로마숫자/섹션번호 제거 + NFKC + 소문자 */
export function normalizeAccountName(s?: string | null): string {
  const raw = (s ?? '').toString()
  return raw
    .normalize('NFKC')
    .replace(/[(){}\[\]·ㆍ・,.\-_/]/g, '')
    .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, '')
    .replace(/\b[ivx]+\b/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}

/** IFRS ID 소문자화 + 트리밍 (단순) */
export function normalizeAccountId(s?: string | null): string {
  return (s ?? '').toString().trim().toLowerCase()
}
