-- 취합건 상태(진행/보류/완료/취소). 완료는 진행률 100% 시 화면에서 자동 표시되며,
-- 수동으로도 진행률과 무관하게 완료 처리할 수 있다. 기존 행은 전부 진행 상태로 시작한다.
alter table public.data_collections
  add column if not exists status text not null default 'in_progress'
    check (status in ('in_progress', 'on_hold', 'completed', 'cancelled'));

-- 롤백 절차 (새 migration 파일로 적용할 것)
-- alter table public.data_collections drop column if exists status;
