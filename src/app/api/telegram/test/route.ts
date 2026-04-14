// src/app/api/telegram/test/route.ts
import { NextResponse } from 'next/server'
import { sendTelegramMessage } from '@/lib/telegram'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const authHeader = request.headers.get('Authorization')
    if (authHeader) {
      const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // sendTelegramMessage는 lib/telegram.ts에 정의되어 있어야 함 (단일 사용자용)
    // 만약 전체 방송 테스트라면 /api/telegram/test-broadcast를 써야 합니다.
    // 이 파일은 초기 개인 테스트용으로 만드셨던 파일입니다.
    await sendTelegramMessage('🚀 <b>[테스트]</b> 텔레그램 봇이 정상적으로 작동 중입니다!')
    
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}