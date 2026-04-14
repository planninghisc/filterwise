// src/app/api/telegram/test-broadcast/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    // 1. 활성 구독자 목록 가져오기
    const { data: subscribers } = await supabase
      .from('telegram_subscribers')
      .select('chat_id, first_name')
      .eq('is_active', true)

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ error: '구독자가 없습니다.' }, { status: 404 })
    }

    const token = process.env.TELEGRAM_BOT_TOKEN
    let successCount = 0

    // 2. 전체 발송
    const promises = subscribers.map(async (sub) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: sub.chat_id,
            text: `📢 <b>[업데이트 공지]</b>\n\n안녕하세요 ${sub.first_name || '구독자'}님!\n관리자가 보낸 테스트 메시지가 정상 수신되었습니다.`,
            parse_mode: 'HTML',
          }),
        })
        if (res.ok) successCount++
      } catch (e) {
        console.error(`Send failed to ${sub.chat_id}`, e)
      }
    })

    await Promise.all(promises)

    return NextResponse.json({ 
      success: true, 
      total: subscribers.length, 
      sent: successCount 
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}