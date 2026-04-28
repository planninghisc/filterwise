// src/app/api/telegram/webhook/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const DEFAULT_START_MESSAGE = `
🎉 <b>환영합니다! 뉴스 알림 구독이 완료되었습니다.</b>

뉴스 알림봇은 두 가지 기능을 제공합니다.

<b>📌 ① 매일 오후 5시 오늘의 뉴스 브리핑</b>
당일 기준 "한화투자증권" 관련 모든 뉴스 및 주가

<b>📌 ② 등록 키워드를 통한 실시간 알림</b>
등록된 뉴스 키워드에 맞춰 ⏰5분마다 최신 소식을 전해드립니다.

💡 현재 등록 키워드
전산장애,전산오류,장애,오류,민원,소송,금융감독원,금감원

키워드 등록이 필요한 경우 관리자에게 연락해주세요.

알림을 끄고 싶으시면 <code>/stop</code>을 입력해주세요.
`.trim()

async function sendMessage(chatId: string, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

function normalizeCommand(text: string): '/start' | '/stop' | null {
  const raw = text.trim().split(/\s+/)[0] ?? ''
  const cmd = raw.toLowerCase()
  if (cmd === '/start' || cmd.startsWith('/start@')) return '/start'
  if (cmd === '/stop' || cmd.startsWith('/stop@')) return '/stop'
  return null
}

function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function getStartMessageTemplate() {
  const { data, error } = await supabaseAdmin
    .from('telegram_bot_settings')
    .select('start_message_template')
    .eq('id', 'default')
    .maybeSingle()
  if (error) {
    console.error('[telegram webhook] read start message template failed:', error)
    return DEFAULT_START_MESSAGE
  }
  const text = String(data?.start_message_template ?? '').trim()
  return text || DEFAULT_START_MESSAGE
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    has_bot_token: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    has_supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    has_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  })
}

export async function POST(request: Request) {
  try {
    const update = await request.json()
    console.log('[telegram webhook] incoming update:', {
      update_id: update?.update_id,
      has_message: Boolean(update?.message),
      text: update?.message?.text ?? null,
      chat_id: update?.message?.chat?.id ?? null,
    })
    if (!update.message) return NextResponse.json({ ok: true })

    const { chat, text, caption, from } = update.message
    const chatId = chat.id.toString()
    const textValue = toText(text) ?? toText(caption)
    const command = textValue ? normalizeCommand(textValue) : null

    // 1. /start 명령어가 오면 구독자로 등록
    if (command === '/start') {
      const { error } = await supabaseAdmin
        .from('telegram_subscribers')
        .upsert({
          chat_id: chatId,
          first_name: from.first_name,
          username: from.username,
          is_active: true
        })

      if (error) {
        console.error('[telegram webhook] subscribe upsert failed:', error)
        await sendMessage(chatId, '⚠️ 구독 처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.')
      } else {
        const startMessage = await getStartMessageTemplate()
        await sendMessage(chatId, startMessage)
      }
    } 
    // 2. /stop 명령어가 오면 구독 정지
    else if (command === '/stop') {
      const { error } = await supabaseAdmin
        .from('telegram_subscribers')
        .update({ is_active: false })
        .eq('chat_id', chatId)

      if (error) {
        console.error('[telegram webhook] unsubscribe update failed:', error)
        await sendMessage(chatId, '⚠️ 알림 중지 처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.')
      } else {
        await sendMessage(chatId, '🔕 <b>알림이 중지되었습니다.</b>\n다시 받으려면 <code>/start</code>를 입력하세요.')
      }
    }
    // 3. 일반 메시지는 관리자 수신함에 저장
    else if (textValue) {
      const { error } = await supabaseAdmin.from('telegram_inbox').insert({
        chat_id: chatId,
        first_name: from?.first_name ?? null,
        username: from?.username ?? null,
        text: textValue,
        is_read: false,
      })
      if (error) {
        console.error('[telegram webhook] inbox insert failed:', error)
        await sendMessage(chatId, '⚠️ 관리자 전달 저장에 실패했습니다. 잠시 후 다시 시도해주세요.')
      } else {
        await sendMessage(chatId, '📩 메시지 확인했습니다. 관리자에게 전달할게요.')
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}