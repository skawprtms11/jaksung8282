do $$ begin
  create type public.user_registration_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists public.user_registration_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  employee_no text not null,
  full_name text not null,
  department_id uuid not null references public.departments(id),
  status public.user_registration_status not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_comment text,
  unique (email),
  unique (employee_no)
);

alter table public.user_registration_requests enable row level security;

drop policy if exists "user_registration_requests_admin_all" on public.user_registration_requests;
create policy "user_registration_requests_admin_all" on public.user_registration_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user_registration_requests_department_approvers_select" on public.user_registration_requests;
create policy "user_registration_requests_department_approvers_select" on public.user_registration_requests
  for select to authenticated using (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = department_id
  );

drop policy if exists "user_registration_requests_department_approvers_update" on public.user_registration_requests;
create policy "user_registration_requests_department_approvers_update" on public.user_registration_requests
  for update to authenticated using (
    status = 'pending'
    and public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = department_id
  ) with check (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = department_id
  );

create index if not exists idx_user_registration_requests_department_status
  on public.user_registration_requests(department_id, status, requested_at desc);
