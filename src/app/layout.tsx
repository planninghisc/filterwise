// ✅ src/app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import PageLayoutSelector from '@/components/PageLayoutSelector' // [변경] 새로 만든 컴포넌트 import

export const metadata: Metadata = {
  title: 'FilterWise',
  description: '',
}

const ANCHANGHO_FONT = 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2402_1@1.0/KCC-Ahnchangho.woff2'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preload" href={ANCHANGHO_FONT} as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {/* LayoutWrapper 대신 PageLayoutSelector가 감쌉니다 */}
        <PageLayoutSelector>
            {children}
        </PageLayoutSelector>
      </body>
    </html>
  )
}