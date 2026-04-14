// src/app/api/dart/sync/route.ts
import { NextRequest, NextResponse } from 'next/server'
import type { ReprtCode, FsDiv, SjDiv } from '@/lib/dart'

type PostBody = {
  corp_code?: unknown
  corp_codes?: unknown
  year?: unknown
  reprt?: unknown
  fs_div?: unknown
  sj_div?: unknown
}

type Result = {
  corp_code: string
  year: number
  reprt: ReprtCode
  fs_div: FsDiv
  sj_div: SjDiv
  ok: boolean
  message?: string
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => ({}))) as PostBody

    const fromArray = toStringArray(raw.corp_codes)
    const fromSingle = typeof raw.corp_code === 'string' && raw.corp_code.trim() ? [raw.corp_code.trim()] : []
    const targets = fromArray.length > 0 ? fromArray : fromSingle

    if (targets.length === 0) {
      return NextResponse.json({ ok: false, error: 'corp_code(s) is required' }, { status: 400 })
    }

    const year = typeof raw.year === 'number' ? raw.year : new Date().getFullYear()
    const reprt = (typeof raw.reprt === 'string' ? raw.reprt : '11011') as ReprtCode
    const fs_div = (typeof raw.fs_div === 'string' ? raw.fs_div : 'OFS') as FsDiv
    const sj_div = (typeof raw.sj_div === 'string' ? raw.sj_div : 'BS') as SjDiv

    // 실제 동기화 처리 대신 "큐에 넣음" 응답만 반환 (타입 안전)
    const results: Result[] = targets.map((c) => ({
      corp_code: c,
      year,
      reprt,
      fs_div,
      sj_div,
      ok: true,
      message: 'queued',
    }))

    return NextResponse.json({ ok: true, results })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
