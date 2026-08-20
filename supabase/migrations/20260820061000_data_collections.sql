-- 자료취합 게시판: 제목·내용설명·취합양식(사용자 정의 엑셀표)을 저장한다.
create table if not exists public.data_collections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  template jsonb not null default '{"columns":[],"rows":[]}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

alter table public.data_collections enable row level security;

create policy "data_collections_select_active" on public.data_collections
  for select to authenticated using (deleted_at is null);
create policy "data_collections_admin_insert" on public.data_collections
  for insert to authenticated with check (public.is_admin());
create policy "data_collections_admin_update" on public.data_collections
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_data_collections_created_at
  on public.data_collections (created_at desc)
  where deleted_at is null;
