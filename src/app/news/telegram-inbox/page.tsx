'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'

type InboxRow = {
  id: string
  chat_id: string
  first_name: string | null
  username: string | null
  text: string
  is_read: boolean
  created_at: string
}

type InboxResp = { ok: boolean; list: InboxRow[]; error?: string }

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json())

function formatKst(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
}

export default function TelegramInboxPage() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [replyById, setReplyById] = useState<Record<string, string>>({})
  const [loadingReplyId, setLoadingReplyId] = useState<string | null>(null)
  const query = useMemo(() => `/api/telegram/inbox?limit=200${unreadOnly ? '&unread=1' : ''}`, [unreadOnly])
  const { data, isLoading, mutate } = useSWR<InboxResp>(query, fetcher, { revalidateOnFocus: false })
  const list = data?.ok ? data.list : []

  const markRead = async (id: string, isRead: boolean) => {
    const res = await fetch('/api/telegram/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_read: isRead }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      alert(`읽음 처리 실패: ${json?.error ?? 'unknown error'}`)
      return
    }
    mutate()
  }

  const sendReply = async (row: InboxRow) => {
    const message = (replyById[row.id] ?? '').trim()
    if (!message) return alert('답장 메시지를 입력해주세요.')
    setLoadingReplyId(row.id)
    try {
      const res = await fetch('/api/telegram/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: row.chat_id, message }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) {
        alert(`답장 실패: ${json?.error ?? 'unknown error'}`)
        return
      }
      setReplyById((prev) => ({ ...prev, [row.id]: '' }))
      if (!row.is_read) await markRead(row.id, true)
      alert('답장을 보냈습니다.')
    } finally {
      setLoadingReplyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#c2410c]">Telegram 관리자 수신함</h1>
          <p className="text-sm text-gray-600">봇에 들어온 일반 메시지를 확인하고 답장할 수 있습니다.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          안 읽은 메시지만 보기
        </label>
      </div>

      {isLoading && <div className="rounded border bg-white p-4 text-sm text-gray-500">불러오는 중...</div>}
      {!isLoading && list.length === 0 && (
        <div className="rounded border bg-white p-6 text-center text-gray-500">메시지가 없습니다.</div>
      )}

      <ul className="space-y-4">
        {list.map((row) => (
          <li
            key={row.id}
            className={`rounded-xl border p-4 shadow-sm ${row.is_read ? 'bg-white' : 'bg-orange-50/50 border-orange-200'}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm">
                <b>{row.first_name || '(이름 없음)'}</b>
                <span className="ml-2 text-gray-500">@{row.username || 'unknown'}</span>
                <span className="ml-2 text-gray-400">chat_id: {row.chat_id}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{formatKst(row.created_at)}</span>
                <button
                  onClick={() => markRead(row.id, !row.is_read)}
                  className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                >
                  {row.is_read ? '미읽음으로' : '읽음 처리'}
                </button>
              </div>
            </div>
            <p className="whitespace-pre-wrap rounded border bg-white p-3 text-sm text-gray-800">{row.text}</p>

            <div className="mt-3 space-y-2">
              <textarea
                value={replyById[row.id] ?? ''}
                onChange={(e) => setReplyById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="답장 메시지 입력 (HTML 태그 가능)"
                className="h-24 w-full resize-none rounded border p-2 text-sm"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => sendReply(row)}
                  disabled={loadingReplyId === row.id}
                  className="rounded bg-[#ea580c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c2410c] disabled:opacity-60"
                >
                  {loadingReplyId === row.id ? '전송 중...' : '답장 보내기'}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
