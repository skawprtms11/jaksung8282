-- 자료취합 개편: 등록(설명·예시·사진·컬럼) → 부서별 작성(data_collection_entries) → 전체 확인.
alter table public.data_collections
  add column if not exists example text not null default '',
  add column if not exists image_url text,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id);

create table if not exists public.data_collection_entries (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.data_collections(id) on delete cascade,
  department_id uuid not null references public.departments(id),
  rows jsonb not null default '[]'::jsonb,
  is_completed boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (collection_id, department_id)
);

alter table public.data_collection_entries enable row level security;

create policy "data_collection_entries_select" on public.data_collection_entries
  for select to authenticated using (true);
create policy "data_collection_entries_insert" on public.data_collection_entries
  for insert to authenticated with check (public.can_access_department(department_id));
create policy "data_collection_entries_update" on public.data_collection_entries
  for update to authenticated
  using (public.can_access_department(department_id))
  with check (public.can_access_department(department_id));

create index if not exists idx_data_collection_entries_collection
  on public.data_collection_entries (collection_id);

-- 취합 안내용 사진 저장 버킷 (공개 읽기, 업로드는 서버 액션의 관리자 키로만 수행)
insert into storage.buckets (id, name, public)
values ('data-collections', 'data-collections', true)
on conflict (id) do nothing;
