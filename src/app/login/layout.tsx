// ✅ src/app/login/layout.tsx
import '../globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'
import LoginWaveBackground from './LoginWaveBackground'

export const metadata: Metadata = {
  title: 'Filterwise',
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-white">
      <LoginWaveBackground />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  )
}
