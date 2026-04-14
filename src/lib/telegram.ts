// src/lib/telegram.ts

export async function sendTelegramMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.error('Telegram env vars missing')
    return
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML', // HTML 태그 사용 가능
      }),
    })

    if (!res.ok) {
      console.error('Telegram send failed:', await res.text())
    }
  } catch (error) {
    console.error('Telegram fetch error:', error)
  }
}