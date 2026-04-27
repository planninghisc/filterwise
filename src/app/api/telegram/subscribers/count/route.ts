import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireCronOrSession } from '@/lib/requireCronOrSession'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const denied = await requireCronOrSession(request)
    if (denied) return denied

    const { count, error } = await supabaseAdmin
      .from('telegram_subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, count: count ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? 'Internal Server Error' }, { status: 500 })
  }
}
