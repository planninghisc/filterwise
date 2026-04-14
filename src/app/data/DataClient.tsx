// src/app/data/DataClient.tsx
'use client'

import Link from 'next/link'

/** 우상단 라벨 배지 (요청: 업무지원=연한 빨간색, MIS=연한 초록색) */
function CornerBadge({ type }: { type: '업무지원' | 'MIS' }) {
  const style =
    type === '업무지원'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-green-200 bg-green-50 text-green-700'

  return (
    <span
      className={`absolute right-3 top-3 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm ${style}`}
    >
      {type}
    </span>
  )
}

export default function DataClient() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <h2 className="text-2xl font-bold">API Data</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ── 금융위원회 보도자료 (업무지원) ── */}
        <Link
          href="/data/fsc-press"
          className="relative text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.99]"
        >
          <CornerBadge type="업무지원" />
          <div className="text-sm text-gray-500">금융위원회</div>
          <div className="mt-1 text-xl font-semibold">금융위원회 보도자료</div>
          <div className="mt-1 text-sm text-gray-600">금융위원회 보도자료 기간별 크롤링 및 조회</div>
          <div className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600">
            자세히 보기<span aria-hidden>→</span>
          </div>
        </Link>

        {/* ── 금융감독원 보도자료 (업무지원) ── */}
        <Link
          href="/data/fss-press"
          className="relative text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.99]"
        >
          <CornerBadge type="업무지원" />
          <div className="text-sm text-gray-500">금융감독원</div>
          <div className="mt-1 text-xl font-semibold">금융감독원 보도자료</div>
          <div className="mt-1 text-sm text-gray-600">금융감독원 보도자료 기간별 크롤링 및 조회</div>
          <div className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600">
            자세히 보기<span aria-hidden>→</span>
          </div>
        </Link>

        {/* --- R-ONE: 오피스 임대가격지수 (MIS) --- */}
        <Link
          href="/data/rone-office"
          className="relative text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.99]"
        >
          <CornerBadge type="MIS" />
          <div className="text-sm text-gray-500">R-ONE</div>
          <div className="mt-1 text-xl font-semibold">임대동향 지역별 임대가격지수(오피스)</div>
          <div className="mt-1 text-sm text-gray-600">CBD / KBD / YBD · 분기</div>
          <div className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600">
            자세히 보기<span aria-hidden>→</span>
          </div>
        </Link>

        {/* --- R-ONE: 오피스 공실률 (MIS) --- */}
        <Link
          href="/data/rone-vacancy"
          className="relative text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.99]"
        >
          <CornerBadge type="MIS" />
          <div className="text-sm text-gray-500">R-ONE</div>
          <div className="mt-1 text-xl font-semibold">임대 지역별 공실률(오피스)</div>
          <div className="mt-1 text-sm text-gray-600">CBD / KBD / YBD · 분기</div>
          <div className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600">
            자세히 보기<span aria-hidden>→</span>
          </div>
        </Link>

        {/* ── KOSIS: 주택시장 소비심리지수 (MIS) ── */}
        <Link
          href="/data/kosis/hcsi"
          className="relative text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.99]"
        >
          <CornerBadge type="MIS" />
          <div className="text-sm text-gray-500">KOSIS</div>
          <div className="mt-1 text-xl font-semibold">주택시장 소비심리지수</div>
          <div className="mt-1 text-sm text-gray-600">월 간(전국/광역) · DB조회</div>
          <div className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600">
            자세히 보기<span aria-hidden>→</span>
          </div>
        </Link>

        {/* ── KOSIS: 미분양주택 현황 (시도/시군구) (MIS) ── */}
        <Link
          href="/data/kosis/unsold"
          className="relative text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.99]"
        >
          <CornerBadge type="MIS" />
          <div className="text-sm text-gray-500">KOSIS</div>
          <div className="mt-1 text-xl font-semibold">미분양주택 현황 (시도/시군구)</div>
          <div className="mt-1 text-sm text-gray-600">월 간(시도/시군구) · DB조회</div>
          <div className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600">
            자세히 보기<span aria-hidden>→</span>
          </div>
        </Link>

        {/* ── KOSIS: 공사완료 후 미분양 현황 (MIS) ── */}
        <Link
          href="/data/kosis/unsold-after"
          className="relative text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.99]"
        >
          <CornerBadge type="MIS" />
          <div className="text-sm text-gray-500">KOSIS</div>
          <div className="mt-1 text-xl font-semibold">공사완료 후 미분양 현황</div>
          <div className="mt-1 text-sm text-gray-600">월 간(시군구) · DB조회</div>
          <div className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600">
            자세히 보기<span aria-hidden>→</span>
          </div>
        </Link>

        {/* ── S&P DJI: S&P Global Infrastructure Index (비공식, MIS) ── */}
        <Link
          href="/data/spgi-infra"
          className="relative text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.99]"
        >
          <CornerBadge type="MIS" />
          <div className="text-sm text-gray-500">S&P DJI</div>
          <div className="mt-1 text-xl font-semibold">S&amp;P Global Infrastructure Index</div>
          <div className="mt-1 text-sm text-gray-600">Google Sheets CSV · 수집/DB조회, 우회 접근</div>
          <div className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600">
            자세히 보기<span aria-hidden>→</span>
          </div>
        </Link>

        {/* ── KRX: 월별상장통계 (KOSDAQ, MIS) ── */}
        <Link
          href="/data/krx-listing"
          className="relative text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.99]"
        >
          <CornerBadge type="MIS" />
          <div className="text-sm text-gray-500">KIND (KRX)</div>
          <div className="mt-1 text-xl font-semibold">월별상장통계 (코스닥)</div>
          <div className="mt-1 text-sm text-gray-600">연도별 수집(엑셀) · DB조회</div>
          <div className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600">
            자세히 보기<span aria-hidden>→</span>
          </div>
        </Link>
      </div>
    </div>
  )
}
