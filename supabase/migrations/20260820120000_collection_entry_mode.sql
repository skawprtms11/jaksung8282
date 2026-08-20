-- 취합 방식: 표형식(grid) / 링크등록(link). 링크형은 URL로 이동해 작성하고 완료 체크만 관리한다.
alter table public.data_collections
  add column if not exists entry_mode text not null default 'grid'
    check (entry_mode in ('grid', 'link')),
  add column if not exists link_url text;
