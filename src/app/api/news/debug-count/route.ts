// src/app/api/news/debug-count/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const { count, error } = await supabaseAdmin
    .from('news_articles')
    .select('id', { count: 'exact', head: true })
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok:true, count: count ?? 0 })
}
