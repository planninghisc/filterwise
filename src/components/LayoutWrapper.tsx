// src/components/LayoutWrapper.tsx
'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import LogoutButton from '@/components/LogoutButton'

// lucide-react 아이콘 (LayoutDashboard 추가됨)
import {
  Home,
  FileText,
  BarChart3,
  Newspaper,
  Settings,
  FileSpreadsheet,
  Bell,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  Table2,
  Building2,
} from 'lucide-react'

type NavItem = { name: string; href: string; icon: React.ReactNode }

const navSections: Array<Array<NavItem>> = [
  [
    { name: 'Home', href: '/', icon: <Home className="w-4 h-4" /> },
  ],
  [
    { name: 'Data', href: '/data', icon: <BarChart3 className="w-4 h-4" /> },
    { name: 'News', href: '/news', icon: <Newspaper className="w-4 h-4" /> },
  ],
  [
    { name: 'DART Analysis', href: '/dart-analysis', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { name: 'Market Analysis', href: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { name: 'Weekly IR', href: '/weekly-ir', icon: <FileText className="w-4 h-4" /> },
  ],
  // Schedule(/schedule) 메뉴는 일시 숨김 — 다시 쓸 때 navSections에 항목 추가
  [
    { name: 'Board', href: '/board', icon: <FileText className="w-4 h-4" /> },
    { name: 'Etc', href: '/etc', icon: <Settings className="w-4 h-4" /> },
  ],
]

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname.startsWith('/login')

  // ✅ 상태
  const [menuOpen, setMenuOpen] = useState(false)
  const [newsOpen, setNewsOpen] = useState(pathname.startsWith('/news/alerts'))
  const [dartOpen, setDartOpen] = useState(pathname.startsWith('/dart-financial-raw'))
  const [displayName, setDisplayName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true)

  // ✅ 프로필 로드
  const loadProfile = async () => {
    setLoadingProfile(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setDisplayName('')
      setEmail('')
      setLoadingProfile(false)
      return
    }

    setEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    setDisplayName(profile?.display_name || '')
    setLoadingProfile(false)
  }

  useEffect(() => {
    loadProfile()
  }, [])

  // 프로필 변경 브로드캐스트 수신 → 즉시 반영
  useEffect(() => {
    const handler = () => loadProfile()
    window.addEventListener('profile-updated', handler as EventListener)
    return () => window.removeEventListener('profile-updated', handler as EventListener)
  }, [])

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 라우트 변경 시 닫기
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (pathname.startsWith('/news/alerts')) setNewsOpen(true)
  }, [pathname])

  useEffect(() => {
    if (pathname.startsWith('/dart-financial-raw')) setDartOpen(true)
  }, [pathname])

  // 이니셜
  const initials = useMemo(() => {
    const base = displayName || email || ''
    if (!base) return ''
    const parts = base.trim().split(/\s+/)
    const first = parts[0]?.[0] || ''
    const second = parts.length > 1 ? parts[1]?.[0] || '' : ''
    return (first + second).toUpperCase()
  }, [displayName, email])

  // 환영 문구
  const welcomeText = useMemo(() => {
    if (loadingProfile) return ''
    if (displayName) return `${displayName}님 환영합니다!`
    if (email) return `${email}님 환영합니다!`
    return ''
  }, [displayName, email, loadingProfile])

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href + '/'))

  // 로그인 페이지만 중앙 정렬
  if (isLoginPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        {children}
      </div>
    )
  }

  return (
    <>
      {/* 🔒 고정 헤더 */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white shadow-md border-b z-50">
        <div className="h-full px-4 md:px-6 flex items-center justify-between gap-3">
          {/* 좌측: 타이틀 */}
          <h1 className="font-anchangho font-bold truncate text-[#ea580c] text-[clamp(18px,3.5vw,22px)]">
            FilterWise
          </h1>

          {/* 우측: 환영문구(데스크탑) + 로그아웃 + 햄버거 */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* 데스크탑 환영 배지 */}
            <div className="hidden md:flex items-center">
              {loadingProfile ? (
                <div
                  aria-hidden="true"
                  className="h-9 w-48 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse"
                />
              ) : welcomeText ? (
                <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border bg-white shadow-sm">
                  {/* 아바타(이니셜) */}
                  <div
                    aria-hidden="true"
                    className="flex h-7 w-7 items-center justify-center rounded-full border bg-gradient-to-br from-gray-50 to-gray-100 text-xs font-semibold text-gray-700"
                    title={displayName || email}
                  >
                    {initials || 'U'}
                  </div>
                  {/* 환영 텍스트 */}
                  <span className="text-[13px] font-medium text-gray-700">
                    <Link
                      href="/account"
                      className="text-[#ea580c] font-semibold underline decoration-2 underline-offset-2 hover:text-[#c2410c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 rounded-sm px-0.5"
                      title="프로필/비밀번호 변경"
                    >
                      {displayName || email}
                    </Link>
                    님 환영합니다!
                  </span>
                </div>
              ) : null}
            </div>

            {/* 로그아웃 */}
            <LogoutButton />

            {/* 햄버거 (모바일 전용) */}
            <button
              type="button"
              aria-label="메뉴 열기"
              className="md:hidden p-2 border rounded hover:bg-gray-50 active:scale-95 transition whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
              onClick={() => setMenuOpen(true)}
            >
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black" />
            </button>
          </div>
        </div>
      </header>

      {/* 헤더 높이만큼 여백 */}
      <div className="pt-16 flex min-h-screen">
        {/* 좌측 사이드바 — 데스크탑 */}
        <aside className="hidden md:flex w-64 border-r bg-white flex-col">
          <nav className="px-3 py-4 flex-1">
            <ul className="space-y-2">
              {navSections.map((section, sectionIdx) => (
                <li key={`section-${sectionIdx}`}>
                  {sectionIdx > 0 && <div className="my-2 border-t border-orange-100/80" />}
                  <ul className="space-y-1">
                    {section.map((it) => {
                      const active =
                        it.href === '/dart-analysis'
                          ? pathname.startsWith('/dart-analysis') || pathname.startsWith('/dart-financial-raw')
                          : isActive(it.href)
                      return (
                        <li key={it.href}>
                          <div className="flex items-stretch gap-1">
                            <Link
                              href={it.href}
                              aria-current={active ? 'page' : undefined}
                              className={[
                                'group flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                                active
                                  ? 'bg-orange-50 border-orange-200 text-[#c2410c]'
                                  : 'bg-white border-transparent text-gray-700 hover:bg-orange-50/70 hover:border-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300',
                              ].join(' ')}
                            >
                              {it.icon}
                              <span className="font-medium">{it.name}</span>
                              <span
                                className={[
                                  'ml-auto h-4 w-1 rounded-full',
                                  active ? 'bg-[#ea580c]' : 'bg-transparent group-hover:bg-orange-300',
                                ].join(' ')}
                              />
                            </Link>
                            {it.href === '/news' && (
                              <button
                                type="button"
                                onClick={() => setNewsOpen((v) => !v)}
                                className="flex w-8 items-center justify-center rounded-lg border border-transparent text-gray-500 hover:bg-orange-50 hover:text-[#ea580c]"
                                aria-label="News 하위 메뉴 열기/닫기"
                                aria-expanded={newsOpen}
                              >
                                {newsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            {it.href === '/dart-analysis' && (
                              <button
                                type="button"
                                onClick={() => setDartOpen((v) => !v)}
                                className="flex w-8 items-center justify-center rounded-lg border border-transparent text-gray-500 hover:bg-orange-50 hover:text-[#ea580c]"
                                aria-label="DART 하위 메뉴 열기/닫기"
                                aria-expanded={dartOpen}
                              >
                                {dartOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                          {it.href === '/news' && newsOpen && (
                            <Link
                              href="/news/alerts"
                              aria-current={isActive('/news/alerts') ? 'page' : undefined}
                              className={[
                                'ml-4 mt-1 group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                                isActive('/news/alerts')
                                  ? 'bg-orange-50 border-orange-200 text-[#c2410c]'
                                  : 'bg-white border-transparent text-gray-700 hover:bg-orange-50/70 hover:border-orange-200',
                              ].join(' ')}
                            >
                              <Bell className="w-4 h-4" />
                              <span className="font-medium">News Alert</span>
                            </Link>
                          )}
                          {it.href === '/dart-analysis' && dartOpen && (
                            <>
                              <Link
                                href="/dart-financial-raw/corps"
                                aria-current={pathname.startsWith('/dart-financial-raw/corps') ? 'page' : undefined}
                                className={[
                                  'ml-4 mt-1 group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                                  pathname.startsWith('/dart-financial-raw/corps')
                                    ? 'bg-orange-50 border-orange-200 text-[#c2410c]'
                                    : 'bg-white border-transparent text-gray-700 hover:bg-orange-50/70 hover:border-orange-200',
                                ].join(' ')}
                              >
                                <Building2 className="w-4 h-4" />
                                <span className="font-medium">CORP registration</span>
                              </Link>
                              <Link
                                href="/dart-financial-raw"
                                aria-current={pathname === '/dart-financial-raw' ? 'page' : undefined}
                                className={[
                                  'ml-4 mt-1 group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                                  pathname === '/dart-financial-raw'
                                    ? 'bg-orange-50 border-orange-200 text-[#c2410c]'
                                    : 'bg-white border-transparent text-gray-700 hover:bg-orange-50/70 hover:border-orange-200',
                                ].join(' ')}
                              >
                                <Table2 className="w-4 h-4" />
                                <span className="font-medium">DART BS/PL RAW</span>
                              </Link>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>

          {/* 하단 푸터 */}
          <div className="border-t px-4 py-3 text-[11px] text-gray-400">
            2025 miniMIS by zuno
          </div>
        </aside>

        {/* 본문 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      {/* 모바일: 오버레이 */}
      {menuOpen && (
        <button
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-[1px] md:hidden z-40"
        />
      )}

      {/* 모바일: 우측 슬라이드 메뉴 + 하단 푸터 */}
      <aside
        className={[
          'fixed top-16 right-0 h-[calc(100vh-64px)] w-64 bg-white border-l shadow-xl md:hidden z-50',
          'transition-transform duration-300',
          menuOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <nav className="flex-1 p-4 font-semibold">
          <ul className="space-y-2">
            {navSections.map((section, sectionIdx) => (
              <li key={`m-section-${sectionIdx}`}>
                {sectionIdx > 0 && <div className="my-2 border-t border-orange-100/80" />}
                <div className="space-y-1">
                  {section.map((it) => {
                    const active =
                      it.href === '/dart-analysis'
                        ? pathname.startsWith('/dart-analysis') || pathname.startsWith('/dart-financial-raw')
                        : isActive(it.href)
                    return (
                      <div key={it.href}>
                        <div className="flex items-stretch gap-1">
                          <Link
                            href={it.href}
                            onClick={() => setMenuOpen(false)}
                            aria-current={active ? 'page' : undefined}
                            className={[
                              'group flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                              active
                                ? 'bg-orange-50 border-orange-200 text-[#c2410c]'
                                : 'bg-white border-transparent text-gray-700 hover:bg-orange-50/70 hover:border-orange-200',
                            ].join(' ')}
                          >
                            {it.icon}
                            <span>{it.name}</span>
                            <span
                              className={[
                                'ml-auto h-4 w-1 rounded-full',
                                active ? 'bg-[#ea580c]' : 'bg-transparent group-hover:bg-orange-300',
                              ].join(' ')}
                            />
                          </Link>
                          {it.href === '/news' && (
                            <button
                              type="button"
                              onClick={() => setNewsOpen((v) => !v)}
                              className="flex w-8 items-center justify-center rounded-lg border border-transparent text-gray-500 hover:bg-orange-50 hover:text-[#ea580c]"
                              aria-label="News 하위 메뉴 열기/닫기"
                              aria-expanded={newsOpen}
                            >
                              {newsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {it.href === '/dart-analysis' && (
                            <button
                              type="button"
                              onClick={() => setDartOpen((v) => !v)}
                              className="flex w-8 items-center justify-center rounded-lg border border-transparent text-gray-500 hover:bg-orange-50 hover:text-[#ea580c]"
                              aria-label="DART 하위 메뉴 열기/닫기"
                              aria-expanded={dartOpen}
                            >
                              {dartOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                        {it.href === '/news' && newsOpen && (
                          <Link
                            href="/news/alerts"
                            onClick={() => setMenuOpen(false)}
                            aria-current={isActive('/news/alerts') ? 'page' : undefined}
                            className={[
                              'ml-4 mt-1 group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                              isActive('/news/alerts')
                                ? 'bg-orange-50 border-orange-200 text-[#c2410c]'
                                : 'bg-white border-transparent text-gray-700 hover:bg-orange-50/70 hover:border-orange-200',
                            ].join(' ')}
                          >
                            <Bell className="w-4 h-4" />
                            <span>News Alert</span>
                          </Link>
                        )}
                        {it.href === '/dart-analysis' && dartOpen && (
                          <>
                            <Link
                              href="/dart-financial-raw/corps"
                              onClick={() => setMenuOpen(false)}
                              aria-current={pathname.startsWith('/dart-financial-raw/corps') ? 'page' : undefined}
                              className={[
                                'ml-4 mt-1 group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                                pathname.startsWith('/dart-financial-raw/corps')
                                  ? 'bg-orange-50 border-orange-200 text-[#c2410c]'
                                  : 'bg-white border-transparent text-gray-700 hover:bg-orange-50/70 hover:border-orange-200',
                              ].join(' ')}
                            >
                              <Building2 className="w-4 h-4" />
                              <span>CORP registration</span>
                            </Link>
                            <Link
                              href="/dart-financial-raw"
                              onClick={() => setMenuOpen(false)}
                              aria-current={pathname === '/dart-financial-raw' ? 'page' : undefined}
                              className={[
                                'ml-4 mt-1 group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                                pathname === '/dart-financial-raw'
                                  ? 'bg-orange-50 border-orange-200 text-[#c2410c]'
                                  : 'bg-white border-transparent text-gray-700 hover:bg-orange-50/70 hover:border-orange-200',
                              ].join(' ')}
                            >
                              <Table2 className="w-4 h-4" />
                              <span>DART BS/PL RAW</span>
                            </Link>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t px-4 py-3 text-[11px] text-gray-400">
          2025 miniMIS by zuno
        </div>
      </aside>
    </>
  )
}