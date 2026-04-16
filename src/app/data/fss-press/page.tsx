'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

type PressItem = {
  contentId: string
  subject: string
  publishOrg: string
  originUrl: string
  viewCnt: number | string
  regDate: string
  atchfileUrl?: string
  atchfileNm?: string
  contentsKor?: string
}

type ApiResponse = {
  resultCnt: number
  result: PressItem[]
  period: { startDate: string; endDate: string }
  saved?: number
}

function decodeHtmlEntities(input?: string | null): string {
  if (!input) return ''
  let s = String(input)
  s = s.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos': "'",
    '&nbsp;': ' ',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&hellip;': '…',
    '&middot;': '·',
  }
  s = s.replace(/&[a-zA-Z]+?;|&#\d+;|&#x[0-9a-fA-F]+;/g, (m) => map[m] ?? m)
  return s
}

function formatDateInput(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** 조회수 숫자 변환 */
function toViews(v: number | string): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/** 제목에 ‘증권’ 포함 여부 */
function isSecuritiesTitle(title: string): boolean {
  return /증권/.test(title)
}

/** 작은 배지 UI */
function Badge({ children, title, className = '' }: { children: string; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={[
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 shadow-sm select-none',
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export default function FssPressPage() {
  const today = useMemo(() => new Date(), [])
  const defEnd = useMemo(() => formatDateInput(today), [today])
  const defStart = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 30)
    return formatDateInput(d)
  }, [today])

  const [startDate, setStartDate] = useState(defStart)
  const [endDate, setEndDate] = useState(defEnd)
  const [subject, setSubject] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [syncInfo, setSyncInfo] = useState<string | null>(null)

  const disabled = useMemo(() => !startDate || !endDate, [startDate, endDate])

  const onSync = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setSyncInfo(null)

      const qs = new URLSearchParams()
      qs.set('startDate', startDate)
      qs.set('endDate', endDate)
      if (subject.trim()) qs.set('subject', subject.trim())
      qs.set('save', '1')

      const res = await fetch(`/api/fss/press?${qs.toString()}`, { method: 'GET', cache: 'no-store' })
      const json: unknown = await res.json()
      if (!res.ok) {
        const errBody = json as { error?: string; resultCode?: string; resultMsg?: string }
        const detail =
          errBody.resultCode || errBody.resultMsg
            ? ` (코드: ${errBody.resultCode ?? '-'}, 메시지: ${errBody.resultMsg ?? '-'})`
            : ''
        const errMsg = (errBody.error ?? 'API sync error') + detail
        throw new Error(errMsg)
      }
      const body = json as { saved?: number; resultCode?: string; resultMsg?: string }
      const saved = body.saved ?? 0
      const hint =
        saved === 0 && body.resultCode === '000'
          ? ' (해당 기간·제목 조건에 맞는 보도가 없을 수 있습니다)'
          : ''
      setSyncInfo(`동기화 완료: ${saved}건 저장${hint}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '동기화 중 오류가 발생했습니다.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, subject])

  const onSearchDb = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setData(null)

      const qs = new URLSearchParams()
      qs.set('startDate', startDate)
      qs.set('endDate', endDate)
      if (subject.trim()) qs.set('subject', subject.trim())

      const res = await fetch(`/api/fss/press/db?${qs.toString()}`, { method: 'GET', cache: 'no-store' })
      const json: unknown = await res.json()
      if (!res.ok) {
        const errMsg = (json as { error?: string }).error ?? 'DB query error'
        throw new Error(errMsg)
      }
      setData(json as ApiResponse)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '조회 중 오류가 발생했습니다.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, subject])

  const onReset = useCallback(() => {
    setStartDate(defStart)
    setEndDate(defEnd)
    setSubject('')
    setData(null)
    setError(null)
    setSyncInfo(null)
  }, [defStart, defEnd])

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">금융감독원</div>
          <h1 className="text-2xl font-bold">보도자료(실적보고용)</h1>
          <p className="text-sm text-gray-600 mt-1">실적보고 사용을 위한 보도자료 크롤링</p>
        </div>
        <Link href="/data" className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
          ← 뒤로가기
        </Link>
      </header>

      <section className="rounded-2xl border bg-white p-5 shadow-sm mb-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col">
            <label className="text-sm mb-1">조회 시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm mb-1">조회 종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div className="flex flex-col md:col-span-2">
            <label className="text-sm mb-1">제목</label>
            <input
              type="text"
              placeholder="제목 키워드"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white"
            />
          </div>
        </div>

        {/* 버튼 정렬/강조 변경: DB에서 조회(검정) → API 데이터 수집(테두리) → 초기화 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onSearchDb}
            disabled={disabled || loading}
            className="px-4 py-2 rounded-lg bg-[#ea580c] text-white hover:bg-[#c2410c] disabled:opacity-40"
          >
            DB에서 조회
          </button>
          <button
            onClick={onSync}
            disabled={disabled || loading}
            className="px-4 py-2 rounded-lg border"
          >
            {loading ? '수집 중…' : 'API 데이터 수집'}
          </button>
          <button
            onClick={onReset}
            disabled={loading}
            className="px-4 py-2 rounded-lg border"
          >
            초기화
          </button>

          {data?.period && (
            <span className="text-xs text-gray-500 ml-auto">
              기간: {data.period.startDate} ~ {data.period.endDate} · 결과 {data.resultCnt}건
            </span>
          )}
        </div>

        {/* 안내 문구 변경 */}
        <p className="mt-3 text-xs text-gray-500">
          * API 데이터 수집은 해당 웹사이트에서 데이터를 최초 크롤링해올 때 사용합니다. 이후 조회는 <b>DB에서 조회</b>해주세요.
        </p>

        {syncInfo && <div className="mt-2 text-sm text-emerald-700">{syncInfo}</div>}
      </section>

      {error && <div className="mb-4 text-sm text-red-600">오류: {error}</div>}

      <section className="space-y-3">
        {data?.result?.map((item) => {
          const title = decodeHtmlEntities(item.subject)
          const body = decodeHtmlEntities(item.contentsKor)
          const dateText = item.regDate ? new Date(item.regDate).toLocaleString() : ''
          const views = toViews(item.viewCnt)
          const isHot = views >= 10000
          const isSec = isSecuritiesTitle(title)

          return (
            <article key={item.contentId} className="border rounded-xl p-4 bg-white">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-1">
                <span>{item.publishOrg || '발행기관 미기재'}</span>
                <span>·</span>
                <time>{dateText}</time>
                <span>·</span>
                <span>조회수 {views.toLocaleString()}</span>

                <div className="ml-auto flex flex-wrap items-center gap-1">
                  {isHot && (
                    <Badge className="border-red-300 bg-red-50 text-red-700" title="조회수 10000 이상">
                      🔥 핫
                    </Badge>
                  )}
                  {isSec && (
                    <Badge className="border-blue-300 bg-blue-50 text-blue-700" title="제목에 ‘증권’ 포함">
                      증권업
                    </Badge>
                  )}
                </div>
              </div>

              <a
                href={item.originUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-base md:text-lg font-semibold hover:underline"
              >
                {title || '(제목 없음)'}
              </a>
              {body && <p className="mt-2 text-sm whitespace-pre-line line-clamp-3">{body}</p>}

              {(item.atchfileUrl || item.atchfileNm) && (
                <div className="mt-2 text-sm">
                  <div className="font-medium mb-1">첨부</div>
                  <ul className="list-disc ml-5">
                    {splitAttachments(item).map((f, idx) => (
                      <li key={idx}>
                        {f.url ? (
                          <a href={f.url} target="_blank" rel="noreferrer" className="underline">
                            {decodeHtmlEntities(f.name || f.url)}
                          </a>
                        ) : (
                          <span>{decodeHtmlEntities(f.name)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )
        })}

        {data && data.resultCnt === 0 && !error && (
          <div className="text-sm text-gray-500">조회 결과가 없습니다.</div>
        )}
      </section>
    </main>
  )
}

function splitAttachments(item: PressItem): { url?: string; name?: string }[] {
  const urls = (item.atchfileUrl ?? '').split('|').filter(Boolean)
  const names = (item.atchfileNm ?? '').split('|').filter(Boolean)
  const maxLen = Math.max(urls.length, names.length)
  const out: { url?: string; name?: string }[] = []
  for (let i = 0; i < maxLen; i++) {
    out.push({ url: urls[i], name: names[i] })
  }
  return out
}
