create table if not exists public.dart_analysis_formula (
  corp_code text primary key references public.dart_corp (corp_code) on delete cascade,
  net_operating_revenue jsonb not null default '[]'::jsonb,
  sga_including_personnel jsonb not null default '[]'::jsonb,
  operating_income jsonb not null default '[]'::jsonb,
  profit_before_tax jsonb not null default '[]'::jsonb,
  net_income jsonb not null default '[]'::jsonb,
  equity jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.dart_analysis_formula is
'DART Analysis company-specific metric formulas';

comment on column public.dart_analysis_formula.net_operating_revenue is
'JSON array of terms: [{ "account_id": "...", "sign": 1|-1 }]';
