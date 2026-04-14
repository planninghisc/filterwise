// ✅ src/app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import PageLayoutSelector from '@/components/PageLayoutSelector' // [변경] 새로 만든 컴포넌트 import

export const metadata: Metadata = {
  title: 'Just Do It!',
  description: 'mini MIS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {/* LayoutWrapper 대신 PageLayoutSelector가 감쌉니다 */}
        <PageLayoutSelector>
            {children}
        </PageLayoutSelector>
      </body>
    </html>
  )
}