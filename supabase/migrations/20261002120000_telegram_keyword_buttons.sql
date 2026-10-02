-- 텔레그램 "➕ 키워드 추가" 버튼에 노출할 추천 키워드 (관리자 화면에서 관리)
create table if not exists public.suggested_alert_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  created_at timestamptz not null default now()
);

alter table public.suggested_alert_keywords enable row level security;

drop policy if exists "service role full access suggested_alert_keywords" on public.suggested_alert_keywords;
create policy "service role full access suggested_alert_keywords"
  on public.suggested_alert_keywords
  for all
  to service_role
  using (true)
  with check (true);

-- "➕ 키워드 추가"를 누른 뒤 일정 시간 안에 입력한 글을 키워드로 처리하기 위한 대기 상태
alter table public.telegram_subscribers
  add column if not exists pending_action text null,
  add column if not exists pending_action_at timestamptz null;
