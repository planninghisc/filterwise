import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  // ✅ Next.js 15에서는 cookies()가 Promise이므로 await 필요
  const cookieStore = await cookies()
  cookieStore.delete('sb-access-token')
  cookieStore.delete('sb-refresh-token')

  return NextResponse.json({ success: true })
}
