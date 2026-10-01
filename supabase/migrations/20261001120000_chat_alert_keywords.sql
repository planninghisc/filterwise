-- 텔레그램 대화방(chat_id)별 개인 알림 키워드 (봇 /add /list /del 명령어로 관리)
create table if not exists public.chat_alert_keywords (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  keyword text not null,
  created_at timestamptz not null default now(),
  unique (chat_id, keyword)
);

create index if not exists idx_chat_alert_keywords_chat_id
  on public.chat_alert_keywords (chat_id);

alter table public.chat_alert_keywords enable row level security;

drop policy if exists "service role full access chat_alert_keywords" on public.chat_alert_keywords;
create policy "service role full access chat_alert_keywords"
  on public.chat_alert_keywords
  for all
  to service_role
  using (true)
  with check (true);
