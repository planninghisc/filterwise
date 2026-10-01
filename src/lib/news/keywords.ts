// src/lib/news/keywords.ts
// 서버/클라이언트 공용 (서버 전용 import 금지)

/** 뉴스봇 기본 수집 키워드 (고정, 관리 화면에서 삭제 불가) */
export const BASE_KEYWORDS = ['한화투자증권', '한화증권', '한화證'] as const

/**
 * alert_keywords 한 행의 알림 조건.
 * 예전 형식(keyword = 수집 검색어, alert_filter = 조건) 행은 alert_filter 를, 새 형식 행은 keyword 를 조건으로 쓴다.
 */
export function alertConditionOf(row: { keyword?: string | null; alert_filter?: string | null }): string {
  return String(row.alert_filter ?? '').trim() || String(row.keyword ?? '').trim()
}
