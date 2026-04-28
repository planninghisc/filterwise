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
  const [replyInput, setReplyInput] = useState('')
  const [loadingReply, setLoadingReply] = useState(false)
  const query = useMemo(() => `/api/telegram/inbox?limit=200${unreadOnly ? '&unread=1' : ''}`, [unreadOnly])
  const { data, isLoading, mutate } = useSWR<InboxResp>(query, fetcher, { revalidateOnFocus: false })
  const list = data?.ok ? data.list : []

  const threads = useMemo(() => {
    const map = new Map<
      string,
      {
        chat_id: string
        first_name: string | null
        username: string | null
        last_text: string
        last_created_at: string
        unread_count: number
        messages: InboxRow[]
      }
    >()

    for (const row of list) {
      const existing = map.get(row.chat_id)
      if (!existing) {
        map.set(row.chat_id, {
          chat_id: row.chat_id,
          first_name: row.first_name,
          username: row.username,
          last_text: row.text,
          last_created_at: row.created_at,
          unread_count: row.is_read ? 0 : 1,
          messages: [row],
        })
      } else {
        existing.messages.push(row)
        if (!row.is_read) existing.unread_count += 1
      }
    }

    return Array.from(map.values())
      .map((t) => ({
        ...t,
        messages: t.messages.sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }))
      .sort((a, b) => b.last_created_at.localeCompare(a.last_created_at))
  }, [list])

  const totalUnread = useMemo(
    () => threads.reduce((acc, t) => acc + t.unread_count, 0),
    [threads],
  )
  const [selectedChatId, setSelectedChatId] = useState<string>('')
  const activeChatId = selectedChatId || threads[0]?.chat_id || ''
  const activeThread = threads.find((t) => t.chat_id === activeChatId) ?? null

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

  const markThreadRead = async (threadChatId: string, isRead: boolean) => {
    const target = threads.find((t) => t.chat_id === threadChatId)
    if (!target) return
    const ids = target.messages.map((m) => m.id)
    if (ids.length === 0) return
    const res = await fetch('/api/telegram/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, is_read: isRead }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      alert(`상태 변경 실패: ${json?.error ?? 'unknown error'}`)
      return
    }
    mutate()
  }

  const sendReply = async () => {
    if (!activeThread) return
    const message = replyInput.trim()
    if (!message) return alert('답장 메시지를 입력해주세요.')
    setLoadingReply(true)
    try {
      const res = await fetch('/api/telegram/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: activeThread.chat_id, message }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) {
        alert(`답장 실패: ${json?.error ?? 'unknown error'}`)
        return
      }
      setReplyInput('')
      if (activeThread.unread_count > 0) await markThreadRead(activeThread.chat_id, true)
      alert('답장을 보냈습니다.')
    } finally {
      setLoadingReply(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#c2410c]">Telegram 관리자 수신함</h1>
          <p className="text-sm text-gray-600">봇에 들어온 일반 메시지를 확인하고 답장할 수 있습니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-[#c2410c]">
            미읽음 {totalUnread}
          </span>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            안 읽은 메시지만 보기
          </label>
        </div>
      </div>

      {isLoading && <div className="rounded border bg-white p-4 text-sm text-gray-500">불러오는 중...</div>}
      {!isLoading && threads.length === 0 && (
        <div className="rounded border bg-white p-6 text-center text-gray-500">메시지가 없습니다.</div>
      )}

      {threads.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <div className="rounded-xl border bg-white p-2 shadow-sm">
            <ul className="space-y-1">
              {threads.map((t) => {
                const selected = t.chat_id === activeChatId
                return (
                  <li key={t.chat_id}>
                    <button
                      onClick={() => setSelectedChatId(t.chat_id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        selected
                          ? 'border-orange-300 bg-orange-50'
                          : 'border-transparent bg-white hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {t.first_name || '(이름 없음)'}
                          <span className="ml-2 text-xs font-normal text-gray-500">@{t.username || 'unknown'}</span>
                        </div>
                        {t.unread_count > 0 && (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                            {t.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-xs text-gray-600">{t.last_text}</div>
                      <div className="mt-1 text-[11px] text-gray-400">{formatKst(t.last_created_at)}</div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            {!activeThread ? (
              <div className="p-10 text-center text-sm text-gray-500">대화방을 선택해주세요.</div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between border-b pb-3">
                  <div className="text-sm">
                    <b>{activeThread.first_name || '(이름 없음)'}</b>
                    <span className="ml-2 text-gray-500">@{activeThread.username || 'unknown'}</span>
                    <span className="ml-2 text-gray-400">chat_id: {activeThread.chat_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeThread.unread_count > 0 && (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                        미읽음 {activeThread.unread_count}
                      </span>
                    )}
                    <button
                      onClick={() => markThreadRead(activeThread.chat_id, true)}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      전체 읽음 처리
                    </button>
                    <button
                      onClick={() => markThreadRead(activeThread.chat_id, false)}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      전체 미읽음
                    </button>
                  </div>
                </div>

                <ul className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                  {activeThread.messages.map((row) => (
                    <li key={row.id} className="rounded-lg border bg-gray-50 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            row.is_read ? 'bg-gray-200 text-gray-700' : 'bg-orange-200 text-[#9a3412]'
                          }`}
                        >
                          {row.is_read ? '읽음' : '미읽음'}
                        </span>
                        <span className="text-[11px] text-gray-400">{formatKst(row.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-gray-800">{row.text}</p>
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => markRead(row.id, !row.is_read)}
                          className="rounded border px-2 py-1 text-[11px] hover:bg-white"
                        >
                          {row.is_read ? '미읽음으로' : '읽음 처리'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 space-y-2 border-t pt-3">
                  <textarea
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    placeholder="답장 메시지 입력 (HTML 태그 가능)"
                    className="h-24 w-full resize-none rounded border p-2 text-sm"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={sendReply}
                      disabled={loadingReply}
                      className="rounded bg-[#ea580c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c2410c] disabled:opacity-60"
                    >
                      {loadingReply ? '전송 중...' : '답장 보내기'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
