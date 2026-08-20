-- 자료취합 유형: 정기취합(regular) / 수시취합(adhoc). 정기취합은 등록 시 템플릿으로 재사용된다.
alter table public.data_collections
  add column if not exists collection_type text not null default 'adhoc'
  check (collection_type in ('regular', 'adhoc'));
