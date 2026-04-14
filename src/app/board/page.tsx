// src/app/board/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Post = {
  id: string
  title: string
  content: string
  author: string | null
  created_at: string
  user_id: string | null
}

const PAGE_SIZE = 5

export default function BoardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 페이지네이션 & 검색
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')

  // 댓글 수 집계
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  // 현재 페이지의 글들만 댓글 수 집계
  const fetchCommentCounts = async (postIds: string[]) => {
    if (postIds.length === 0) {
      setCommentCounts({})
      return
    }
    const results = await Promise.all(
      postIds.map(async (id) => {
        const { count } = await supabase
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .eq('post_id', id)
        return { id, count: count ?? 0 }
      })
    )
    const map: Record<string, number> = {}
    results.forEach(({ id, count }) => (map[id] = count))
    setCommentCounts(map)
  }

  // 목록 + 전체수 + 댓글수
  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        // total
        let countReq = supabase.from('posts').select('id', { count: 'exact', head: true })
        if (query.trim()) {
          const kw = query.trim()
          countReq = countReq.or(`title.ilike.%${kw}%,author.ilike.%${kw}%`)
        }
        const { count, error: countErr } = await countReq
        if (countErr) throw countErr
        setTotal(count ?? 0)

        // page data
        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        let dataReq = supabase
          .from('posts')
          .select('id, title, content, author, created_at, user_id')
          .order('created_at', { ascending: false })
          .range(from, to)
        if (query.trim()) {
          const kw = query.trim()
          dataReq = dataReq.or(`title.ilike.%${kw}%,author.ilike.%${kw}%`)
        }
        const { data, error: dataErr } = await dataReq
        if (dataErr) throw dataErr

        const list = (data ?? []) as Post[]
        setPosts(list)
        await fetchCommentCounts(list.map((p) => p.id))
      } catch (e) {
        const msg = e instanceof Error ? e.message : '게시글을 불러오지 못했습니다.'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [page, query])

  // 검색
  const onSearch = () => {
    setPage(1)
    setQuery(q)
  }
  const onReset = () => {
    setQ('')
    setQuery('')
    setPage(1)
  }

  // 페이지네이션
  const goPrev = () => setPage((p) => Math.max(1, p - 1))
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1))
  const goPage = (p: number) => setPage(p)

  const pageNumbers = useMemo(() => {
    const arr: number[] = []
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, start + 4)
    for (let i = start; i <= end; i++) arr.push(i)
    return arr
  }, [page, totalPages])

  return (
    <div className="max-w-4xl">
      <section className="bg-white p-6 rounded-xl shadow border mb-6">
        <h2 className="text-xl font-bold mb-4">게시글 목록</h2>

        {loading && <div className="text-gray-600">불러오는 중…</div>}
        {error && <div className="text-red-600 mb-2">오류: {error}</div>}
        {!loading && posts.length === 0 && <div className="text-gray-500">게시글이 없습니다.</div>}

        <ul className="divide-y">
          {posts.map((p) => (
            <li key={p.id} className="py-3">
              <Link href={`/board/${p.id}`} className="block rounded px-2 py-2 hover:bg-gray-50">
                {/* 모바일: 세로 / 데스크탑: 좌우 */}
                <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
                  <h3 className="font-semibold break-words">
                    {p.title}{' '}
                    <span className="text-gray-500 text-sm">({commentCounts[p.id] ?? 0})</span>
                  </h3>
                  <span className="text-xs text-gray-500 md:text-sm">
                    {p.author ?? '익명'} · {new Date(p.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-1 line-clamp-2">{p.content}</p>
              </Link>
            </li>
          ))}
        </ul>

        {/* 페이지네이션 — 버튼 글자도 유동 폰트 + 줄바꿈 금지 */}
        {totalPages > 1 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={goPrev}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
            >
              이전
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                onClick={() => goPage(n)}
                className={[
                  'px-3 py-1 rounded border whitespace-nowrap text-[clamp(12px,3.5vw,14px)]',
                  n === page
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 hover:bg-gray-50',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
            <button
              onClick={goNext}
              disabled={page === totalPages}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
            >
              다음
            </button>
          </div>
        )}

        {/* 하단: 검색 + 새 글 — 컨테이너가 좁으면 자동 줄바꿈 + 버튼/입력 폭 대응 */}
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* 좌측: 검색 영역 */}
          <div className="flex flex-wrap items-center gap-2 w-full">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              className="min-w-0 flex-1 border rounded px-3 py-2 text-[clamp(14px,3.5vw,16px)]"
              placeholder="제목/작성자 검색"
            />
            <button
              onClick={onSearch}
              className="w-full sm:w-auto px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
            >
              검색
            </button>
            <button
              onClick={onReset}
              className="w-full sm:w-auto px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
            >
              초기화
            </button>
          </div>

          {/* 우측: 새 글 버튼 */}
          <Link
            href="/board/new"
            className="w-full sm:w-auto px-4 py-2 rounded bg-black text-white hover:bg-gray-800 whitespace-nowrap text-center text-[clamp(12px,3.5vw,14px)]"
          >
            새 글 작성
          </Link>
        </div>
      </section>
    </div>
  )
}
