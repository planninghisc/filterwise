create table if not exists public.telegram_inbox (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  first_name text null,
  username text null,
  text text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_inbox_created_at
  on public.telegram_inbox (created_at desc);

create index if not exists idx_telegram_inbox_is_read_created_at
  on public.telegram_inbox (is_read, created_at desc);

create index if not exists idx_telegram_inbox_chat_id
  on public.telegram_inbox (chat_id);

alter table public.telegram_inbox enable row level security;

drop policy if exists "service role full access telegram_inbox" on public.telegram_inbox;
create policy "service role full access telegram_inbox"
  on public.telegram_inbox
  for all
  to service_role
  using (true)
  with check (true);
