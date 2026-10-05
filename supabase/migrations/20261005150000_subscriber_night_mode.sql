-- 야간 알림 모아 받기: true 면 23시~06시(KST) 키워드 알림을 보내지 않고 아침 6시에 한 번에 보낸다
alter table public.telegram_subscribers
  add column if not exists night_mode boolean not null default false;
