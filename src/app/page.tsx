// ✅ src/app/page.tsx
// 메인페이지!!!!! 제일 배경임!!

'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'

interface WeatherData {
  current: { condition: { text: string; icon: string }; temp_c: number }
  location: { name: string }
}

// 🔹 외부/내부 링크 분리
const externalLinks = [
  { name: '금융투자협회', url: 'https://www.kofiabond.or.kr/' },
  { name: '금융통계정보시스템', url: 'https://fisis.fss.or.kr/' },
  { name: 'DART', url: 'http://dart.fss.or.kr/' },
  { name: '금융감독원', url: 'https://www.fss.or.kr/' },
  { name: '금융위원회', url: 'https://www.fsc.go.kr/' },
  { name: '한국은행', url: 'https://www.bok.or.kr/' },
  { name: '한국거래소', url: 'https://www.krx.co.kr/' },
  { name: '금융보안원', url: 'https://edu.fsec.or.kr/' },
  { name: '금융투자교육원', url: 'https://www.kifin.or.kr/' },
  { name: 'Chatgpt', url: 'https://chatgpt.com/' },
]

const internalLinks = [
  { name: 'Circle', url: 'https://hisc.circle.hanwha.com/' },
  { name: '외부메일', url: 'https://mail.hanwhawm.com/' },
  { name: '채널H', url: 'https://chhplus.hanwha.com/' },
]

function formatKoreanDate(d: Date) {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const dayName = days[d.getDay()]
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayName})`
}
const pad = (n: number) => n.toString().padStart(2, '0')

export default function Home() {
  // ✅ 초기값을 null로 두고, 클라이언트 마운트 이후에만 시간 계산
  const [now, setNow] = useState<Date | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)

  // 마운트 후 now 세팅 + 1초 갱신
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const { dateText, timeText, remainingText } = useMemo(() => {
    if (!now) {
      return { dateText: '', timeText: '', remainingText: '' }
    }
    const dateText = formatKoreanDate(now)
    const timeText = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

    const endTime = new Date(now)
    endTime.setHours(17, 30, 0, 0)
    const diffMs = endTime.getTime() - now.getTime()
    let remainingText = ''
    if (diffMs <= 0) {
      remainingText = '퇴근 시간이 지났어요! 🎉'
    } else {
      const s = Math.floor(diffMs / 1000)
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      remainingText = `${h}시간 ${m}분 ${sec}초 남음`
    }
    return { dateText, timeText, remainingText }
  }, [now])

  // 날씨는 클라이언트에서만 호출
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/weather')
        if (!res.ok) throw new Error('weather api error')
        const data = (await res.json()) as WeatherData
        setWeather(data)
      } catch (err) {
        console.error('날씨 정보를 불러오는 데 실패했습니다:', err)
      }
    }
    fetchWeather()
  }, [])

  return (
    <div className="min-h-[calc(100vh-4rem)] p-6 xl:p-8 bg-white text-black">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6"
      >
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          ✔︎ Just Do It!
        </h1>
        <p className="mt-1 text-sm text-gray-500">하싫핑 하하방</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* 날짜/시간 카드 */}
        <Card enterDelay={0.05}>
          <div className="flex items-start justify-between">
            <CardTitle>오늘</CardTitle>
            <Badge>Now</Badge>
          </div>

          <div className="mt-4">
            {/* SSR과의 불일치 경고 억제 */}
            <div className="text-lg text-gray-700" suppressHydrationWarning>
              {dateText || ' '}
            </div>
            <div
              className="mt-1 text-4xl md:text-5xl font-bold tracking-tight"
              suppressHydrationWarning
            >
              {timeText || '--:--:--'}
            </div>
          </div>
        </Card>

        {/* 퇴근 카운트다운 카드 */}
        <Card enterDelay={0.12}>
          <CardTitle>퇴근까지</CardTitle>
          <div className="mt-4 text-lg" suppressHydrationWarning>
            {remainingText || ' '}
          </div>
          <p className="mt-2 text-sm text-gray-500">오늘도 파이팅입니다 💪</p>
        </Card>

        {/* 날씨 카드 */}
        <Card enterDelay={0.18} className="xl:col-span-1 lg:col-span-2">
          <div className="flex items-start justify-between">
            <CardTitle>오늘의 날씨</CardTitle>
            <Badge>Live</Badge>
          </div>
          {weather ? (
            <div className="mt-4 flex items-center gap-4">
              <Image
                src={`https:${weather.current.condition.icon}`}
                alt="날씨"
                width={56}
                height={56}
                className="shrink-0"
              />
              <div>
                <p className="text-lg font-semibold">{weather.current.condition.text}</p>
                <p className="text-sm text-gray-600">
                  {weather.current.temp_c}℃ · {weather.location.name}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">날씨 정보를 불러오는 중이에요…</p>
          )}
        </Card>

        {/* ✅ 외부 사이트 카드 (넓게, 향후 확장 대비) */}
        <Card enterDelay={0.24} className="xl:col-span-2 lg:col-span-2">
          <CardTitle>외부 사이트 바로가기</CardTitle>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {externalLinks.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:shadow transition-shadow"
                >
                  <span className="text-sm font-medium group-hover:underline break-all">
                    {l.name}
                  </span>
                  <span className="block text-xs text-gray-500 truncate">{l.url}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {/* ✅ 내부 사이트 카드 (별도 분리) */}
        <Card enterDelay={0.3} className="xl:col-span-1 lg:col-span-1">
          <CardTitle>내부 사이트 바로가기</CardTitle>
          <ul className="mt-4 grid grid-cols-1 gap-3">
            {internalLinks.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:shadow transition-shadow"
                >
                  <span className="text-sm font-medium group-hover:underline break-all">
                    {l.name}
                  </span>
                  <span className="block text-xs text-gray-500 truncate">{l.url}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

/* ---------------- UI 프리미티브 ---------------- */

function Card({
  children,
  className = '',
  enterDelay = 0,
}: {
  children: React.ReactNode
  className?: string
  enterDelay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: enterDelay }}
      className={[
        'rounded-2xl bg-white',
        'shadow-[0_2px_30px_rgba(0,0,0,0.06)]',
        'border border-gray-200',
        'p-5 md:p-6',
        className,
      ].join(' ')}
    >
      {children}
    </motion.div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500">
      {children}
    </span>
  )
}
