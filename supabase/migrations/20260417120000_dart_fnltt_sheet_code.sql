-- XBRL 표 코드(DS320005 등) 저장: 한화투자증권 기준 QNAME 매핑·비교 시 연결/별도 구분에 사용
alter table public.dart_fnltt add column if not exists sheet_code text;

comment on column public.dart_fnltt.sheet_code is 'OpenDART sj_nm의 [DS######] 코드. 예: DS320005=포괄손익 별도, DS220000=재무상태표 연결';
