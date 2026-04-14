//src\app\api\telegram\manual-broadcast\route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    // 1. 요청 본문에서 메시지 꺼내기
    const body = await request.json()
    const { message } = body

    if (!message) {
      return NextResponse.json({ error: '메시지 내용이 없습니다.' }, { status: 400 })
    }

    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) return NextResponse.json({ error: '봇 토큰이 없습니다.' }, { status: 500 })

    // 2. 활성 구독자 조회
    const { data: subscribers, error } = await supabase
      .from('telegram_subscribers')
      .select('chat_id')
      .eq('is_active', true)

    if (error || !subscribers) {
      return NextResponse.json({ error: '구독자 조회 실패' }, { status: 500 })
    }

    // 3. 전송 (Promise.all로 병렬 처리)
    let successCount = 0
    let failCount = 0

    const promises = subscribers.map(async (sub) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: sub.chat_id,
            text: message, // 입력받은 메시지 그대로 전송
            parse_mode: 'HTML', // HTML 태그 지원 (<b>, <i> 등 사용 가능)
          }),
        })
        
        if (res.ok) successCount++
        else failCount++
      } catch (e) {
        failCount++
        console.error(e)
      }
    })

    await Promise.all(promises)

    return NextResponse.json({ 
      success: true, 
      total: subscribers.length,
      sent: successCount,
      failed: failCount 
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}