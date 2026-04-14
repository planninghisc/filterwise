// src/components/PageLayoutSelector.tsx
'use client'

import { usePathname } from 'next/navigation'
import LayoutWrapper from '@/components/LayoutWrapper'

export default function PageLayoutSelector({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // [수정됨] 
  // '/news' 전체가 아니라, 오직 '외부 공유용 브리핑 페이지'만 메뉴를 숨깁니다.
  const isPublicPage = pathname === '/news/daily-summary'

  // 외부 공유 페이지면 -> 메뉴 없이 컨텐츠만 표시
  if (isPublicPage) {
    return (
      <main className="w-full min-h-screen bg-white">
        {children}
      </main>
    )
  }

  // 그 외 모든 페이지(키워드 설정, 뉴스 목록 등) -> 메뉴(LayoutWrapper) 표시
  return <LayoutWrapper>{children}</LayoutWrapper>
}