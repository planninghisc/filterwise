// DART 분석 대상 증권사 등록·삭제·규모(대형/중소형) + 피어(중소형과 중복 가능)
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, Plus, Trash2 } from 'lucide-react'
import {
  DART_SIZE_TIER_LABEL,
  formatDartCorpLabel,
  mergeDartCorpsFromDb,
  type DartCorpTier,
  type MergedDartCorp,
} from '@/data/dartCorpRows'

const SIZE_OPTIONS: { value: DartCorpTier; label: string }[] = [
  { value: 'large', label: DART_SIZE_TIER_LABEL.large },
  { value: 'mid', label: DART_SIZE_TIER_LABEL.mid },
]

function tierBadgeClass(tier: DartCorpTier) {
  if (tier === 'large') return 'bg-violet-100 text-violet-900 border-violet-200'
  return 'bg-sky-100 text-sky-900 border-sky-200'
}

type ApiRow = { corp_code: string; corp_name: string; tier: string; is_peer: boolean }

function sortRows(rows: MergedDartCorp[]): MergedDartCorp[] {
  const order = { large: 0, mid: 1 } as const
  return [...rows].sort((a, b) => {
    const od = order[a.tier] - order[b.tier]
    if (od !== 0) return od
    return a.corp_name.localeCompare(b.corp_name, 'ko')
  })
}

export default function DartCorpSettingsPage() {
  const [rows, setRows] = useState<MergedDartCorp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newTier, setNewTier] = useState<DartCorpTier>('mid')
  const [newIsPeer, setNewIsPeer] = useState(false)
  const [adding, setAdding] = useState(false)

  const [nameDraft, setNameDraft] = useState<Record<string, string>>({})

  const applyApiRow = useCallback((raw: ApiRow) => {
    const merged = mergeDartCorpsFromDb([raw])[0]
    if (!merged) return
    setRows((prev) => sortRows([...prev.filter((r) => r.corp_code !== merged.corp_code), merged]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/dart/corps')
      const data = (await res.json()) as {
        ok?: boolean
        list?: { corp_code: string; corp_name: string; tier?: string | null; is_peer?: boolean | null }[]
        error?: string
      }
      if (!res.ok || !data.ok) throw new Error(data.error ?? '목록을 불러오지 못했습니다.')
      const list = mergeDartCorpsFromDb(data.list ?? [])
      setRows(list)
      setNameDraft(Object.fromEntries(list.map((r) => [r.corp_code, r.corp_name])))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patchTier = async (corp_code: string, tier: DartCorpTier) => {
    setMsg('')
    try {
      const res = await fetch(`/api/dart/corps/${encodeURIComponent(corp_code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const data = (await res.json()) as { ok?: boolean; row?: ApiRow; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? '저장 실패')
      if (data.row) applyApiRow(data.row)
      setMsg('규모를 저장했습니다.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류')
    }
  }

  const patchPeer = async (corp_code: string, is_peer: boolean) => {
    setMsg('')
    try {
      const res = await fetch(`/api/dart/corps/${encodeURIComponent(corp_code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_peer }),
      })
      const data = (await res.json()) as { ok?: boolean; row?: ApiRow; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? '저장 실패')
      if (data.row) applyApiRow(data.row)
      setMsg('피어 설정을 저장했습니다.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류')
    }
  }

  const saveName = async (corp_code: string, name: string) => {
    const trimmed = name.trim()
    const prev = rows.find((r) => r.corp_code === corp_code)?.corp_name ?? ''
    if (!trimmed || trimmed === prev) return
    setMsg('')
    try {
      const res = await fetch(`/api/dart/corps/${encodeURIComponent(corp_code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corp_name: trimmed }),
      })
      const data = (await res.json()) as { ok?: boolean; row?: ApiRow; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? '저장 실패')
      if (data.row) applyApiRow(data.row)
      setMsg('회사명을 저장했습니다.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류')
    }
  }

  const remove = async (corp_code: string) => {
    if (!window.confirm('이 회사를 목록에서 삭제할까요? (DB에서 제거됩니다)')) return
    setMsg('')
    try {
      const res = await fetch(`/api/dart/corps/${encodeURIComponent(corp_code)}`, { method: 'DELETE' })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? '삭제 실패')
      setRows((prev) => prev.filter((r) => r.corp_code !== corp_code))
      setNameDraft((d) => {
        const n = { ...d }
        delete n[corp_code]
        return n
      })
      setMsg('삭제했습니다.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류')
    }
  }

  const add = async () => {
    setAdding(true)
    setError('')
    setMsg('')
    try {
      const res = await fetch('/api/dart/corps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corp_code: newCode.trim(),
          corp_name: newName.trim(),
          tier: newTier,
          is_peer: newTier === 'mid' && newIsPeer,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? '등록 실패')
      await load()
      setNewCode('')
      setNewName('')
      setNewTier('mid')
      setNewIsPeer(false)
      setMsg('등록했습니다.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-6 text-[var(--fw-text)]">
      <div className="flex items-start gap-2">
        <Building2 className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">CORP registration</h1>
          <p className="text-[13px] text-zinc-600 mt-1 leading-relaxed">
            OpenDART <strong className="font-medium text-zinc-700">고유번호(corp_code)</strong> 8자리와 회사명을 등록합니다.{' '}
            <strong className="font-medium text-zinc-700">대형·중소형</strong>은 규모 구분이며,{' '}
            <strong className="font-medium text-zinc-700">피어</strong>는 중소형사 가운데 비교 그룹에 넣을 회사에만 표시합니다(중소형과 동시에 설정 가능).
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-zinc-800">회사 추가</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[11px] text-zinc-600">고유번호 (8자리)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="예: 00104856"
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-0 lg:col-span-1">
            <label className="text-[11px] text-zinc-600">회사명</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: ○○증권"
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[11px] text-zinc-600">규모</label>
            <select
              value={newTier}
              onChange={(e) => {
                const t = e.target.value as DartCorpTier
                setNewTier(t)
                if (t === 'large') setNewIsPeer(false)
              }}
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[11px] text-zinc-600">피어 그룹</label>
            <label className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm">
              <input
                type="checkbox"
                checked={newTier === 'mid' && newIsPeer}
                disabled={newTier === 'large'}
                onChange={(e) => setNewIsPeer(e.target.checked)}
                className="rounded border-zinc-400"
              />
              <span className={newTier === 'large' ? 'text-zinc-400' : ''}>피어</span>
            </label>
          </div>
          <div className="flex flex-col gap-1 min-w-0 lg:col-span-1">
            <label className="text-[11px] text-transparent select-none">등록</label>
            <button
              type="button"
              onClick={add}
              disabled={adding || newCode.length !== 8 || !newName.trim()}
              className="h-10 w-full rounded-md bg-[#ea580c] px-4 text-sm text-white hover:bg-[#c2410c] disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {adding ? '등록 중…' : '등록'}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}
      {msg ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>
      ) : null}

      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-800">등록된 회사 ({rows.length})</h2>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-xs text-orange-700 hover:underline disabled:opacity-50"
          >
            새로고침
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full text-[12px] md:text-[13px]">
            <thead className="bg-zinc-50/90">
              <tr>
                <th className="px-3 py-2 text-left font-semibold border-b w-[110px]">규모</th>
                <th className="px-3 py-2 text-center font-semibold border-b w-[100px]">피어</th>
                <th className="px-3 py-2 text-left font-semibold border-b min-w-[160px]">회사명</th>
                <th className="px-3 py-2 text-left font-semibold border-b w-[120px]">고유번호</th>
                <th className="px-3 py-2 text-left font-semibold border-b w-[140px]">표시</th>
                <th className="px-3 py-2 text-right font-semibold border-b w-[88px]">삭제</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-zinc-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-zinc-500">
                    등록된 회사가 없습니다. 위에서 추가하거나 DB 마이그레이션을 적용했는지 확인하세요.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.corp_code} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                    <td className="px-3 py-2 align-middle">
                      <select
                        value={r.tier}
                        onChange={(e) => patchTier(r.corp_code, e.target.value as DartCorpTier)}
                        className={[
                          'h-9 w-full max-w-[9rem] rounded-md border px-2 text-[12px] font-medium',
                          tierBadgeClass(r.tier),
                        ].join(' ')}
                      >
                        {SIZE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-middle text-center">
                      <input
                        type="checkbox"
                        checked={r.tier === 'mid' && r.is_peer}
                        disabled={r.tier === 'large'}
                        onChange={(e) => patchPeer(r.corp_code, e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-400"
                        title={r.tier === 'large' ? '대형사는 피어를 쓰지 않습니다' : '피어 비교 그룹'}
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="text"
                        value={nameDraft[r.corp_code] ?? r.corp_name}
                        onChange={(e) =>
                          setNameDraft((d) => ({
                            ...d,
                            [r.corp_code]: e.target.value,
                          }))
                        }
                        onBlur={() => saveName(r.corp_code, nameDraft[r.corp_code] ?? r.corp_name)}
                        className="h-9 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[13px]"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle text-zinc-600 tabular-nums">{r.corp_code}</td>
                    <td className="px-3 py-2 align-middle text-zinc-600 text-[12px]">{formatDartCorpLabel(r.tier, r.is_peer)}</td>
                    <td className="px-3 py-2 align-middle text-right">
                      <button
                        type="button"
                        onClick={() => remove(r.corp_code)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1.5 text-xs text-red-700 hover:bg-red-50"
                        aria-label={`${r.corp_name} 삭제`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
