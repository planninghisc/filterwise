// src/app/schedule/schedule.client.tsx
'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import koLocale from '@fullcalendar/core/locales/ko'
import { formatISO, startOfMonth, endOfMonth, addMonths } from 'date-fns'

type CalEvent = {
  id: string
  title: string
  start: string
  end?: string
  allDay?: boolean
}

type EditForm = {
  id?: string
  title: string
  allDay: boolean
  startInput: string // allDay: YYYY-MM-DD, timed: YYYY-MM-DDTHH:mm
  endInput: string   // same as above
}

type Range = { timeMin: string; timeMax: string }

// ---- FullCalendar 콜백에 쓰는 얕은 타입(버전 의존성 최소화) ----
type DatesSetInfo = { startStr: string; endStr: string }
type SelectInfo = { allDay: boolean; startStr: string; endStr: string }
type ClickInfo = {
  event: {
    id: string
    title: string
    allDay: boolean
    start: Date | null
    end: Date | null
    startStr?: string
    endStr?: string
  }
}
type ChangeInfo = {
  event: {
    id: string
    allDay: boolean
    start: Date | null
    end: Date | null
    startStr?: string
    endStr?: string
  }
}
type EventClassNamesInfo = { event: { allDay: boolean } }
type EventDidMountInfo = { el: HTMLElement }
type EventContentInfo = { event: { title?: string } }

// ---- helpers ----
function dateToLocalInput(dt: Date) {
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  const y = dt.getFullYear()
  const m = pad(dt.getMonth() + 1)
  const d = pad(dt.getDate())
  const hh = pad(dt.getHours())
  const mm = pad(dt.getMinutes())
  return `${y}-${m}-${d}T${hh}:${mm}`
}

function dateOnlyFromISO(iso: string) {
  if (iso.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso)
  return d.toISOString().slice(0, 10)
}

function shiftDateOnly(ymd: string, delta: number) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10))
  const dt = new Date(y, (m || 1) - 1, (d || 1) + delta)
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

// ✅ 종일 ↔ 시간 전환에 사용
function pad2(n: number) { return n < 10 ? '0' + n : '' + n }
function isDateOnlyStr(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) }
function datePart(s: string) { return s ? s.slice(0, 10) : '' }
function ymdToLocalDT(ymd: string, hour = 9, minute = 0) {
  if (!ymd) return ''
  return `${ymd}T${pad2(hour)}:${pad2(minute)}`
}

export default function ScheduleClient() {
  const sp = useSearchParams()
  const queryConnected = sp.get('connected') === '1'

  const [events, setEvents] = useState<CalEvent[]>([])
  const [range, setRange] = useState<Range>({
    timeMin: formatISO(startOfMonth(new Date())),
    timeMax: formatISO(endOfMonth(addMonths(new Date(), 1))),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState<boolean>(queryConnected)

  // modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<EditForm>({
    title: '',
    allDay: true,
    startInput: '',
    endInput: '',
  })

  // 🔒 모달 열릴 때 배경 스크롤 잠금
  useEffect(() => {
    if (modalOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [modalOpen])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({
        timeMin: range.timeMin,
        timeMax: range.timeMax,
      }).toString()

      const res = await fetch(`/api/calendar/events?${qs}`, { cache: 'no-store' })
      const json: { events?: unknown[] } = await res.json()
      if (!res.ok) throw new Error((json as { error?: string })?.error || 'Failed to load')

      type GoogleEvent = {
        id: string
        summary?: string
        start?: { dateTime?: string; date?: string }
        end?: { dateTime?: string; date?: string }
      }

      const mapped: CalEvent[] = (json.events as GoogleEvent[] | undefined)?.map((e) => ({
        id: e.id,
        title: e.summary ?? '',
        start: e.start?.dateTime || e.start?.date || '',
        end: e.end?.dateTime || e.end?.date || undefined,
        allDay: !!e.start?.date,
      })) ?? []

      setEvents(mapped)
      setConnected(true)
    } catch (err: unknown) {
      const msg =
        (err instanceof Error ? err.message : undefined) ||
        (typeof err === 'string' ? err : undefined) ||
        'Failed to load'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    load()
  }, [load])

  // 🔒 무한 업데이트 방지
  const handleDateSet = useCallback((arg: DatesSetInfo) => {
    const nextMin = arg.startStr
    const nextMax = arg.endStr
    setRange(prev =>
      (prev.timeMin === nextMin && prev.timeMax === nextMax)
        ? prev
        : { timeMin: nextMin, timeMax: nextMax }
    )
  }, [])

  // 새 이벤트 만들기 → 모달 열기
  const handleSelect = (info: SelectInfo) => {
    const isAllDay = !!info.allDay
    if (isAllDay) {
      const start = info.startStr.slice(0, 10)
      const endRaw = info.endStr ? info.endStr.slice(0, 10) : start // exclusive
      const endInclusive = shiftDateOnly(endRaw, -1)                 // inclusive로 보정
      setForm({
        id: undefined,
        title: '',
        allDay: true,
        startInput: start,
        endInput: endInclusive,
      })
    } else {
      const s = new Date(info.startStr)
      const e = info.endStr ? new Date(info.endStr) : new Date(s.getTime() + 60 * 60 * 1000)
      setForm({
        id: undefined,
        title: '',
        allDay: false,
        startInput: dateToLocalInput(s),
        endInput: dateToLocalInput(e),
      })
    }
    setModalOpen(true)
  }

  // 드래그/리사이즈 → 서버로 즉시 반영
  type PatchPayload = { allDay: boolean; start?: string; end?: string }

  const handleEventDropOrResize = async (changeInfo: ChangeInfo) => {
    const { event } = changeInfo
    const eid = encodeURIComponent(event.id)
    const payload: PatchPayload = { allDay: !!event.allDay }

    if (event.allDay) {
      const start = event.startStr ? event.startStr.slice(0, 10) : undefined
      const endRaw = event.endStr ? event.endStr.slice(0, 10) : start // exclusive
      const endInclusive = endRaw ? shiftDateOnly(endRaw, -1) : undefined
      if (start) payload.start = start
      if (endInclusive) payload.end = endInclusive
    } else {
      if (event.start) payload.start = event.start.toISOString()
      if (event.end) payload.end = event.end.toISOString()
    }

    const res = await fetch(`/api/calendar/events/${eid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) alert('수정 실패: ' + (j?.error || res.statusText))
    load()
  }

  // 이벤트 클릭 → 편집 모달
  const handleEventClick = (clickInfo: ClickInfo) => {
    const e = clickInfo.event
    const isAllDay = !!e.allDay
    if (isAllDay) {
      const start = e.startStr ? e.startStr.slice(0, 10) : (e.start ? dateOnlyFromISO(e.start.toISOString()) : '')
      const endRaw = e.endStr ? e.endStr.slice(0, 10) : (e.end ? dateOnlyFromISO(e.end.toISOString()) : start) // exclusive
      const endInclusive = endRaw ? shiftDateOnly(endRaw, -1) : ''
      setForm({
        id: e.id,
        title: e.title || '',
        allDay: true,
        startInput: start,
        endInput: endInclusive,
      })
    } else {
      setForm({
        id: e.id,
        title: e.title || '',
        allDay: false,
        startInput: e.start ? dateToLocalInput(e.start) : '',
        endInput: e.end ? dateToLocalInput(e.end) : (e.start ? dateToLocalInput(new Date(e.start.getTime() + 60 * 60 * 1000)) : ''),
      })
    }
    setModalOpen(true)
  }

  // ---- modal actions ----
  const onChangeField = (patch: Partial<EditForm>) => setForm(prev => ({ ...prev, ...patch }))

  const onSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    const allDay = form.allDay
    const hasId = !!form.id

    try {
      if (!form.title || !form.startInput) {
        alert('제목과 시작은 필수입니다.')
        return
      }

      if (hasId) {
        const eid = encodeURIComponent(form.id!)
        const payload: { title: string; allDay: boolean; start: string; end: string } = {
          title: form.title,
          allDay,
          start: '',
          end: '',
        }
        if (allDay) {
          payload.start = form.startInput
          payload.end = form.endInput || form.startInput
        } else {
          const s = new Date(form.startInput)
          const end = form.endInput ? new Date(form.endInput) : new Date(s.getTime() + 60 * 60 * 1000)
          payload.start = s.toISOString()
          payload.end = end.toISOString()
        }
        const res = await fetch(`/api/calendar/events/${eid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const j: { error?: string } = await res.json().catch(() => ({} as { error?: string }))
        if (!res.ok) throw new Error(j?.error || res.statusText)
      } else {
        const payload: { title: string; allDay: boolean; start: string; end: string } = {
          title: form.title,
          allDay,
          start: '',
          end: '',
        }
        if (allDay) {
          payload.start = form.startInput
          payload.end = form.endInput || form.startInput
        } else {
          const s = new Date(form.startInput)
          const end = form.endInput ? new Date(form.endInput) : new Date(s.getTime() + 60 * 60 * 1000)
          payload.start = s.toISOString()
          payload.end = end.toISOString()
        }
        const res = await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const j: { error?: string } = await res.json().catch(() => ({} as { error?: string }))
        if (!res.ok) throw new Error(j?.error || res.statusText)
      }

      setModalOpen(false)
      load()
    } catch (err: unknown) {
      const msg =
        (err instanceof Error ? err.message : undefined) ||
        (typeof err === 'string' ? err : undefined) ||
        'unknown'
      alert('저장 실패: ' + msg)
    }
  }

  const onDelete = async () => {
    if (!form.id) return
    if (!confirm('정말 삭제할까요?')) return
    const eid = encodeURIComponent(form.id)
    const res = await fetch(`/api/calendar/events/${eid}`, { method: 'DELETE' })
    const j: { error?: string } = await res.json().catch(() => ({} as { error?: string }))
    if (!res.ok) {
      alert('삭제 실패: ' + (j?.error || res.statusText))
      return
    }
    setModalOpen(false)
    load()
  }

  // 버튼: 연결됨 → 연한 주황(orange-400)
  const connectBtnClass = useMemo(
    () =>
      [
        'px-3 py-1 rounded-lg border transition',
        connected
          ? 'bg-orange-400 text-white border-orange-400 hover:bg-orange-500'
          : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50',
      ].join(' '),
    [connected]
  )

  // 이벤트에 클래스 붙여서 색상 분기: all-day vs timed
  const eventClassNames = useCallback((arg: EventClassNamesInfo) => {
    return [arg.event.allDay ? 'fc-all-day' : 'fc-timed']
  }, [])

  return (
    <div className="p-4">
      {/* 전역 스타일: 색상 분기 + 반응형 + 레이어링 */}
      <style jsx global>{`
        .fc { --fc-small-font-size: 0.85rem; }
        .fc .fc-event-title,
        .fc .fc-event-time { 
          overflow: hidden; 
          white-space: nowrap; 
          text-overflow: ellipsis; 
        }
        .fc .fc-event-time { display: none !important; }

        .fc .fc-event.fc-all-day {
          background-color: #fb923c !important;
          border-color: #fb923c !important;
          color: #ffffff !important;
        }
        .fc .fc-event.fc-timed {
          background-color: #fed7aa !important;
          border-color: #fed7aa !important;
          color: #1f2937 !important;
        }

        @media (max-width: 640px) {
          .fc .fc-toolbar-title { font-size: 1rem; }
          .fc .fc-button { padding: 0.25rem 0.4rem; font-size: 0.75rem; }
          .fc .fc-col-header-cell-cushion { font-size: 0.75rem; }
          .fc .fc-daygrid-day-number { font-size: 0.75rem; }
          .fc .fc-event { font-size: 0.75rem; }
        }
        @media (max-width: 480px) {
          .fc .fc-toolbar-title { font-size: 0.95rem; }
          .fc .fc-button { padding: 0.2rem 0.35rem; font-size: 0.7rem; }
          .fc .fc-col-header-cell-cushion { font-size: 0.7rem; }
          .fc .fc-daygrid-day-number { font-size: 0.7rem; }
          .fc .fc-event { font-size: 0.7rem; }
        }
        @media (max-width: 360px) {
          .fc .fc-toolbar-title { font-size: 0.9rem; }
          .fc .fc-button { padding: 0.18rem 0.3rem; font-size: 0.65rem; }
          .fc .fc-col-header-cell-cushion { font-size: 0.65rem; }
          .fc .fc-daygrid-day-number { font-size: 0.65rem; }
          .fc .fc-event { font-size: 0.65rem; }
        }
      `}</style>

      <div className="mb-3 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Schedule</h1>

        <a href="/api/google/oauth/start" className={connectBtnClass}>
          {connected ? 'Connected (Google)' : 'Connect Google'}
        </a>

        {loading && <span className="text-sm opacity-70">불러오는 중…</span>}
        {error && <span className="text-sm text-red-500">에러: {error}</span>}
      </div>

      <div className="relative z-0">
        <FullCalendar
          locales={[koLocale]}
          locale="ko"
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          height="80vh"
          selectable
          selectMirror
          editable
          dayMaxEventRows={true}
          moreLinkText={(n: number) => `+${n}개`}
          datesSet={handleDateSet}
          select={handleSelect}
          eventDrop={handleEventDropOrResize}
          eventResize={handleEventDropOrResize}
          eventClick={handleEventClick}
          events={events}
          eventClassNames={eventClassNames}
          eventDidMount={(info: EventDidMountInfo) => {
            if (info.el) info.el.style.cursor = 'pointer'
          }}
          eventContent={(arg: EventContentInfo) => {
            const title = arg.event.title || ''
            return { html: `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</div>` }
          }}
        />
      </div>

      {/* ---- Modal ---- */}
      {modalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-[1000]"
            onClick={() => setModalOpen(false)}
          />
          <div className="fixed inset-0 flex items-center justify-center p-4 z-[1010]">
            <form
              onSubmit={onSubmitForm}
              className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border p-4 space-y-4 relative"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {form.id ? '일정 편집' : '새 일정'}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-2 py-1 text-sm rounded border hover:bg-gray-50"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>

              <label className="block">
                <span className="block text-sm font-medium mb-1">제목</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => onChangeField({ title: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="제목을 입력하세요"
                  required
                />
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={(e) => {
                    const nextAllDay = e.target.checked
                    if (!nextAllDay) {
                      // 종일 → 시간
                      const startYmd =
                        isDateOnlyStr(form.startInput) ? form.startInput : datePart(form.startInput)
                      const endYmd =
                        isDateOnlyStr(form.endInput)
                          ? form.endInput
                          : (form.endInput ? datePart(form.endInput) : startYmd)

                      const startDT = ymdToLocalDT(startYmd, 9, 0)
                      const endDT = ymdToLocalDT(endYmd || startYmd, 10, 0)

                      setForm(prev => ({
                        ...prev,
                        allDay: false,
                        startInput: startDT,
                        endInput: endDT,
                      }))
                    } else {
                      // 시간 → 종일
                      const startYmd = datePart(form.startInput)
                      const endYmd = form.endInput ? datePart(form.endInput) : startYmd
                      setForm(prev => ({
                        ...prev,
                        allDay: true,
                        startInput: startYmd,
                        endInput: endYmd,
                      }))
                    }
                  }}
                />
                <span className="text-sm">종일</span>
              </label>

              {form.allDay ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-sm font-medium mb-1">시작(날짜)</span>
                    <input
                      type="date"
                      value={form.startInput}
                      onChange={(e) => onChangeField({ startInput: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium mb-1">종료(날짜)</span>
                    <input
                      type="date"
                      value={form.endInput}
                      onChange={(e) => onChangeField({ endInput: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-sm font-medium mb-1">시작(시간)</span>
                    <input
                      type="datetime-local"
                      value={form.startInput}
                      onChange={(e) => onChangeField({ startInput: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="block text sm font-medium mb-1">종료(시간)</span>
                    <input
                      type="datetime-local"
                      value={form.endInput}
                      onChange={(e) => onChangeField({ endInput: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                {form.id ? (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm"
                  >
                    삭제
                  </button>
                ) : <span />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-lg bg-orange-400 hover:bg-orange-500 text-white text-sm"
                  >
                    저장
                  </button>
                </div>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
