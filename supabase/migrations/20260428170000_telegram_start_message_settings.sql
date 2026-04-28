create table if not exists public.telegram_bot_settings (
  id text primary key default 'default',
  start_message_template text not null,
  updated_at timestamptz not null default now()
);

insert into public.telegram_bot_settings (id, start_message_template)
values (
  'default',
  '🎉 <b>환영합니다! 뉴스 알림 구독이 완료되었습니다.</b>

뉴스 알림봇은 두 가지 기능을 제공합니다.

<b>📌 ① 매일 오후 5시 오늘의 뉴스 브리핑</b>
당일 기준 "한화투자증권" 관련 모든 뉴스 및 주가

<b>📌 ② 등록 키워드를 통한 실시간 알림</b>
등록된 뉴스 키워드에 맞춰 ⏰5분마다 최신 소식을 전해드립니다.

💡 현재 등록 키워드
전산장애,전산오류,장애,오류,민원,소송,금융감독원,금감원

키워드 등록이 필요한 경우 관리자에게 연락해주세요.

알림을 끄고 싶으시면 <code>/stop</code>을 입력해주세요.'
)
on conflict (id) do nothing;

alter table public.telegram_bot_settings enable row level security;

drop policy if exists "service role full access telegram_bot_settings" on public.telegram_bot_settings;
create policy "service role full access telegram_bot_settings"
  on public.telegram_bot_settings
  for all
  to service_role
  using (true)
  with check (true);
