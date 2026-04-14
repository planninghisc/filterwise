// src/app/data/kotc-term-market/page.tsx

// 설명:
// - 상단 줄: 제목(좌) + 뒤로가기 버튼(우)
// - 섹션 1: 수집(서버 액션 프록시 → 내부 수집 API 호출). 결과를 쿠키에 저장하여 본 섹션에만 배너 표시
// - 섹션 2: 조회(같은 페이지로 GET 제출 → 서버에서 DB 조회 후 표 렌더)

import Link from 'next/link'
import dayjs from 'dayjs'
import { headers, cookies } from 'next/headers'

type Row = {
  prd_de: string
  section: string
  avg_price: number | null
  volume: number | null
  amount_krw: number | null
  market_cap_krw: number | null
}

export const metadata = {
  title: 'K-OTC 기간별 시장지표 | miniMIS',
}

const PAGE_PATH = '/data/kotc-term-market'
const BANNER_COOKIE = 'kotc_collect_banner'

// 기본 기간(최근 3개월)
function getDefaults() {
  const defaultFrom = dayjs().subtract(3, 'month').format('YYYY-MM-DD')
  const defaultTo = dayjs().format('YYYY-MM-DD')
  return { defaultFrom, defaultTo }
}

// ─────────────────────────────────────────────
// 서버 액션: 내부 수집 API 호출 후, 결과를 쿠키에 저장(리다이렉트 없음)
// ─────────────────────────────────────────────
async function collectAction(formData: FormData) {
  'use server'

  // 쿠키 배너 초기화
  const c = await cookies()
  c.set(BANNER_COOKIE, '', { path: PAGE_PATH, maxAge: 0 })

  const secret = process.env.KOTC_INGEST_SECRET
  if (!secret) {
    c.set(
      BANNER_COOKIE,
      JSON.stringify({
        status: 'error',
        msg: '서버 환경변수(KOTC_INGEST_SECRET)가 없어 수집을 실행할 수 없습니다.',
      }),
      { path: PAGE_PATH, httpOnly: false }
    )
    return
  }

  const from = String(formData.get('from') ?? '')
  const to = String(formData.get('to') ?? '')
  const section = String(formData.get('section') ?? '전체')

  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(from) || !dateRe.test(to)) {
    c.set(
      BANNER_COOKIE,
      JSON.stringify({ status: 'error', msg: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' }),
      { path: PAGE_PATH, httpOnly: false }
    )
    return
  }

  // 현재 요청 기준의 절대 URL 구성 (배포/로컬 모두 동작)
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const base = `${proto}://${host}`

  try {
    const res = await fetch(`${base}/api/kotc/term-market/collect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ingest-secret': secret,
      },
      body: JSON.stringify({ from, to, section }),
    })

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      upserted?: number
    }

    if (!res.ok || !json.ok) {
      const msg = json?.error ? `수집 실패: ${json.error}` : `수집 실패(HTTP ${res.status})`
      c.set(
        BANNER_COOKIE,
        JSON.stringify({
          status: 'error',
          msg,
        }),
        {
          path: PAGE_PATH,
          httpOnly: false,
        }
      )
      return
    }

    const msg = `수집 완료: upsert ${json.upserted ?? 'N/A'}건`
    c.set(
      BANNER_COOKIE,
      JSON.stringify({
        status: 'ok',
        msg,
      }),
      {
        path: PAGE_PATH,
        httpOnly: false,
      }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    c.set(
      BANNER_COOKIE,
      JSON.stringify({ status: 'error', msg: `수집 오류: ${msg}` }),
      {
        path: PAGE_PATH,
        httpOnly: false,
      }
    )
  }
}

// ─────────────────────────────────────────────
// 서버에서 DB 조회 호출 (API 경유)
// ─────────────────────────────────────────────
async function loadRows(params: { from: string; to: string; section: string }): Promise<Row[]> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const base = `${proto}://${host}`

  const url = new URL('/api/kotc/term-market/query', base)
  url.searchParams.set('from', params.from)
  url.searchParams.set('to', params.to)
  url.searchParams.set('section', params.section)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    // eslint-disable-next-line no-console
    console.warn('[KOTC] Query failed', res.status, msg)
    return []
  }
  const json = (await res.json().catch(() => ({}))) as { rows?: Row[] }
  return json.rows ?? []
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; section?: string }>
}) {
  const sp = await searchParams
  const { defaultFrom, defaultTo } = getDefaults()

  // 조회 섹션의 폼 기본값 = URL 쿼리 → 없으면 기본값
  const qFrom = (sp?.from && String(sp.from)) || defaultFrom
  const qTo = (sp?.to && String(sp.to)) || defaultTo
  const qSection = (sp?.section && String(sp.section)) || '전체'

  // 서버에서 DB 조회
  const rows = await loadRows({ from: qFrom, to: qTo, section: qSection })

  // 수집 결과 배너(수집 섹션 전용) — 쿠키에서 읽기만
  const c = await cookies()
  const bannerCookie = c.get(BANNER_COOKIE)?.value
  let collectBanner: { status: 'ok' | 'error'; msg: string } | null = null
  if (bannerCookie) {
    try {
      const parsed = JSON.parse(bannerCookie) as { status: 'ok' | 'error'; msg: string }
      if (parsed?.msg && (parsed.status === 'ok' || parsed.status === 'error')) {
        collectBanner = parsed
      }
    } catch {
      // ignore parse error
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* 상단 줄: 제목(좌) + 뒤로가기(우) */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">K-OTC 기간별 시장지표</h1>
        <Link
          href="/data"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          aria-label="뒤로가기"
        >
          <span aria-hidden>←</span> Data로 돌아가기
        </Link>
      </div>

      {/* ───────────────────────────
          섹션 1: 수집(자동)
         ─────────────────────────── */}
      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="text-xl font-semibold">수집</h2>
        <p className="text-sm text-gray-600">
          기간과 소속부를 선택하고 “수집 실행”을 누르면 서버가 K-OTC에서 엑셀을 자동 다운로드·파싱하여 DB에 저장합니다.
          (시크릿은 서버에서만 사용됩니다)
        </p>

        <form action={collectAction} className="flex flex-wrap items-center gap-3">
          <label className="text-sm">
            시작일
            <input
              name="from"
              type="date"
              defaultValue={qFrom}
              className="ml-2 rounded border px-2 py-1"
              required
            />
          </label>
          <label className="text-sm">
            종료일
            <input
              name="to"
              type="date"
              defaultValue={qTo}
              className="ml-2 rounded border px-2 py-1"
              required
            />
          </label>
          <label className="text-sm">
            소속부
            <select name="section" className="ml-2 rounded border px-2 py-1" defaultValue={qSection}>
              <option value="전체">전체</option>
              <option value="등록기업부">등록기업부</option>
              <option value="지정기업부">지정기업부</option>
            </select>
          </label>
          <button type="submit" className="rounded-2xl border px-4 py-2 hover:shadow">
            수집 실행
          </button>
        </form>

        {/* 수집 섹션 전용 결과 배너 */}
        {collectBanner ? (
          <div
            className={`rounded-xl border px-3 py-2 text-sm ${
              collectBanner.status === 'ok'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
            role="status"
          >
            {collectBanner.msg}
          </div>
        ) : (
          <div className="text-xs text-gray-500">
            * 수집 결과는 이 위치에 표시됩니다. 운영 환경에서는 크론 등록으로 자동화할 수 있습니다.
          </div>
        )}
      </section>

      {/* ───────────────────────────
          섹션 2: 조회(DB 조회 전용)
         ─────────────────────────── */}
      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="text-xl font-semibold">조회</h2>

        {/* 같은 페이지로 GET 제출 → 서버에서 DB 조회 후 표 렌더 */}
        <form method="get" className="flex flex-wrap items-center gap-3">
          <label className="text-sm">
            시작일
            <input
              name="from"
              type="date"
              defaultValue={qFrom}
              className="ml-2 rounded border px-2 py-1"
              required
            />
          </label>
          <label className="text-sm">
            종료일
            <input
              name="to"
              type="date"
              defaultValue={qTo}
              className="ml-2 rounded border px-2 py-1"
              required
            />
          </label>
          <label className="text-sm">
            소속부
            <select name="section" className="ml-2 rounded border px-2 py-1" defaultValue={qSection}>
              <option value="전체">전체</option>
              <option value="등록기업부">등록기업부</option>
              <option value="지정기업부">지정기업부</option>
            </select>
          </label>
          <button type="submit" className="rounded-2xl border px-4 py-2 hover:shadow">
            조회
          </button>

          <div className="ml-auto flex items-center gap-2 text-xs">
            <QuickLink label="1M" months={1} section={qSection} />
            <QuickLink label="3M" months={3} section={qSection} />
            <QuickLink label="6M" months={6} section={qSection} />
            <QuickLink label="YTD" ytd section={qSection} />
          </div>
        </form>

        {/* 표 렌더 */}
        {rows.length === 0 ? (
          <div className="text-sm text-gray-600">조회 결과가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1 text-left">일자</th>
                  <th className="px-2 py-1 text-right">가중주가평균</th>
                  <th className="px-2 py-1 text-right">거래량</th>
                  <th className="px-2 py-1 text-right">거래대금(원)</th>
                  <th className="px-2 py-1 text-right">시가총액(원)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.prd_de}-${r.section}`} className="border-b">
                    <td className="px-2 py-1">{r.prd_de}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.avg_price)}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.volume)}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.amount_krw)}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.market_cap_krw)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// 숫자 포맷터
function fmt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '-'
  try {
    return Number(n).toLocaleString()
  } catch {
    return String(n)
  }
}

// 빠른 기간 이동 링크(서버 렌더용)
function QuickLink({
  label,
  months,
  ytd,
  section,
}: {
  label: string
  months?: number
  ytd?: boolean
  section: string
}) {
  const now = dayjs()
  const from = ytd ? dayjs(`${now.year()}-01-01`) : now.subtract(months ?? 1, 'month')
  const to = now
  const href = `${PAGE_PATH}?from=${from.format('YYYY-MM-DD')}&to=${to.format(
    'YYYY-MM-DD'
  )}&section=${encodeURIComponent(section)}`

  return (
    <Link href={href} className="rounded border px-2 py-1 hover:shadow">
      {label}
    </Link>
  )
}
