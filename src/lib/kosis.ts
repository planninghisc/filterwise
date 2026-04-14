// src/lib/kosis.ts
import type { NextRequest } from 'next/server'

type KosisParams = {
  orgId: string
  tblId: string
  prdSe?: 'Y' | 'Q' | 'M'
  startPrdDe?: string
  endPrdDe?: string
  itmId?: string
  objL1?: string
  objL2?: string
  objL3?: string
  objL4?: string
  objL5?: string
}

export type KosisError = { ok: false; status: number; message: string; details?: unknown }
export type KosisOk<T = unknown> = {
  ok: true
  status: number
  data: T
  sourceUrl: string
  usedParams: Record<string, string>
}

function err(status: number, message: string, details?: unknown): KosisError {
  return { ok: false, status, message, details }
}

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required environment variable: ${name}`)
  return v
}

/** KOSIS Param API (statisticsParameterData.do) */
export async function fetchKosis<T = unknown>(params: KosisParams): Promise<KosisOk<T> | KosisError> {
  try {
    const apiKey = requireEnv('KOSIS_API_KEY')
    const base = 'https://kosis.kr/openapi/Param/statisticsParameterData.do'
    const q = new URLSearchParams()
    q.set('method', 'getList')
    q.set('apiKey', apiKey)
    q.set('format', 'json')
    q.set('jsonVD', 'Y') // 영문 필드

    if (!params.orgId || !params.tblId) return err(400, 'orgId, tblId는 필수입니다.')

    q.set('orgId', params.orgId)
    q.set('tblId', params.tblId)
    if (params.prdSe) q.set('prdSe', params.prdSe)
    if (params.startPrdDe) q.set('startPrdDe', params.startPrdDe)
    if (params.endPrdDe) q.set('endPrdDe', params.endPrdDe)
    if (params.itmId) q.set('itmId', params.itmId)
    if (params.objL1) q.set('objL1', params.objL1)
    if (params.objL2) q.set('objL2', params.objL2)
    if (params.objL3) q.set('objL3', params.objL3)
    if (params.objL4) q.set('objL4', params.objL4)
    if (params.objL5) q.set('objL5', params.objL5)

    const url = `${base}?${q.toString()}`
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) return err(res.status, 'KOSIS 응답 오류', { body: await res.text().catch(() => undefined) })

    const data = (await res.json()) as T
    return { ok: true, status: 200, data, sourceUrl: url, usedParams: Object.fromEntries(q.entries()) }
  } catch (e) {
    return err(500, 'KOSIS 호출 중 예외가 발생했습니다.', { error: String(e) })
  }
}

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, '').trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function q(req: NextRequest, name: string): string | undefined {
  const v = req.nextUrl.searchParams.get(name)
  return v ? v.trim() : undefined
}
