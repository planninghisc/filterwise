create index if not exists idx_dart_fnltt_analysis_fast
on public.dart_fnltt (bsns_year, reprt_code, fs_div, corp_code, sj_div, account_id, sheet_code);

comment on index idx_dart_fnltt_analysis_fast is
'DART Analysis(6 metrics + company formulas) fast lookup index';
