// src/app/news/page.tsx
'use client'

import useSWR from 'swr' // npm i swr
import Link from 'next/link'
import { useMemo } from 'react'

type News = {
  id: string
  title: string
  publisher: string | null
  source_url: string
  published_at: string | null
  fetched_at: string | null
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

function formatDate(dateISO: string | null) {
  if (!dateISO) return ''
  const d = new Date(dateISO)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function topicBadge(count: number) {
  if (count >= 20) return { label: '🔥 High', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (count >= 10) return { label: '⚡ Medium', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' }
  return { label: '🌱 Low', cls: 'bg-green-100 text-green-700 border-green-200' }
}

export default function NewsPage() {
  const { data } = useSWR('/api/news/list?days=3', fetcher, { refreshInterval: 0 })
  const list: News[] = data?.list || []

  const grouped = useMemo(() => {
    const map = new Map<string, News[]>()
    for (const n of list) {
      const key = formatDate(n.published_at || n.fetched_at)
      const arr = map.get(key) || []
      arr.push(n)
      map.set(key, arr)
    }
    // 날짜 내림차순
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [list])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
        <p className="text-sm text-gray-500 mt-1">‘한화투자증권’ 관련 최신 뉴스</p>
      </div>

      {grouped.map(([date, items]) => {
        const badge = topicBadge(items.length)
        return (
          <section key={date} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{date}</h2>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${badge.cls}`}>
                {badge.label} · {items.length}건
              </span>
            </div>
            <ul className="mt-3 divide-y">
              {items.map((n) => (
                <li key={n.id} className="py-2">
                  <Link href={n.source_url} target="_blank" className="font-medium hover:underline">
                    {n.title}
                  </Link>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {n.publisher || 'Unknown'} · {new Date(n.published_at || n.fetched_at || '').toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
