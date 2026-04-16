-- dart_corp: 증권사 분류 (대형/중소형/피어)
alter table public.dart_corp
  add column if not exists tier text;

update public.dart_corp set tier = 'peer' where tier is null or tier = '';

alter table public.dart_corp alter column tier set default 'peer';

alter table public.dart_corp drop constraint if exists dart_corp_tier_check;
alter table public.dart_corp
  add constraint dart_corp_tier_check check (tier in ('large', 'mid', 'peer'));

alter table public.dart_corp alter column tier set not null;

-- 기본 14사 분류 (이미 있으면 tier만 갱신)
insert into public.dart_corp (corp_code, corp_name, tier) values
  ('00104856', '삼성증권', 'large'),
  ('00120182', 'NH투자증권', 'large'),
  ('00138321', '신한투자증권', 'large'),
  ('00160144', '한국투자증권', 'large'),
  ('00164876', 'KB증권', 'large'),
  ('00163682', '메리츠증권', 'large'),
  ('00148610', '한화투자증권', 'mid'),
  ('00110893', '대신증권', 'mid'),
  ('00113359', '교보증권', 'mid'),
  ('00117601', '유안타증권', 'mid'),
  ('00136721', '신영증권', 'mid'),
  ('00137997', '현대차증권', 'mid'),
  ('00148665', 'iM투자증권', 'mid'),
  ('00684918', 'IBK투자증권', 'mid')
on conflict (corp_code) do update set tier = excluded.tier;
