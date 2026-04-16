-- XBRL/뷰어 등에서 추출한 임직원 수 (회사·연도·보고서당 1행) 완료
create table if not exists public.dart_headcount (
  corp_code text not null,
  bsns_year integer not null,
  reprt_code text not null,
  headcount integer,
  headcount_source text,
  updated_at timestamptz not null default now(),
  constraint dart_headcount_pkey primary key (corp_code, bsns_year, reprt_code)
);

comment on table public.dart_headcount is 'DART 정기보고 기준 임직원 수 (xbrl-sheet-rows 등에서 upsert)';

alter table public.dart_headcount enable row level security;
