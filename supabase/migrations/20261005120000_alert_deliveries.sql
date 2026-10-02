-- 대화방별로 최근 보낸 알림 기사 제목 (같은 이야기의 비슷한 기사를 24시간 동안 다시 보내지 않기 위함)
create table if not exists public.alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  title text not null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_alert_deliveries_chat_sent
  on public.alert_deliveries (chat_id, sent_at desc);

alter table public.alert_deliveries enable row level security;

drop policy if exists "service role full access alert_deliveries" on public.alert_deliveries;
create policy "service role full access alert_deliveries"
  on public.alert_deliveries
  for all
  to service_role
  using (true)
  with check (true);
