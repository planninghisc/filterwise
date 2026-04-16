-- 규모(tier: large|mid)와 피어 여부(is_peer) 분리 — 피어는 중소형사와 중복 가능
alter table public.dart_corp add column if not exists is_peer boolean not null default false;

-- 구 스키마: tier = 'peer' → 중소형 + 피어로 이관
update public.dart_corp set is_peer = true where tier = 'peer';
update public.dart_corp set tier = 'mid' where tier = 'peer';

alter table public.dart_corp drop constraint if exists dart_corp_tier_check;
alter table public.dart_corp
  add constraint dart_corp_tier_check check (tier in ('large', 'mid'));

alter table public.dart_corp alter column tier set default 'mid';

-- 대형사는 피어 플래그 불가
update public.dart_corp set is_peer = false where tier = 'large';
