import { NextRequest, NextResponse } from 'next/server'
import { normalizeDartSjDiv, type ReprtCode } from '@/lib/dart'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireCronOrSession } from '@/lib/requireCronOrSession'
import AdmZip from 'adm-zip'
import iconv from 'iconv-lite'

type FsDiv = 'OFS' | 'CFS'
const KOREA_INVEST_CORP_CODE = '00160144'
const SGA_QNAME = 'ifrs-full_SellingGeneralAndAdministrativeExpense'

type DartFnlttApiItem = {
  rcept_no?: string
  sj_div?: string
  sj_nm?: string
  account_nm?: string
  account_id?: string
  thstrm_amount?: string
  frmtrm_amount?: string
  ord?: string | number
  currency?: string
}

type DartFnlttApiResponse = {
  status?: string
  message?: string
  list?: DartFnlttApiItem[]
}

type Row = {
  sheet_code: string
  sheet_name: string
  fs_div: FsDiv
  sj_div: string
  account_nm: string | null
  account_id: string | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
  ord: number | null
  currency: string | null
}

type FnlttInsertRow = {
  corp_code: string
  bsns_year: number
  reprt_code: ReprtCode
  fs_div: FsDiv
  sj_div: 'BS' | 'CIS'
  sheet_code: string | null
  account_nm: string | null
  account_id: string | null
  thstrm_amount: number | null
  frmtrm_amount: number | null
  ord: number | null
  currency: string | null
}

const TARGET_SHEETS = new Set(['DS320005', 'DS220005', 'DS220000', 'DS320000'])

function getDartApiKey(): string | null {
  const key =
    process.env.DART_API_KEY ||
    process.env.OPEN_DART_API_KEY ||
    process.env.OPENDART_API_KEY ||
    process.env.DART_KEY ||
    null
  return key && key.trim() ? key.trim() : null
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s || s.toLowerCase() === 'nan' || s.toLowerCase() === 'null') return null
    const n = Number(s.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function adjustAmountForCorp(corpCode: string, accountId: string | null, amount: number | null): number | null {
  if (amount == null) return null
  if (corpCode === KOREA_INVEST_CORP_CODE && accountId === SGA_QNAME && amount < 0) {
    return Math.abs(amount)
  }
  return amount
}

function pickEmployeeCountFromXbrl(items: Array<DartFnlttApiItem & { __fs_div: FsDiv }>): {
  headcount: number | null
  source?: string
} {
  type Cand = { value: number; score: number; source: string }
  const cands: Cand[] = []

  for (const it of items) {
    const accountId = (it.account_id ?? '').toString().trim()
    const accountNm = (it.account_nm ?? '').toString().trim()
    const v = toNumberOrNull(it.thstrm_amount)
    if (v == null) continue

    const idLc = accountId.toLowerCase().replace(/[:_]/g, '-')
    const nmLc = accountNm.toLowerCase()

    let score = 0
    if (idLc === 'dart-gcd-numberofemployee') score = 120
    else if (idLc.endsWith('-numberofemployee') || idLc.includes('numberofemployee')) score = 100
    else if (nmLc === '임직원수' || nmLc === '종업원수') score = 80

    if (score <= 0) continue
    if (!Number.isFinite(v) || v < 0) continue

    // 별도(OFS) 값을 우선 사용하도록 가중치
    if (it.__fs_div === 'OFS') score += 5
    cands.push({ value: Math.round(v), score, source: accountId || accountNm || 'unknown' })
  }

  if (cands.length === 0) return { headcount: null }
  cands.sort((a, b) => b.score - a.score)
  return { headcount: cands[0].value, source: cands[0].source }
}

function parseSheetInfo(sjNm: string | undefined, fsDiv: FsDiv, sjDiv: string) {
  const nm = (sjNm ?? '').trim()
  const m = nm.match(/\[([A-Z0-9_]+)\]/i)
  const code = (m?.[1] ?? '').toUpperCase()

  if (code) return { code, name: nm }

  // Fallback: OpenDART 응답에 코드가 없을 때 표 종류로 매핑
  if (fsDiv === 'OFS' && sjDiv === 'CIS') return { code: 'DS320005', name: nm || '포괄손익계산서, 증권 - 별도' }
  if (fsDiv === 'OFS' && sjDiv === 'BS') return { code: 'DS220005', name: nm || '재무상태표, 증권 - 별도' }
  if (fsDiv === 'CFS' && sjDiv === 'CIS') return { code: 'DS320000', name: nm || '포괄손익계산서, 증권 - 연결' }
  if (fsDiv === 'CFS' && sjDiv === 'BS') return { code: 'DS220000', name: nm || '재무상태표, 증권 - 연결' }
  return { code: '', name: nm }
}

async function fetchFnltt(params: {
  corp_code: string
  year: number
  reprt: ReprtCode
  fs_div: FsDiv
}): Promise<DartFnlttApiItem[]> {
  const key = getDartApiKey()
  if (!key) throw new Error('DART API key is missing.')

  // OpenDART "단일회사 전체 재무제표"는 singl endpoint + fs_div(OFS/CFS) 조합으로 조회
  const endpoint = 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json'

  const qs = new URLSearchParams({
    crtfc_key: key,
    corp_code: params.corp_code,
    bsns_year: String(params.year),
    reprt_code: params.reprt,
    fs_div: params.fs_div,
  })
  const res = await fetch(`${endpoint}?${qs.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`OpenDART HTTP ${res.status}`)
  const json = (await res.json()) as DartFnlttApiResponse
  const code = String(json.status ?? '')
  if (code !== '000' && code !== '013') {
    throw new Error(`OpenDART ${code}: ${json.message ?? 'unknown error'}`)
  }
  return Array.isArray(json.list) ? json.list : []
}

async function fetchHeadcountFromXbrlZip(args: { rcept_no: string; reprt: ReprtCode }): Promise<{ headcount: number | null; source?: string }> {
  const key = getDartApiKey()
  if (!key) return { headcount: null }

  const qs = new URLSearchParams({
    crtfc_key: key,
    rcept_no: args.rcept_no,
    reprt_code: args.reprt,
  })
  const res = await fetch(`https://opendart.fss.or.kr/api/fnlttXbrl.xml?${qs.toString()}`, { cache: 'no-store' })
  if (!res.ok) return { headcount: null }

  const buf = Buffer.from(await res.arrayBuffer())
  let zip: AdmZip
  try {
    zip = new AdmZip(buf)
  } catch {
    return { headcount: null }
  }

  const entries = zip.getEntries().filter((e: { isDirectory: boolean }) => !e.isDirectory)
  for (const e of entries) {
    const name = e.entryName.toLowerCase()
    if (!name.endsWith('.xml') && !name.endsWith('.xbrl')) continue

    const txt = e.getData().toString('utf8')
    const patterns = [
      /<[^>]*dart-gcd[_:]NumberOfEmployee[^>]*>([^<]+)<\/[^>]+>/gi,
      /<[^>]*NumberOfEmployee[^>]*>([^<]+)<\/[^>]+>/gi,
    ]
    for (const re of patterns) {
      let m: RegExpExecArray | null
      while ((m = re.exec(txt)) !== null) {
        const n = toNumberOrNull(m[1])
        if (n != null && n >= 0) {
          return { headcount: Math.round(n), source: 'dart-gcd_NumberOfEmployee (XBRL ZIP)' }
        }
      }
    }
  }
  return { headcount: null }
}

function extractHeadcountFromXmlText(txt: string, sourceLabel: string): { headcount: number | null; source?: string } {
  // 1) Inline XBRL facts: <ix:nonFraction name="dart-gcd:NumberOfEmployee">123</ix:nonFraction>
  const inlinePatterns = [
    /<ix:(?:nonfraction|nonnumeric)[^>]*\bname=["'][^"']*numberofemployee[^"']*["'][^>]*>([\s\S]*?)<\/ix:(?:nonfraction|nonnumeric)>/gi,
    /<ix:(?:nonfraction|nonnumeric)[^>]*\bname=["'][^"']*dart-gcd[:_ -]?numberofemployee[^"']*["'][^>]*>([\s\S]*?)<\/ix:(?:nonfraction|nonnumeric)>/gi,
  ]
  for (const re of inlinePatterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(txt)) !== null) {
      const inner = String(m[1] ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      const n = toNumberOrNull(inner)
      if (n != null && n >= 0) {
        return { headcount: Math.round(n), source: sourceLabel }
      }
    }
  }

  // 2) 일반 XML facts: <dart-gcd:NumberOfEmployee>123</dart-gcd:NumberOfEmployee>
  const patterns = [
    /<[^>]*dart-gcd[_:]NumberOfEmployee[^>]*>([^<]+)<\/[^>]+>/gi,
    /<[^>]*NumberOfEmployee[^>]*>([^<]+)<\/[^>]+>/gi,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(txt)) !== null) {
      const n = toNumberOrNull(m[1])
      if (n != null && n >= 0) {
        return { headcount: Math.round(n), source: sourceLabel }
      }
    }
  }
  return { headcount: null }
}

async function fetchHeadcountFromDocumentZip(args: { rcept_no: string }): Promise<{ headcount: number | null; source?: string }> {
  const key = getDartApiKey()
  if (!key) return { headcount: null }

  const qs = new URLSearchParams({
    crtfc_key: key,
    rcept_no: args.rcept_no,
  })
  const res = await fetch(`https://opendart.fss.or.kr/api/document.xml?${qs.toString()}`, { cache: 'no-store' })
  if (!res.ok) return { headcount: null }

  const buf = Buffer.from(await res.arrayBuffer())
  let zip: AdmZip
  try {
    zip = new AdmZip(buf)
  } catch {
    return { headcount: null }
  }

  const entries = zip.getEntries().filter((e: { isDirectory: boolean }) => !e.isDirectory)
  for (const e of entries) {
    const name = e.entryName.toLowerCase()
    if (!name.endsWith('.xml') && !name.endsWith('.xbrl') && !name.endsWith('.xhtml') && !name.endsWith('.html')) continue

    const raw = e.getData()
    const utf8 = raw.toString('utf8')
    const hitUtf8 = extractHeadcountFromXmlText(utf8, 'dart-gcd_NumberOfEmployee (document.xml)')
    if (hitUtf8.headcount != null) return hitUtf8

    const euckr = iconv.decode(raw, 'euc-kr')
    const hitEuckr = extractHeadcountFromXmlText(euckr, 'dart-gcd_NumberOfEmployee (document.xml)')
    if (hitEuckr.headcount != null) return hitEuckr
  }
  return { headcount: null }
}

async function fetchHeadcountFromViewer(args: { rcept_no: string }): Promise<{ headcount: number | null; source?: string }> {
  const mainUrl = `https://opendart.fss.or.kr/xbrl/viewer/main.do?rcpNo=${encodeURIComponent(args.rcept_no)}`
  const mainRes = await fetch(mainUrl, { cache: 'no-store' })
  if (!mainRes.ok) return { headcount: null }
  const mainHtml = await mainRes.text()

  const seqMatch =
    mainHtml.match(/viewDoc\("(\d+)"/) ??
    mainHtml.match(/viewDoc\('(\d+)'/) ??
    mainHtml.match(/xbrlExtSeq["']?\s*[:=]\s*["']?(\d+)/) ??
    mainHtml.match(/"xbrlExtSeq"\s*:\s*"(\d+)"/)
  const xbrlExtSeq = seqMatch?.[1]
  if (!xbrlExtSeq) return { headcount: null }

  const viewUrl = `https://opendart.fss.or.kr/xbrl/viewer/view.do?xbrlExtSeq=${encodeURIComponent(
    xbrlExtSeq,
  )}&roleId=role-D999004&lang=ko`
  const viewRes = await fetch(viewUrl, { cache: 'no-store' })
  if (!viewRes.ok) return { headcount: null }
  const viewHtml = await viewRes.text()

  const factMatch =
    viewHtml.match(/id="[^"#]*#dart-gcd_NumberOfEmployee">([^<]+)</i) ??
    viewHtml.match(/id="[^"#]*#dart-gcd[:_ -]?NumberOfEmployee">([^<]+)</i) ??
    viewHtml.match(/공시대상,종업원수<\/span><\/td><td[^>]*><span[^>]*>([^<]+)</i)
  if (!factMatch?.[1]) return { headcount: null }

  const n = toNumberOrNull(factMatch[1])
  if (n == null || n < 0) return { headcount: null }
  return { headcount: Math.round(n), source: 'dart-gcd_NumberOfEmployee (xbrl viewer D999004)' }
}

/** DB ux_dart_fnltt_key 와 맞추기: OpenDART가 동일 계정을 중복 줄 때 병합 */
function dedupeFnlttInsertRows(rows: FnlttInsertRow[]): FnlttInsertRow[] {
  const m = new Map<string, FnlttInsertRow>()
  const score = (r: FnlttInsertRow) =>
    Math.abs(r.thstrm_amount ?? 0) + Math.abs(r.frmtrm_amount ?? 0) + (r.ord ?? 0) * 1e-9

  for (const r of rows) {
    const aid = (r.account_id ?? '').trim()
    const anm = (r.account_nm ?? '').trim()
    const sheet = (r.sheet_code ?? '').trim()
    const key = `${r.fs_div}|${r.sj_div}|${sheet}|${aid}|${anm}`
    const prev = m.get(key)
    if (!prev) {
      m.set(key, r)
      continue
    }
    if (score(r) >= score(prev)) m.set(key, r)
  }
  return Array.from(m.values())
}

async function persistRowsToDartFnltt(args: {
  corp_code: string
  year: number
  reprt: ReprtCode
  rows: Row[]
}): Promise<number> {
  const targetRows = args.rows.filter((r) => r.sj_div === 'BS' || r.sj_div === 'CIS') as Array<Row & { sj_div: 'BS' | 'CIS' }>

  // 기존 sync 라우트와 동일하게 분리키 단위로 교체
  for (const fs_div of ['OFS', 'CFS'] as const) {
    for (const sj_div of ['BS', 'CIS'] as const) {
      const { error: delErr } = await supabaseAdmin
        .from('dart_fnltt')
        .delete()
        .eq('corp_code', args.corp_code)
        .eq('bsns_year', args.year)
        .eq('reprt_code', args.reprt)
        .eq('fs_div', fs_div)
        .eq('sj_div', sj_div)
      if (delErr) throw new Error(`dart_fnltt delete failed: ${delErr.message}`)
    }
  }

  const rawPayload: FnlttInsertRow[] = targetRows.map((r) => ({
    corp_code: args.corp_code,
    bsns_year: args.year,
    reprt_code: args.reprt,
    fs_div: r.fs_div,
    sj_div: r.sj_div,
    sheet_code: r.sheet_code || null,
    account_nm: r.account_nm,
    account_id: r.account_id,
    thstrm_amount: r.thstrm_amount,
    frmtrm_amount: r.frmtrm_amount,
    ord: r.ord,
    currency: r.currency,
  }))

  const payload = dedupeFnlttInsertRows(rawPayload)

  if (payload.length > 0) {
    const { error: insErr } = await supabaseAdmin.from('dart_fnltt').insert(payload)
    if (insErr) throw new Error(`dart_fnltt insert failed: ${insErr.message}`)
  }
  return payload.length
}

/** DB에 dart_headcount 테이블이 없거나 RLS 등으로 실패해도 조회 본문은 성공시키기 위해 예외를 던지지 않습니다. */
async function persistHeadcount(args: {
  corp_code: string
  year: number
  reprt: ReprtCode
  headcount: number | null
  headcount_source: string | null
}): Promise<boolean> {
  const { error } = await supabaseAdmin.from('dart_headcount').upsert(
    {
      corp_code: args.corp_code,
      bsns_year: args.year,
      reprt_code: args.reprt,
      headcount: args.headcount,
      headcount_source: args.headcount_source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'corp_code,bsns_year,reprt_code' },
  )
  if (error) {
    console.warn('[xbrl-sheet-rows] dart_headcount upsert skipped:', error.message)
    return false
  }
  return true
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireCronOrSession(req)
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const corp_code = (searchParams.get('corp_code') ?? '').trim()
    if (!corp_code) {
      return NextResponse.json({ ok: false, error: 'corp_code가 필요합니다.' }, { status: 400 })
    }

    const year = Number(searchParams.get('year') ?? new Date().getFullYear())
    const reprt = (searchParams.get('reprt') ?? '11011') as ReprtCode

    const [ofs, cfs] = await Promise.all([
      fetchFnltt({ corp_code, year, reprt, fs_div: 'OFS' }),
      fetchFnltt({ corp_code, year, reprt, fs_div: 'CFS' }),
    ])

    const merged = [...ofs.map((x) => ({ ...x, __fs_div: 'OFS' as FsDiv })), ...cfs.map((x) => ({ ...x, __fs_div: 'CFS' as FsDiv }))]
    let employee = pickEmployeeCountFromXbrl(merged)
    if (employee.headcount == null) {
      const rcept_no =
        merged.find((x) => typeof x.rcept_no === 'string' && x.rcept_no.trim())?.rcept_no?.trim() ?? ''
      if (rcept_no) {
        const viewerFallback = await fetchHeadcountFromViewer({ rcept_no })
        if (viewerFallback.headcount != null) {
          employee = viewerFallback
        } else {
          const fallback = await fetchHeadcountFromXbrlZip({ rcept_no, reprt })
          if (fallback.headcount != null) {
            employee = fallback
          } else {
            const docFallback = await fetchHeadcountFromDocumentZip({ rcept_no })
            if (docFallback.headcount != null) employee = docFallback
          }
        }
      }
    }

    const rows: Row[] = merged
      .map((it) => {
        const sjDiv = normalizeDartSjDiv(it.sj_div)
        const sheet = parseSheetInfo(it.sj_nm, it.__fs_div, sjDiv)
        return {
          sheet_code: sheet.code,
          sheet_name: sheet.name,
          fs_div: it.__fs_div,
          sj_div: sjDiv,
          account_nm: (it.account_nm ?? '').toString().trim() || null,
          account_id: (it.account_id ?? '').toString().trim() || null,
          thstrm_amount: adjustAmountForCorp(
            corp_code,
            (it.account_id ?? '').toString().trim() || null,
            toNumberOrNull(it.thstrm_amount),
          ),
          frmtrm_amount: adjustAmountForCorp(
            corp_code,
            (it.account_id ?? '').toString().trim() || null,
            toNumberOrNull(it.frmtrm_amount),
          ),
          ord: toNumberOrNull(it.ord),
          currency: (it.currency ?? '').toString().trim() || null,
        }
      })
      .filter((r) => TARGET_SHEETS.has(r.sheet_code))
      .sort((a, b) => {
        if (a.sheet_code !== b.sheet_code) return a.sheet_code.localeCompare(b.sheet_code)
        const ao = a.ord ?? 1e12
        const bo = b.ord ?? 1e12
        if (ao !== bo) return ao - bo
        return String(a.account_nm ?? '').localeCompare(String(b.account_nm ?? ''), 'ko')
      })

    const saved = await persistRowsToDartFnltt({
      corp_code,
      year,
      reprt,
      rows,
    })

    const headcountSaved = await persistHeadcount({
      corp_code,
      year,
      reprt,
      headcount: employee.headcount,
      headcount_source: employee.source ?? null,
    })

    return NextResponse.json({
      ok: true,
      corp_code,
      year,
      reprt,
      count: rows.length,
      rows,
      headcount: employee.headcount,
      headcount_source: employee.source ?? null,
      saved_count: saved,
      headcount_saved: headcountSaved,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
