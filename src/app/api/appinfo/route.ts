//api오류 확인용

import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    // Vercel이 자동으로 주입하는 커밋 해시/URL
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    // 우리가 구분용으로 넣는 버전 문자열
    kosisLibVersion: 'kosis-v2-unwrap-2025-08-12',
  })
}
