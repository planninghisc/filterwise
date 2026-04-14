// src/app/api/weekly-ir/report/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// RLS 정책 우회를 위해 Service Role Key 사용 (없으면 Anon Key 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// [GET] 날짜에 해당하는 리포트 불러오기
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  
  if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('weekly_ir_reports')
    .select('*')
    .eq('report_date', date)
    .single();
  
  if (error || !data) {
    return NextResponse.json({ success: false, message: 'Saved report not found' });
  }
  
  return NextResponse.json({ success: true, data });
}

// [POST] 리포트 저장하기 (업서트)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { report_date, stock_data, market_text, selected_news, review_text, preview_text } = body;

    const { error } = await supabase.from('weekly_ir_reports').upsert({
      report_date,
      stock_data,
      market_text,
      selected_news,
      review_text: typeof review_text === 'object' ? JSON.stringify(review_text) : review_text,
      preview_text: typeof preview_text === 'object' ? JSON.stringify(preview_text) : preview_text,
      updated_at: new Date().toISOString()
    }, { onConflict: 'report_date' });

    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Report save error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}