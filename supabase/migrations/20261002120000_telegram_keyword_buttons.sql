-- "➕ 키워드 추가"를 누른 뒤 일정 시간 안에 입력한 글을 키워드로 처리하기 위한 대기 상태
alter table public.telegram_subscribers
  add column if not exists pending_action text null,
  add column if not exists pending_action_at timestamptz null;
