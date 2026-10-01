// src/lib/newsAdmin.ts
// 뉴스 키워드·텔레그램 관리 메뉴 접근 가능 계정 (middleware / LayoutWrapper 공용)
export const PRIVILEGED_NEWS_EMAILS = new Set(['test@hanwha.com', 'admin@hanwha.com'])

export function isNewsAdminEmail(email: string | null | undefined): boolean {
  return PRIVILEGED_NEWS_EMAILS.has(String(email ?? '').trim().toLowerCase())
}
