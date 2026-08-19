-- 부서 회의 메모: 부서 + 주차별 1건, 관리자만 조회/작성/수정
create table if not exists public.department_meeting_memos (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  week_start_date date not null,
  content text not null default '',
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, week_start_date)
);

alter table public.department_meeting_memos enable row level security;

drop policy if exists department_meeting_memos_admin_all on public.department_meeting_memos;
create policy department_meeting_memos_admin_all
  on public.department_meeting_memos
  for all
  using (public.is_admin())
  with check (public.is_admin());
