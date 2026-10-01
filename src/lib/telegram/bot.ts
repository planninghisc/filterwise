// src/lib/telegram/bot.ts
// 텔레그램 봇 API 호출 + 개인 알림 키워드 명령어 (/add /list /del /help)
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { alertConditionOf } from '@/lib/news/keywords'

export const MAX_PERSONAL_KEYWORDS = 5
export const MAX_KEYWORD_LENGTH = 50

/** 텔레그램 입력창 `/` 메뉴에 노출할 명령어 (webhook-setup 에서 setMyCommands 로 등록) */
export const BOT_COMMANDS = [
  { command: 'add', description: '내 알림 키워드 추가 (예: /add IPO, 상장)' },
  { command: 'list', description: '내 알림 키워드 보기·삭제' },
  { command: 'del', description: '내 알림 키워드 삭제 (예: /del 1)' },
  { command: 'help', description: '사용법' },
  { command: 'start', description: '알림 구독 시작' },
  { command: 'stop', description: '알림 구독 중지' },
]

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }

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

export async function sendMessage(chatId: string, text: string, replyMarkup?: InlineKeyboard) {
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

<code>/add IPO</code> — 키워드 추가
<code>/add IPO, 상장</code> — 둘 중 하나라도 있으면 알림 (OR)
<code>/add 리테일 수수료</code> — 둘 다 있어야 알림 (AND)
<code>/list</code> — 내 키워드 보기·삭제
<code>/del 1</code> — 1번 키워드 삭제

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

async function isActiveSubscriber(chatId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('telegram_subscribers')
    .select('is_active')
    .eq('chat_id', chatId)
    .maybeSingle()
  return Boolean(data?.is_active)
}

/** /list 응답 본문 + 삭제 버튼 */
async function renderList(chatId: string): Promise<{ text: string; markup?: InlineKeyboard }> {
  const [common, personal] = await Promise.all([listCommon(), listPersonal(chatId)])

  const lines = ['📋 <b>내 알림 키워드</b>', '']
  if (personal.length === 0) {
    lines.push('등록된 키워드가 없습니다.', '<code>/add 키워드</code> 로 추가해 보세요.')
  } else {
    personal.forEach((k, i) => lines.push(`${i + 1}. ${htmlEscape(k.keyword)}`))
    lines.push('', `(${personal.length}/${MAX_PERSONAL_KEYWORDS}) 아래 버튼으로 삭제할 수 있습니다.`)
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

async function handleAdd(chatId: string, args: string) {
  const keyword = args.replace(/\s+/g, ' ').trim()
  if (!keyword) {
    await sendMessage(chatId, '추가할 키워드를 함께 입력해 주세요.\n예: <code>/add IPO, 상장</code>')
    return
  }
  if (keyword.length > MAX_KEYWORD_LENGTH) {
    await sendMessage(chatId, `⚠️ 키워드는 ${MAX_KEYWORD_LENGTH}자 이내로 입력해 주세요.`)
    return
  }
  if (!(await isActiveSubscriber(chatId))) {
    await sendMessage(chatId, '먼저 <code>/start</code> 로 알림을 구독해 주세요.')
    return
  }

  const personal = await listPersonal(chatId)
  if (personal.some((k) => k.keyword === keyword)) {
    await sendMessage(chatId, `이미 등록된 키워드입니다: <b>${htmlEscape(keyword)}</b>`)
    return
  }
  if (personal.length >= MAX_PERSONAL_KEYWORDS) {
    await sendMessage(
      chatId,
      `⚠️ 키워드는 최대 ${MAX_PERSONAL_KEYWORDS}개까지 등록할 수 있습니다.\n<code>/list</code> 에서 기존 키워드를 삭제한 뒤 추가해 주세요.`,
    )
    return
  }

  const { error } = await supabaseAdmin.from('chat_alert_keywords').insert({ chat_id: chatId, keyword })
  if (error) {
    console.error('[telegram bot] add keyword failed:', error)
    await sendMessage(chatId, '⚠️ 키워드 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    return
  }
  await sendMessage(
    chatId,
    `✅ <b>${htmlEscape(keyword)}</b> 등록했습니다. (${personal.length + 1}/${MAX_PERSONAL_KEYWORDS})\n한화투자증권 기사 중 이 키워드가 들어가면 알려드릴게요.`,
  )
}

async function handleDelByIndex(chatId: string, args: string) {
  const n = Number(args.trim())
  const personal = await listPersonal(chatId)
  const target = Number.isInteger(n) && n >= 1 ? personal[n - 1] : undefined
  if (!target) {
    const { text, markup } = await renderList(chatId)
    await sendMessage(chatId, `삭제할 번호를 확인해 주세요. 예: <code>/del 1</code>\n\n${text}`, markup)
    return
  }
  await deleteById(chatId, target.id)
  await sendMessage(chatId, `🗑 <b>${htmlEscape(target.keyword)}</b> 삭제했습니다.`)
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

/** 개인 키워드 명령어면 처리하고 true, 아니면 false */
export async function handleKeywordCommand(chatId: string, cmd: string, args: string): Promise<boolean> {
  switch (cmd) {
    case '/add':
      await handleAdd(chatId, args)
      return true
    case '/list': {
      const { text, markup } = await renderList(chatId)
      await sendMessage(chatId, text, markup)
      return true
    }
    case '/del':
      await handleDelByIndex(chatId, args)
      return true
    case '/help':
      await sendMessage(chatId, HELP_TEXT)
      return true
    default:
      return false
  }
}

/** /list 의 🗑 버튼 처리 */
export async function handleCallbackQuery(query: {
  id: string
  data?: string
  message?: { chat?: { id?: number | string }; message_id?: number }
}) {
  const chatId = query.message?.chat?.id != null ? String(query.message.chat.id) : null
  const data = query.data ?? ''
  if (!chatId || !data.startsWith('del:')) {
    await callTelegram('answerCallbackQuery', { callback_query_id: query.id })
    return
  }

  const deleted = await deleteById(chatId, data.slice(4))
  await callTelegram('answerCallbackQuery', {
    callback_query_id: query.id,
    text: deleted ? `삭제했습니다: ${deleted}` : '이미 삭제된 키워드입니다.',
  })

  const { text, markup } = await renderList(chatId)
  await callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: query.message?.message_id,
    text,
    parse_mode: 'HTML',
    reply_markup: markup ?? { inline_keyboard: [] },
  })
}
