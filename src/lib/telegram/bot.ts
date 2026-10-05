// src/lib/telegram/bot.ts
// 텔레그램 봇 API 호출 + 개인 알림 키워드 (하단 메뉴 버튼 / 명령어)
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { alertConditionOf } from '@/lib/news/keywords'

export const MAX_PERSONAL_KEYWORDS = 5
export const MAX_KEYWORD_LENGTH = 50
/** "➕ 키워드 추가" 후 이 시간 안에 보낸 글은 키워드로 처리 (그 뒤엔 관리자 수신함으로) */
const PENDING_ADD_TTL_MS = 2 * 60 * 1000

/** 텔레그램 입력창 `/` 메뉴에 노출할 명령어 (webhook-setup 에서 setMyCommands 로 등록) */
export const BOT_COMMANDS = [
  { command: 'add', description: '내 알림 키워드 추가' },
  { command: 'list', description: '내 알림 키워드 보기·삭제' },
  { command: 'night', description: '야간 알림 설정 (밤에는 모아서 아침에)' },
  { command: 'help', description: '사용법' },
  { command: 'start', description: '알림 구독 시작' },
  { command: 'stop', description: '알림 구독 중지' },
]

const MENU_ADD = '➕ 키워드 추가'
const MENU_LIST = '📋 내 키워드'
const MENU_HELP = '❓ 사용법'
const MENU_NIGHT = '🌙 야간 알림'

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
type ReplyMarkup =
  | InlineKeyboard
  | { keyboard: Array<Array<{ text: string }>>; resize_keyboard?: boolean; is_persistent?: boolean }
  | { force_reply: true; input_field_placeholder?: string }
  | { remove_keyboard: true }

/** 채팅창 하단 고정 메뉴 버튼 */
export const MAIN_MENU: ReplyMarkup = {
  keyboard: [
    [{ text: MENU_ADD }, { text: MENU_LIST }],
    [{ text: MENU_NIGHT }, { text: MENU_HELP }],
  ],
  resize_keyboard: true,
  is_persistent: true,
}
export const REMOVE_MENU: ReplyMarkup = { remove_keyboard: true }

function api(method: string) {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`
}

export async function callTelegram(method: string, body: Record<string, unknown>) {
  const res = await fetch(api(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))
}

export async function sendMessage(chatId: string, text: string, replyMarkup?: ReplyMarkup) {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
}

export function htmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** "/add@BotName IPO, 상장" → { cmd: '/add', args: 'IPO, 상장' } */
export function parseCommand(text: string): { cmd: string; args: string } | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const head = trimmed.split(/\s+/)[0]
  return { cmd: head.toLowerCase().split('@')[0], args: trimmed.slice(head.length).trim() }
}

const HELP_TEXT = `
📖 <b>내 알림 키워드 사용법</b>

한화투자증권 관련 기사 중 내가 등록한 단어가 들어간 기사를 실시간으로 보내드립니다.

<b>${MENU_ADD}</b>
채팅창 아래 버튼을 누른 뒤 원하는 단어를 입력해 보내주세요.
• <code>IPO</code> — 이 단어가 있으면 알림
• <code>IPO, 상장</code> — 둘 중 하나라도 있으면 알림
• <code>리테일 수수료</code> — 둘 다 있어야 알림

<b>${MENU_LIST}</b>
등록한 키워드를 보고 🗑 버튼으로 삭제할 수 있습니다.

<b>${MENU_NIGHT}</b>
켜면 밤 11시~아침 6시에는 키워드 알림을 보내지 않고, 아침 6시에 밤사이 기사를 한 번에 보내드립니다.

키워드는 최대 ${MAX_PERSONAL_KEYWORDS}개까지 등록할 수 있습니다.
`.trim()

type ChatKeyword = { id: string; keyword: string }

async function listPersonal(chatId: string): Promise<ChatKeyword[]> {
  const { data, error } = await supabaseAdmin
    .from('chat_alert_keywords')
    .select('id, keyword')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ChatKeyword[]
}

async function listCommon(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from('alert_keywords').select('keyword, alert_filter')
  if (error) throw error
  return Array.from(new Set((data ?? []).map(alertConditionOf).filter(Boolean)))
}

async function getSubscriber(chatId: string) {
  const { data } = await supabaseAdmin
    .from('telegram_subscribers')
    .select('is_active, pending_action, pending_action_at, night_mode')
    .eq('chat_id', chatId)
    .maybeSingle()
  return data as {
    is_active: boolean
    pending_action: string | null
    pending_action_at: string | null
    night_mode: boolean | null
  } | null
}

/** 야간 알림 설정 화면 본문 + 켜기/끄기 버튼 */
function renderNight(on: boolean): { text: string; markup: InlineKeyboard } {
  const text = [
    `🌙 <b>야간 알림 설정</b>`,
    '',
    `현재: <b>${on ? '켜짐 — 밤에는 모아서 아침 6시에 받기' : '꺼짐 — 밤에도 바로 받기'}</b>`,
    '',
    '켜면 밤 11시~아침 6시에 걸린 키워드 기사를 바로 보내지 않고, 아침 6시에 한 번에 모아서 보내드립니다.',
    '(오후 5시 뉴스 브리핑은 그대로 받습니다)',
  ].join('\n')
  const markup = {
    inline_keyboard: [[on ? { text: '🔔 끄기 (밤에도 바로 받기)', callback_data: 'night:off' } : { text: '🌙 켜기 (아침에 모아 받기)', callback_data: 'night:on' }]],
  }
  return { text, markup }
}

async function sendNightSettings(chatId: string) {
  const sub = await getSubscriber(chatId)
  if (!sub?.is_active) {
    await sendMessage(chatId, '먼저 <code>/start</code> 로 알림을 구독해 주세요.')
    return
  }
  const { text, markup } = renderNight(Boolean(sub.night_mode))
  await sendMessage(chatId, text, markup)
}

async function setPending(chatId: string, action: 'add' | null) {
  const { error } = await supabaseAdmin
    .from('telegram_subscribers')
    .update({ pending_action: action, pending_action_at: action ? new Date().toISOString() : null })
    .eq('chat_id', chatId)
  if (error) console.error('[telegram bot] set pending failed:', error)
}

/** 내 키워드 목록 본문 + 삭제 버튼 */
async function renderList(chatId: string): Promise<{ text: string; markup?: InlineKeyboard }> {
  const [common, personal] = await Promise.all([listCommon(), listPersonal(chatId)])

  const lines = ['📋 <b>내 알림 키워드</b>', '']
  if (personal.length === 0) {
    lines.push('등록된 키워드가 없습니다.', `채팅창 아래 <b>${MENU_ADD}</b> 버튼을 눌러 추가해 보세요.`)
  } else {
    personal.forEach((k, i) => lines.push(`${i + 1}. ${htmlEscape(k.keyword)}`))
    lines.push('', `(${personal.length}/${MAX_PERSONAL_KEYWORDS}) 아래 🗑 버튼을 누르면 삭제됩니다.`)
  }
  if (common.length > 0) {
    lines.push('', '📢 <b>공용 키워드</b> (모든 구독자, 삭제 불가)')
    common.forEach((c) => lines.push(`• ${htmlEscape(c)}`))
  }

  const markup =
    personal.length > 0
      ? {
          inline_keyboard: personal.map((k, i) => [
            { text: `🗑 ${i + 1}. ${k.keyword}`.slice(0, 60), callback_data: `del:${k.id}` },
          ]),
        }
      : undefined
  return { text: lines.join('\n'), markup }
}

async function sendLimitReached(chatId: string) {
  await sendMessage(
    chatId,
    `⚠️ 키워드는 최대 ${MAX_PERSONAL_KEYWORDS}개까지 등록할 수 있습니다.\n<b>${MENU_LIST}</b> 에서 기존 키워드를 삭제한 뒤 추가해 주세요.`,
    MAIN_MENU,
  )
}

async function startAddFlow(chatId: string) {
  const sub = await getSubscriber(chatId)
  if (!sub?.is_active) {
    await sendMessage(chatId, '먼저 <code>/start</code> 로 알림을 구독해 주세요.')
    return
  }
  const personal = await listPersonal(chatId)
  if (personal.length >= MAX_PERSONAL_KEYWORDS) {
    await sendLimitReached(chatId)
    return
  }
  await setPending(chatId, 'add')
  // force_reply: 입력창이 이 메시지에 대한 답장 모드로 바로 열린다
  await sendMessage(
    chatId,
    [
      `➕ <b>키워드 추가</b> (${personal.length}/${MAX_PERSONAL_KEYWORDS})`,
      '',
      '추가할 키워드를 입력해 보내주세요.',
      '예: <code>IPO</code>  /  <code>IPO, 상장</code> (둘 중 하나라도 있으면 알림)',
    ].join('\n'),
    { force_reply: true, input_field_placeholder: '예: IPO' },
  )
}

/** 키워드 등록. 성공하면 true */
async function handleAdd(chatId: string, raw: string): Promise<boolean> {
  const keyword = raw.replace(/\s+/g, ' ').trim()
  if (!keyword) {
    await startAddFlow(chatId)
    return false
  }
  if (keyword.length > MAX_KEYWORD_LENGTH) {
    await sendMessage(chatId, `⚠️ 키워드는 ${MAX_KEYWORD_LENGTH}자 이내로 입력해 주세요.`, MAIN_MENU)
    return false
  }
  const sub = await getSubscriber(chatId)
  if (!sub?.is_active) {
    await sendMessage(chatId, '먼저 <code>/start</code> 로 알림을 구독해 주세요.')
    return false
  }

  const personal = await listPersonal(chatId)
  if (personal.some((k) => k.keyword === keyword)) {
    await sendMessage(chatId, `이미 등록된 키워드입니다: <b>${htmlEscape(keyword)}</b>`, MAIN_MENU)
    return false
  }
  if (personal.length >= MAX_PERSONAL_KEYWORDS) {
    await sendLimitReached(chatId)
    return false
  }

  const { error } = await supabaseAdmin.from('chat_alert_keywords').insert({ chat_id: chatId, keyword })
  if (error) {
    console.error('[telegram bot] add keyword failed:', error)
    await sendMessage(chatId, '⚠️ 키워드 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.', MAIN_MENU)
    return false
  }
  await sendMessage(
    chatId,
    `✅ <b>${htmlEscape(keyword)}</b> 등록했습니다. (${personal.length + 1}/${MAX_PERSONAL_KEYWORDS})\n한화투자증권 기사 중 이 키워드가 들어가면 알려드릴게요.`,
    MAIN_MENU,
  )
  return true
}

async function handleDelByIndex(chatId: string, args: string) {
  const n = Number(args.trim())
  const personal = await listPersonal(chatId)
  const target = Number.isInteger(n) && n >= 1 ? personal[n - 1] : undefined
  if (!target) {
    const { text, markup } = await renderList(chatId)
    await sendMessage(chatId, text, markup)
    return
  }
  await deleteById(chatId, target.id)
  await sendMessage(chatId, `🗑 <b>${htmlEscape(target.keyword)}</b> 삭제했습니다.`, MAIN_MENU)
}

async function deleteById(chatId: string, id: string) {
  const { data, error } = await supabaseAdmin
    .from('chat_alert_keywords')
    .delete()
    .eq('id', id)
    .eq('chat_id', chatId)
    .select('keyword')
  if (error) throw error
  return (data?.[0]?.keyword as string | undefined) ?? null
}

async function sendList(chatId: string) {
  const { text, markup } = await renderList(chatId)
  await sendMessage(chatId, text, markup)
}

/** 개인 키워드 명령어면 처리하고 true, 아니면 false */
export async function handleKeywordCommand(chatId: string, cmd: string, args: string): Promise<boolean> {
  switch (cmd) {
    case '/add':
      if (args) await handleAdd(chatId, args)
      else await startAddFlow(chatId)
      return true
    case '/list':
      await setPending(chatId, null)
      await sendList(chatId)
      return true
    case '/del':
      await setPending(chatId, null)
      await handleDelByIndex(chatId, args)
      return true
    case '/night':
      await setPending(chatId, null)
      await sendNightSettings(chatId)
      return true
    case '/help':
      await setPending(chatId, null)
      await sendMessage(chatId, HELP_TEXT, MAIN_MENU)
      return true
    default:
      return false
  }
}

/**
 * 명령어가 아닌 일반 글 처리: 하단 메뉴 버튼, 또는 "➕ 키워드 추가" 직후 입력한 키워드.
 * 처리했으면 true (false 면 관리자 수신함으로 보낸다)
 */
export async function handleKeywordText(chatId: string, text: string): Promise<boolean> {
  const t = text.trim()
  if (t === MENU_ADD) {
    await startAddFlow(chatId)
    return true
  }
  if (t === MENU_LIST) {
    await setPending(chatId, null)
    await sendList(chatId)
    return true
  }
  if (t === MENU_NIGHT) {
    await setPending(chatId, null)
    await sendNightSettings(chatId)
    return true
  }
  if (t === MENU_HELP) {
    await setPending(chatId, null)
    await sendMessage(chatId, HELP_TEXT, MAIN_MENU)
    return true
  }

  const sub = await getSubscriber(chatId)
  const pendingAt = sub?.pending_action_at ? new Date(sub.pending_action_at).getTime() : 0
  if (sub?.pending_action === 'add' && Date.now() - pendingAt < PENDING_ADD_TTL_MS) {
    await setPending(chatId, null)
    await handleAdd(chatId, t)
    return true
  }
  return false
}

/** /stop 등에서 추가 대기 상태 해제 */
export async function clearPending(chatId: string) {
  await setPending(chatId, null)
}

/** 인라인 버튼 처리: 내 키워드 목록의 🗑 삭제 / 야간 알림 켜기·끄기 */
export async function handleCallbackQuery(query: {
  id: string
  data?: string
  message?: { chat?: { id?: number | string }; message_id?: number }
}) {
  const chatId = query.message?.chat?.id != null ? String(query.message.chat.id) : null
  const messageId = query.message?.message_id
  const data = query.data ?? ''
  const answer = (text?: string) =>
    callTelegram('answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) })
  const editMessage = (text: string, markup?: InlineKeyboard) =>
    callTelegram('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: markup ?? { inline_keyboard: [] },
    })

  if (!chatId) {
    await answer()
    return
  }

  if (data === 'night:on' || data === 'night:off') {
    const on = data === 'night:on'
    const { error } = await supabaseAdmin.from('telegram_subscribers').update({ night_mode: on }).eq('chat_id', chatId)
    if (error) {
      console.error('[telegram bot] night mode update failed:', error)
      await answer('설정을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    await answer(on ? '야간 알림을 아침에 모아 받습니다.' : '밤에도 바로 받습니다.')
    const { text, markup } = renderNight(on)
    await editMessage(text, markup)
    return
  }

  if (data.startsWith('del:')) {
    const deleted = await deleteById(chatId, data.slice(4))
    await answer(deleted ? `삭제했습니다: ${deleted}` : '이미 삭제된 키워드입니다.')
    const { text, markup } = await renderList(chatId)
    await editMessage(text, markup)
    return
  }

  await answer()
}
