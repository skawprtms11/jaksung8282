-- supabase/migrations/001_extensions_and_enums.sql

create extension if not exists "pgcrypto";

do $$ begin
  create type public.app_role as enum ('admin', 'department_head', 'manager', 'client_owner');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notice_type as enum ('general', 'important', 'urgent', 'system');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.client_report_status as enum ('draft', 'submitted', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.department_submission_status as enum ('draft', 'submitted_to_division', 'division_approved', 'division_rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.item_period as enum ('current', 'next');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.importance_level as enum ('very_high', 'high', 'medium', 'low');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.volume_type as enum ('inbound', 'outbound', 'inventory', 'order', 'return', 'etc');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.volume_unit as enum ('EA', 'BOX', 'CASE', 'PLT', 'case_count', 'TON', 'CBM', 'etc');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.department_section_type as enum ('common', 'facility', 'vacancy', 'holiday_work');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.approval_target_type as enum ('client_report', 'department_submission');
exception when duplicate_object then null;
end $$;

-- supabase/migrations/002_tables.sql

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  department_code text not null unique,
  department_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  employee_no text not null unique,
  full_name text not null,
  department_id uuid references public.departments(id),
  app_role public.app_role not null default 'client_owner',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique,
  client_name text not null,
  notes text,
  department_id uuid references public.departments(id),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  unique (client_id, user_id)
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  notice_type public.notice_type not null default 'general',
  title text not null,
  content text not null,
  is_pinned boolean not null default false,
  publish_start_date date,
  publish_end_date date,
  view_count integer not null default 0 check (view_count >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists public.work_categories (
  id uuid primary key default gen_random_uuid(),
  category_code text not null unique,
  category_name text not null,
  icon_key text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.weekly_client_reports (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  week_end_date date not null,
  report_year integer not null check (report_year between 2020 and 2100),
  report_month integer not null check (report_month between 1 and 12),
  week_of_month integer not null check (week_of_month between 1 and 6),
  department_id uuid not null references public.departments(id),
  client_id uuid not null references public.clients(id),
  status public.client_report_status not null default 'draft',
  no_special_issue boolean not null default false,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  submitted_at timestamptz,
  department_reviewed_by uuid references auth.users(id),
  department_reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists public.weekly_client_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.weekly_client_reports(id) on delete cascade,
  item_period public.item_period not null,
  importance public.importance_level not null default 'medium',
  work_category_id uuid not null references public.work_categories(id),
  title text not null check (length(btrim(title)) > 0),
  content text not null check (length(btrim(content)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_volumes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.weekly_client_reports(id) on delete cascade,
  volume_type public.volume_type not null,
  quantity numeric(14, 2) not null check (quantity >= 0),
  unit public.volume_unit not null,
  custom_unit text,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.department_weekly_submissions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id),
  week_start_date date not null,
  week_end_date date not null,
  report_year integer not null check (report_year between 2020 and 2100),
  report_month integer not null check (report_month between 1 and 12),
  week_of_month integer not null check (week_of_month between 1 and 6),
  status public.department_submission_status not null default 'draft',
  exception_reason text,
  finalized_by uuid references auth.users(id),
  finalized_at timestamptz,
  division_reviewed_by uuid references auth.users(id),
  division_reviewed_at timestamptz,
  division_review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists public.department_weekly_contents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.department_weekly_submissions(id) on delete cascade,
  section_type public.department_section_type not null,
  current_week_content text not null default '',
  next_week_content text not null default '',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  unique (submission_id, section_type)
);

create table if not exists public.approval_history (
  id uuid primary key default gen_random_uuid(),
  target_type public.approval_target_type not null,
  target_id uuid not null,
  action text not null,
  previous_status text,
  next_status text not null,
  comment text,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- supabase/migrations/003_functions_and_triggers.sql

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select app_role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.current_department_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

create or replace function public.can_access_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.current_department_id() = target_department_id;
$$;

create or replace function public.is_assigned_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_assignments ca
    where ca.client_id = target_client_id
      and ca.user_id = auth.uid()
      and ca.is_active = true
  );
$$;

create or replace function public.client_department_id(target_client_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.clients where id = target_client_id and is_active = true;
$$;

create or replace function public.can_write_client_report(target_department_id uuid, target_client_id uuid, target_status public.client_report_status)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.client_department_id(target_client_id) = target_department_id
    and (
      public.is_admin()
      or (
        public.current_app_role() in ('department_head', 'manager')
        and public.current_department_id() = target_department_id
        and target_status <> 'approved'
      )
      or (
        public.current_app_role() = 'client_owner'
        and public.current_department_id() = target_department_id
        and public.is_assigned_client(target_client_id)
        and target_status in ('draft', 'submitted', 'rejected')
      )
    );
$$;

create or replace function public.increment_notice_view(notice_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notices
  set view_count = view_count + 1
  where id = notice_id
    and deleted_at is null
    and is_active = true;
$$;

create or replace function public.transition_client_report_status(report_id uuid, next_status text, comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.weekly_client_reports%rowtype;
  requested public.client_report_status := next_status::public.client_report_status;
  actor_role public.app_role := public.current_app_role();
begin
  select * into target
  from public.weekly_client_reports
  where id = report_id and deleted_at is null
  for update;

  if not found then
    raise exception '자료를 찾을 수 없습니다.';
  end if;

  if not public.can_access_department(target.department_id) then
    raise exception '처리 권한이 없습니다.';
  end if;

  if requested = 'approved' and actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '승인 권한이 없습니다.';
  end if;

  if requested = 'rejected' and actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '반려 권한이 없습니다.';
  end if;

  if requested = 'rejected' and length(btrim(coalesce(comment, ''))) = 0 then
    raise exception '반려사유를 입력하세요.';
  end if;

  if not (
    (target.status = 'draft' and requested = 'submitted')
    or (target.status = 'submitted' and requested in ('approved', 'rejected'))
    or (target.status = 'rejected' and requested in ('draft', 'submitted'))
    or (target.status = 'approved' and requested in ('submitted', 'draft') and actor_role in ('admin', 'department_head'))
  ) then
    raise exception '허용되지 않은 상태 변경입니다.';
  end if;

  update public.weekly_client_reports
  set status = requested,
      submitted_at = case when requested = 'submitted' then now() else submitted_at end,
      department_reviewed_by = case when requested in ('approved', 'rejected') then auth.uid() else department_reviewed_by end,
      department_reviewed_at = case when requested in ('approved', 'rejected') then now() else department_reviewed_at end,
      review_comment = comment,
      updated_by = auth.uid(),
      updated_at = now()
  where id = report_id;

  insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
  values (
    'client_report',
    report_id,
    case requested when 'submitted' then '검토요청' when 'approved' then '승인' when 'rejected' then '반려' else '승인 해제' end,
    target.status::text,
    requested::text,
    comment,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'status', requested);
end;
$$;

create or replace function public.transition_department_submission_status(submission_id uuid, next_status text, comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.department_weekly_submissions%rowtype;
  requested public.department_submission_status := next_status::public.department_submission_status;
  actor_role public.app_role := public.current_app_role();
begin
  select * into target
  from public.department_weekly_submissions
  where id = submission_id and deleted_at is null
  for update;

  if not found then
    raise exception '자료를 찾을 수 없습니다.';
  end if;

  if not public.can_access_department(target.department_id) then
    raise exception '처리 권한이 없습니다.';
  end if;

  if requested = 'submitted_to_division' and actor_role not in ('admin', 'department_head') then
    raise exception '부서 최종 제출 권한이 없습니다.';
  end if;

  if requested in ('division_approved', 'division_rejected') and actor_role <> 'admin' then
    raise exception '사업부 승인 권한이 없습니다.';
  end if;

  if requested = 'division_rejected' and length(btrim(coalesce(comment, ''))) = 0 then
    raise exception '반려사유를 입력하세요.';
  end if;

  if not (
    (target.status = 'draft' and requested = 'submitted_to_division')
    or (target.status = 'submitted_to_division' and requested in ('division_approved', 'division_rejected'))
    or (target.status = 'division_rejected' and requested in ('draft', 'submitted_to_division'))
    or (target.status = 'division_approved' and requested = 'draft' and actor_role = 'admin')
  ) then
    raise exception '허용되지 않은 상태 변경입니다.';
  end if;

  update public.department_weekly_submissions
  set status = requested,
      finalized_by = case when requested = 'submitted_to_division' then auth.uid() else finalized_by end,
      finalized_at = case when requested = 'submitted_to_division' then now() else finalized_at end,
      division_reviewed_by = case when requested in ('division_approved', 'division_rejected') then auth.uid() else division_reviewed_by end,
      division_reviewed_at = case when requested in ('division_approved', 'division_rejected') then now() else division_reviewed_at end,
      division_review_comment = comment,
      updated_at = now()
  where id = submission_id;

  insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
  values (
    'department_submission',
    submission_id,
    case requested when 'submitted_to_division' then '사업부 검토요청' when 'division_approved' then '사업부 승인' when 'division_rejected' then '사업부 반려' else '관리자 재오픈' end,
    target.status::text,
    requested::text,
    comment,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'status', requested);
end;
$$;

drop trigger if exists departments_set_updated_at on public.departments;
create trigger departments_set_updated_at before update on public.departments for each row execute function public.set_updated_at();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients for each row execute function public.set_updated_at();
drop trigger if exists notices_set_updated_at on public.notices;
create trigger notices_set_updated_at before update on public.notices for each row execute function public.set_updated_at();
drop trigger if exists weekly_client_reports_set_updated_at on public.weekly_client_reports;
create trigger weekly_client_reports_set_updated_at before update on public.weekly_client_reports for each row execute function public.set_updated_at();
drop trigger if exists weekly_client_report_items_set_updated_at on public.weekly_client_report_items;
create trigger weekly_client_report_items_set_updated_at before update on public.weekly_client_report_items for each row execute function public.set_updated_at();
drop trigger if exists weekly_volumes_set_updated_at on public.weekly_volumes;
create trigger weekly_volumes_set_updated_at before update on public.weekly_volumes for each row execute function public.set_updated_at();
drop trigger if exists department_weekly_submissions_set_updated_at on public.department_weekly_submissions;
create trigger department_weekly_submissions_set_updated_at before update on public.department_weekly_submissions for each row execute function public.set_updated_at();
drop trigger if exists department_weekly_contents_set_updated_at on public.department_weekly_contents;
create trigger department_weekly_contents_set_updated_at before update on public.department_weekly_contents for each row execute function public.set_updated_at();

revoke all on function public.current_app_role() from public;
revoke all on function public.current_department_id() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_access_department(uuid) from public;
revoke all on function public.is_assigned_client(uuid) from public;
revoke all on function public.client_department_id(uuid) from public;
revoke all on function public.can_write_client_report(uuid, uuid, public.client_report_status) from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_department_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_department(uuid) to authenticated;
grant execute on function public.is_assigned_client(uuid) to authenticated;
grant execute on function public.client_department_id(uuid) to authenticated;
grant execute on function public.can_write_client_report(uuid, uuid, public.client_report_status) to authenticated;
grant execute on function public.transition_client_report_status(uuid, text, text) to authenticated;
grant execute on function public.transition_department_submission_status(uuid, text, text) to authenticated;
grant execute on function public.increment_notice_view(uuid) to authenticated;

-- supabase/migrations/004_rls_policies.sql

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_assignments enable row level security;
alter table public.notices enable row level security;
alter table public.work_categories enable row level security;
alter table public.weekly_client_reports enable row level security;
alter table public.weekly_client_report_items enable row level security;
alter table public.weekly_volumes enable row level security;
alter table public.department_weekly_submissions enable row level security;
alter table public.department_weekly_contents enable row level security;
alter table public.approval_history enable row level security;

create policy "departments_select_accessible" on public.departments
  for select to authenticated using (public.is_admin() or id = public.current_department_id());
create policy "departments_admin_insert" on public.departments
  for insert to authenticated with check (public.is_admin());
create policy "departments_admin_update" on public.departments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "profiles_select_self_or_admin" on public.profiles
  for select to authenticated using (public.is_admin() or id = auth.uid());
create policy "profiles_admin_insert" on public.profiles
  for insert to authenticated with check (public.is_admin());
create policy "profiles_admin_update" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "clients_select_accessible_department" on public.clients
  for select to authenticated using (public.can_access_department(department_id));
create policy "clients_admin_insert" on public.clients
  for insert to authenticated with check (public.is_admin());
create policy "clients_admin_update" on public.clients
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "client_assignments_select_accessible" on public.client_assignments
  for select to authenticated using (
    public.is_admin()
    or user_id = auth.uid()
    or public.can_access_department(public.client_department_id(client_id))
  );
create policy "client_assignments_admin_insert" on public.client_assignments
  for insert to authenticated with check (public.is_admin());
create policy "client_assignments_admin_update" on public.client_assignments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "notices_select_active" on public.notices
  for select to authenticated using (deleted_at is null and is_active = true);
create policy "notices_admin_insert" on public.notices
  for insert to authenticated with check (public.is_admin());
create policy "notices_admin_update" on public.notices
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "work_categories_select_active" on public.work_categories
  for select to authenticated using (is_active = true);
create policy "work_categories_admin_write" on public.work_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "weekly_client_reports_select_department" on public.weekly_client_reports
  for select to authenticated using (deleted_at is null and public.can_access_department(department_id));
create policy "weekly_client_reports_insert_allowed" on public.weekly_client_reports
  for insert to authenticated with check (
    deleted_at is null
    and public.can_write_client_report(department_id, client_id, status)
  );
create policy "weekly_client_reports_update_allowed" on public.weekly_client_reports
  for update to authenticated using (
    public.can_access_department(department_id)
    and (
      public.is_admin()
      or public.current_app_role() in ('department_head', 'manager')
      or (
        public.current_app_role() = 'client_owner'
        and created_by = auth.uid()
        and public.is_assigned_client(client_id)
        and status in ('draft', 'rejected')
      )
    )
  ) with check (
    public.can_write_client_report(department_id, client_id, status)
  );
create policy "weekly_client_reports_delete_admin" on public.weekly_client_reports
  for delete to authenticated using (public.is_admin());

create policy "weekly_client_report_items_select_parent" on public.weekly_client_report_items
  for select to authenticated using (
    exists (
      select 1 from public.weekly_client_reports r
      where r.id = report_id and r.deleted_at is null and public.can_access_department(r.department_id)
    )
  );
create policy "weekly_client_report_items_write_parent" on public.weekly_client_report_items
  for all to authenticated using (
    exists (
      select 1 from public.weekly_client_reports r
      where r.id = report_id and public.can_write_client_report(r.department_id, r.client_id, r.status)
    )
  ) with check (
    exists (
      select 1 from public.weekly_client_reports r
      where r.id = report_id and public.can_write_client_report(r.department_id, r.client_id, r.status)
    )
  );

create policy "weekly_volumes_select_parent" on public.weekly_volumes
  for select to authenticated using (
    exists (
      select 1 from public.weekly_client_reports r
      where r.id = report_id and r.deleted_at is null and public.can_access_department(r.department_id)
    )
  );
create policy "weekly_volumes_write_parent" on public.weekly_volumes
  for all to authenticated using (
    exists (
      select 1 from public.weekly_client_reports r
      where r.id = report_id and public.can_write_client_report(r.department_id, r.client_id, r.status)
    )
  ) with check (
    exists (
      select 1 from public.weekly_client_reports r
      where r.id = report_id and public.can_write_client_report(r.department_id, r.client_id, r.status)
    )
  );

create policy "department_weekly_submissions_select_department" on public.department_weekly_submissions
  for select to authenticated using (deleted_at is null and public.can_access_department(department_id));
create policy "department_weekly_submissions_insert_heads" on public.department_weekly_submissions
  for insert to authenticated with check (
    public.is_admin()
    or (public.current_app_role() in ('department_head', 'manager') and public.current_department_id() = department_id)
  );
create policy "department_weekly_submissions_update_heads" on public.department_weekly_submissions
  for update to authenticated using (
    public.is_admin()
    or (public.current_app_role() in ('department_head', 'manager') and public.current_department_id() = department_id and status in ('draft', 'division_rejected'))
  ) with check (
    public.is_admin()
    or (public.current_app_role() in ('department_head', 'manager') and public.current_department_id() = department_id)
  );

create policy "department_weekly_contents_select_parent" on public.department_weekly_contents
  for select to authenticated using (
    exists (
      select 1 from public.department_weekly_submissions s
      where s.id = submission_id and s.deleted_at is null and public.can_access_department(s.department_id)
    )
  );
create policy "department_weekly_contents_write_parent" on public.department_weekly_contents
  for all to authenticated using (
    exists (
      select 1 from public.department_weekly_submissions s
      where s.id = submission_id and public.can_access_department(s.department_id)
    )
  ) with check (
    exists (
      select 1 from public.department_weekly_submissions s
      where s.id = submission_id and public.can_access_department(s.department_id)
    )
  );

create policy "approval_history_select_accessible" on public.approval_history
  for select to authenticated using (
    public.is_admin()
    or (
      target_type = 'client_report'
      and exists (
        select 1 from public.weekly_client_reports r
        where r.id = target_id and public.can_access_department(r.department_id)
      )
    )
    or (
      target_type = 'department_submission'
      and exists (
        select 1 from public.department_weekly_submissions s
        where s.id = target_id and public.can_access_department(s.department_id)
      )
    )
  );
create policy "approval_history_insert_authenticated" on public.approval_history
  for insert to authenticated with check (actor_id = auth.uid() or public.is_admin());

-- supabase/migrations/005_indexes.sql

create unique index if not exists weekly_client_reports_client_week_active_uidx
  on public.weekly_client_reports(client_id, week_start_date)
  where deleted_at is null;

create unique index if not exists department_weekly_submissions_department_week_active_uidx
  on public.department_weekly_submissions(department_id, week_start_date)
  where deleted_at is null;

create unique index if not exists client_assignments_primary_active_uidx
  on public.client_assignments(client_id)
  where is_active = true and is_primary = true;

create index if not exists clients_department_idx on public.clients(department_id);
create index if not exists profiles_department_role_idx on public.profiles(department_id, app_role);
create index if not exists notices_search_idx on public.notices using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')));
create index if not exists weekly_client_reports_week_department_idx on public.weekly_client_reports(week_start_date, department_id, status);
create index if not exists weekly_volumes_report_type_unit_idx on public.weekly_volumes(report_id, volume_type, unit);
create index if not exists approval_history_target_idx on public.approval_history(target_type, target_id, created_at desc);

-- supabase/migrations/006_seed_data.sql

insert into public.work_categories(category_code, category_name, icon_key, sort_order, is_active)
values
  ('operation', '운영', 'ClipboardList', 10, true),
  ('volume', '물동량', 'Boxes', 20, true),
  ('quality', '품질', 'BadgeCheck', 30, true),
  ('safety', '안전', 'ShieldCheck', 40, true),
  ('hr', '인사', 'Users', 50, true),
  ('facility', '시설', 'Building2', 60, true),
  ('customer', '고객', 'Handshake', 70, true),
  ('system', '시스템', 'MonitorCog', 80, true),
  ('etc', '기타', 'MoreHorizontal', 90, true)
on conflict (category_code) do update
set category_name = excluded.category_name,
    icon_key = excluded.icon_key,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

create or replace view public.safe_department_users
with (security_invoker = true)
as
select id, full_name, department_id, app_role, is_active
from public.profiles
where is_active = true;

-- supabase/migrations/007_add_client_notes.sql

alter table public.clients
  add column if not exists notes text;

-- supabase/migrations/008_department_client_registration_policies.sql

drop policy if exists "clients_department_leads_insert" on public.clients;
create policy "clients_department_leads_insert" on public.clients
  for insert to authenticated with check (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = department_id
  );

drop policy if exists "clients_department_leads_update" on public.clients;
create policy "clients_department_leads_update" on public.clients
  for update to authenticated using (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = department_id
  ) with check (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = department_id
  );

drop policy if exists "client_assignments_department_leads_insert" on public.client_assignments;
create policy "client_assignments_department_leads_insert" on public.client_assignments
  for insert to authenticated with check (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = public.client_department_id(client_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = user_id
        and p.department_id = public.current_department_id()
        and p.is_active = true
    )
  );

drop policy if exists "client_assignments_department_leads_update" on public.client_assignments;
create policy "client_assignments_department_leads_update" on public.client_assignments
  for update to authenticated using (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = public.client_department_id(client_id)
  ) with check (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = public.client_department_id(client_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = user_id
        and p.department_id = public.current_department_id()
        and p.is_active = true
    )
  );

-- supabase/migrations/009_make_client_department_optional.sql

alter table public.clients
  alter column department_id drop not null;

-- supabase/migrations/010_mini_game_scores.sql

create table if not exists public.mini_game_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  max_level integer not null default 1 check (max_level >= 1),
  snack_count integer not null default 0 check (snack_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.mini_game_scores enable row level security;

drop policy if exists "mini_game_scores_select_authenticated" on public.mini_game_scores;
create policy "mini_game_scores_select_authenticated" on public.mini_game_scores
  for select to authenticated using (true);

drop policy if exists "mini_game_scores_insert_self" on public.mini_game_scores;
create policy "mini_game_scores_insert_self" on public.mini_game_scores
  for insert to authenticated with check (user_id = auth.uid());

create index if not exists idx_mini_game_scores_score
  on public.mini_game_scores (score desc, duration_seconds desc, created_at asc);

create index if not exists idx_mini_game_scores_user_created
  on public.mini_game_scores (user_id, created_at desc);

-- supabase/migrations/011_add_department_notes.sql

alter table public.departments
  add column if not exists notes text;

-- supabase/migrations/012_harden_review_permissions.sql

create or replace function public.transition_client_report_status(report_id uuid, next_status text, comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.weekly_client_reports%rowtype;
  requested public.client_report_status := next_status::public.client_report_status;
  actor_role public.app_role := public.current_app_role();
begin
  select * into target
  from public.weekly_client_reports
  where id = report_id and deleted_at is null
  for update;

  if not found then
    raise exception '자료를 찾을 수 없습니다.';
  end if;

  if not public.can_access_department(target.department_id) then
    raise exception '처리 권한이 없습니다.';
  end if;

  if requested = 'submitted' and actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
    raise exception '검토요청 권한이 없습니다.';
  end if;

  if requested = 'submitted'
    and actor_role = 'client_owner'
    and (target.created_by <> auth.uid() or not public.is_assigned_client(target.client_id)) then
    raise exception '배정된 본인 자료만 검토요청할 수 있습니다.';
  end if;

  if requested = 'approved' and actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '승인 권한이 없습니다.';
  end if;

  if requested = 'rejected' and actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '반려 권한이 없습니다.';
  end if;

  if requested = 'rejected' and length(btrim(coalesce(comment, ''))) = 0 then
    raise exception '반려사유를 입력하세요.';
  end if;

  if not (
    (target.status = 'draft' and requested = 'submitted')
    or (target.status = 'submitted' and requested in ('approved', 'rejected'))
    or (target.status = 'rejected' and requested in ('draft', 'submitted'))
    or (target.status = 'approved' and requested in ('submitted', 'draft') and actor_role in ('admin', 'department_head'))
  ) then
    raise exception '허용되지 않은 상태 변경입니다.';
  end if;

  update public.weekly_client_reports
  set status = requested,
      submitted_at = case when requested = 'submitted' then now() else submitted_at end,
      department_reviewed_by = case when requested in ('approved', 'rejected') then auth.uid() else department_reviewed_by end,
      department_reviewed_at = case when requested in ('approved', 'rejected') then now() else department_reviewed_at end,
      review_comment = comment,
      updated_by = auth.uid(),
      updated_at = now()
  where id = report_id;

  insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
  values (
    'client_report',
    report_id,
    case requested when 'submitted' then '검토요청' when 'approved' then '승인' when 'rejected' then '반려' else '승인 해제' end,
    target.status::text,
    requested::text,
    comment,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'status', requested);
end;
$$;

drop policy if exists "department_weekly_submissions_insert_heads" on public.department_weekly_submissions;
create policy "department_weekly_submissions_insert_heads" on public.department_weekly_submissions
  for insert to authenticated with check (
    status = 'draft'
    and (
      public.is_admin()
      or (public.current_app_role() in ('department_head', 'manager') and public.current_department_id() = department_id)
    )
  );

drop policy if exists "department_weekly_submissions_update_heads" on public.department_weekly_submissions;
create policy "department_weekly_submissions_update_heads" on public.department_weekly_submissions
  for update to authenticated using (
    status in ('draft', 'division_rejected')
    and (
      public.is_admin()
      or (public.current_app_role() in ('department_head', 'manager') and public.current_department_id() = department_id)
    )
  ) with check (
    status in ('draft', 'division_rejected')
    and (
      public.is_admin()
      or (public.current_app_role() in ('department_head', 'manager') and public.current_department_id() = department_id)
    )
  );

drop policy if exists "department_weekly_contents_write_parent" on public.department_weekly_contents;
create policy "department_weekly_contents_write_parent" on public.department_weekly_contents
  for all to authenticated using (
    exists (
      select 1 from public.department_weekly_submissions s
      where s.id = submission_id
        and public.can_access_department(s.department_id)
        and s.status in ('draft', 'division_rejected')
    )
  ) with check (
    exists (
      select 1 from public.department_weekly_submissions s
      where s.id = submission_id
        and public.can_access_department(s.department_id)
        and s.status in ('draft', 'division_rejected')
    )
  );

-- supabase/migrations/013_add_report_item_title_and_very_high_importance.sql

do $$ begin
  alter type public.importance_level add value if not exists 'very_high' before 'high';
exception
  when duplicate_object then null;
end $$;

alter table public.weekly_client_report_items
  add column if not exists title text not null default '제목 없음';

do $$ begin
  alter table public.weekly_client_report_items
    add constraint weekly_client_report_items_title_not_blank check (length(btrim(title)) > 0);
exception
  when duplicate_object then null;
end $$;

-- supabase/migrations/014_user_registration_requests.sql

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

-- supabase/migrations/015_relax_client_owner_report_delete_policy.sql

drop policy if exists "weekly_client_reports_update_allowed" on public.weekly_client_reports;

create policy "weekly_client_reports_update_allowed" on public.weekly_client_reports
  for update to authenticated using (
    public.can_access_department(department_id)
    and (
      public.is_admin()
      or public.current_app_role() in ('department_head', 'manager')
      or (
        public.current_app_role() = 'client_owner'
        and public.is_assigned_client(client_id)
        and status in ('draft', 'rejected')
      )
    )
  ) with check (
    public.can_write_client_report(department_id, client_id, status)
  );

-- supabase/migrations/016_department_content_meta.sql

alter table public.department_weekly_contents
  add column if not exists current_importance public.importance_level not null default 'medium',
  add column if not exists current_work_category_id uuid references public.work_categories(id),
  add column if not exists next_importance public.importance_level not null default 'medium',
  add column if not exists next_work_category_id uuid references public.work_categories(id);

-- supabase/migrations/017_allow_client_report_submit_cancel.sql

create or replace function public.transition_client_report_status(report_id uuid, next_status text, comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.weekly_client_reports%rowtype;
  requested public.client_report_status := next_status::public.client_report_status;
  actor_role public.app_role := public.current_app_role();
begin
  select * into target
  from public.weekly_client_reports
  where id = report_id and deleted_at is null
  for update;

  if not found then
    raise exception '자료를 찾을 수 없습니다.';
  end if;

  if not public.can_access_department(target.department_id) then
    raise exception '처리 권한이 없습니다.';
  end if;

  if requested = 'submitted' and actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
    raise exception '검토요청 권한이 없습니다.';
  end if;

  if requested = 'submitted'
    and actor_role = 'client_owner'
    and (target.created_by <> auth.uid() or not public.is_assigned_client(target.client_id)) then
    raise exception '배정된 본인 자료만 검토요청할 수 있습니다.';
  end if;

  if requested = 'draft' and target.status = 'submitted' and actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
    raise exception '확정취소 권한이 없습니다.';
  end if;

  if requested = 'draft'
    and target.status = 'submitted'
    and actor_role = 'client_owner'
    and (target.created_by <> auth.uid() or not public.is_assigned_client(target.client_id)) then
    raise exception '배정된 본인 자료만 확정취소할 수 있습니다.';
  end if;

  if requested = 'approved' and actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '승인 권한이 없습니다.';
  end if;

  if requested = 'rejected' and actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '반려 권한이 없습니다.';
  end if;

  if requested = 'rejected' and length(btrim(coalesce(comment, ''))) = 0 then
    raise exception '반려사유를 입력하세요.';
  end if;

  if not (
    (target.status = 'draft' and requested = 'submitted')
    or (target.status = 'submitted' and requested in ('draft', 'approved', 'rejected'))
    or (target.status = 'rejected' and requested in ('draft', 'submitted'))
    or (target.status = 'approved' and requested in ('submitted', 'draft') and actor_role in ('admin', 'department_head'))
  ) then
    raise exception '허용되지 않은 상태 변경입니다.';
  end if;

  update public.weekly_client_reports
  set status = requested,
      submitted_at = case
        when requested = 'submitted' then now()
        when target.status = 'submitted' and requested = 'draft' then null
        else submitted_at
      end,
      department_reviewed_by = case when requested in ('approved', 'rejected') then auth.uid() else department_reviewed_by end,
      department_reviewed_at = case when requested in ('approved', 'rejected') then now() else department_reviewed_at end,
      review_comment = comment,
      updated_by = auth.uid(),
      updated_at = now()
  where id = report_id;

  insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
  values (
    'client_report',
    report_id,
    case
      when requested = 'submitted' then '검토요청'
      when requested = 'approved' then '승인'
      when requested = 'rejected' then '반려'
      when requested = 'draft' and target.status = 'submitted' then '확정취소'
      else '승인 해제'
    end,
    target.status::text,
    requested::text,
    comment,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'status', requested);
end;
$$;

-- supabase/migrations/018_atomic_report_saves_and_indexes.sql

create index if not exists weekly_client_reports_department_updated_idx
  on public.weekly_client_reports(department_id, updated_at desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_updated_idx
  on public.weekly_client_reports(updated_at desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_week_desc_idx
  on public.weekly_client_reports(week_start_date desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_department_week_desc_idx
  on public.weekly_client_reports(department_id, week_start_date desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_department_status_week_desc_idx
  on public.weekly_client_reports(department_id, status, week_start_date desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_status_week_desc_idx
  on public.weekly_client_reports(status, week_start_date desc)
  where deleted_at is null;

create index if not exists weekly_client_report_items_report_period_sort_idx
  on public.weekly_client_report_items(report_id, item_period, sort_order);

create index if not exists department_weekly_submissions_department_updated_idx
  on public.department_weekly_submissions(department_id, updated_at desc)
  where deleted_at is null;

create index if not exists department_weekly_submissions_week_desc_idx
  on public.department_weekly_submissions(week_start_date desc)
  where deleted_at is null;

create or replace function public.submit_client_reports_atomic(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  target public.weekly_client_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct report_id
    from unnest(coalesce(p_report_ids, array[]::uuid[])) as selected(report_id)
  ) selected;

  if expected_count = 0 then
    raise exception '확정할 화주별 자료를 선택하세요.';
  end if;

  for target in
    select *
    from public.weekly_client_reports
    where id = any(p_report_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if not public.can_access_department(target.department_id) then
      raise exception '처리 권한이 없습니다.';
    end if;

    if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
      raise exception '검토요청 권한이 없습니다.';
    end if;

    if actor_role = 'client_owner'
      and (target.created_by <> actor_id or not public.is_assigned_client(target.client_id)) then
      raise exception '배정된 본인 자료만 검토요청할 수 있습니다.';
    end if;

    if target.status not in ('draft', 'rejected') then
      raise exception '저장 또는 반려 상태의 자료만 확정할 수 있습니다.';
    end if;

    update public.weekly_client_reports
    set status = 'submitted',
        submitted_at = now(),
        review_comment = '확정',
        updated_by = actor_id,
        updated_at = now()
    where id = target.id;

    insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
    values ('client_report', target.id, '검토요청', target.status::text, 'submitted', '확정', actor_id);
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 자료 중 조회할 수 없는 자료가 있습니다.';
  end if;

  return jsonb_build_object('ok', true, 'count', found_count);
end;
$$;

grant execute on function public.submit_client_reports_atomic(uuid[]) to authenticated;

create or replace function public.cancel_client_reports_submission_atomic(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  target public.weekly_client_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct report_id
    from unnest(coalesce(p_report_ids, array[]::uuid[])) as selected(report_id)
  ) selected;

  if expected_count = 0 then
    raise exception '확정취소할 화주별 자료를 선택하세요.';
  end if;

  for target in
    select *
    from public.weekly_client_reports
    where id = any(p_report_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if not public.can_access_department(target.department_id) then
      raise exception '처리 권한이 없습니다.';
    end if;

    if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
      raise exception '확정취소 권한이 없습니다.';
    end if;

    if actor_role = 'client_owner'
      and (target.created_by <> actor_id or not public.is_assigned_client(target.client_id)) then
      raise exception '배정된 본인 자료만 확정취소할 수 있습니다.';
    end if;

    if target.status <> 'submitted' then
      raise exception '확정 상태의 자료만 확정취소할 수 있습니다.';
    end if;

    update public.weekly_client_reports
    set status = 'draft',
        submitted_at = null,
        review_comment = '확정취소',
        updated_by = actor_id,
        updated_at = now()
    where id = target.id;

    insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
    values ('client_report', target.id, '확정취소', target.status::text, 'draft', '확정취소', actor_id);
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 자료 중 조회할 수 없는 자료가 있습니다.';
  end if;

  return jsonb_build_object('ok', true, 'count', found_count);
end;
$$;

grant execute on function public.cancel_client_reports_submission_atomic(uuid[]) to authenticated;

create or replace function public.soft_delete_client_reports_atomic(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  affected_count integer;
  target public.weekly_client_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct report_id
    from unnest(coalesce(p_report_ids, array[]::uuid[])) as selected(report_id)
  ) selected;

  if expected_count = 0 then
    raise exception '삭제할 화주별 자료를 선택하세요.';
  end if;

  for target in
    select *
    from public.weekly_client_reports
    where id = any(p_report_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if not public.can_access_department(target.department_id) then
      raise exception '처리 권한이 없습니다.';
    end if;

    if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
      raise exception '화주자료 삭제 권한이 없습니다.';
    end if;

    if actor_role = 'client_owner' and not public.is_assigned_client(target.client_id) then
      raise exception '배정된 화주 자료만 처리할 수 있습니다.';
    end if;

    if actor_role = 'client_owner' and target.status not in ('draft', 'rejected') then
      raise exception '화주담당자는 저장 또는 반려 상태의 자료만 삭제할 수 있습니다.';
    end if;

    if actor_role <> 'admin' and target.status = 'approved' then
      raise exception '부서 승인된 자료는 삭제할 수 없습니다.';
    end if;
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 자료 중 조회할 수 없는 자료가 있습니다.';
  end if;

  update public.weekly_client_reports
  set deleted_at = now(),
      deleted_by = actor_id,
      updated_by = actor_id,
      updated_at = now()
  where id = any(p_report_ids)
    and deleted_at is null;

  get diagnostics affected_count = row_count;
  if affected_count <> expected_count then
    raise exception '삭제 중 상태가 변경된 자료가 있습니다. 새로고침 후 다시 시도하세요.';
  end if;

  return jsonb_build_object('ok', true, 'count', affected_count);
end;
$$;

grant execute on function public.soft_delete_client_reports_atomic(uuid[]) to authenticated;

create or replace function public.save_client_report_atomic(
  p_report_id uuid,
  p_department_id uuid,
  p_client_id uuid,
  p_week_start_date date,
  p_week_end_date date,
  p_report_year integer,
  p_report_month integer,
  p_week_of_month integer,
  p_status text,
  p_no_special_issue boolean,
  p_items jsonb,
  p_volumes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  requested public.client_report_status := p_status::public.client_report_status;
  existing public.weekly_client_reports%rowtype;
  duplicate public.weekly_client_reports%rowtype;
  saved_id uuid;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  if requested not in ('draft', 'submitted') then
    raise exception '화주자료 작성 화면에서는 저장 또는 확정만 처리할 수 있습니다.';
  end if;

  if public.client_department_id(p_client_id) is distinct from p_department_id then
    raise exception '화주와 부서가 일치하지 않습니다.';
  end if;

  if actor_role <> 'admin' and actor_department_id is distinct from p_department_id then
    raise exception '소속 부서 자료만 처리할 수 있습니다.';
  end if;

  if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
    raise exception '화주자료 저장 권한이 없습니다.';
  end if;

  if actor_role = 'client_owner' and not public.is_assigned_client(p_client_id) then
    raise exception '배정된 화주 자료만 작성할 수 있습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('client-report:' || p_client_id::text || ':' || p_week_start_date::text, 0));

  if p_report_id is not null then
    select * into existing
    from public.weekly_client_reports
    where id = p_report_id and deleted_at is null
    for update;

    if not found then
      raise exception '수정할 화주별 자료를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 선택하세요.';
    end if;

    if actor_role <> 'admin' and actor_department_id is distinct from existing.department_id then
      raise exception '소속 부서 자료만 처리할 수 있습니다.';
    end if;

    if actor_role = 'client_owner' and not public.is_assigned_client(existing.client_id) then
      raise exception '배정된 화주 자료만 처리할 수 있습니다.';
    end if;

    if existing.status not in ('draft', 'rejected') then
      raise exception '확정 또는 승인된 자료는 수정할 수 없습니다.';
    end if;

    select * into duplicate
    from public.weekly_client_reports
    where client_id = p_client_id
      and week_start_date = p_week_start_date
      and id <> p_report_id
      and deleted_at is null
    for update;

    if found then
      raise exception '선택한 화주와 주차에는 이미 화주별 자료가 등록되어 있습니다.';
    end if;

    update public.weekly_client_reports
    set department_id = p_department_id,
        client_id = p_client_id,
        week_start_date = p_week_start_date,
        week_end_date = p_week_end_date,
        report_year = p_report_year,
        report_month = p_report_month,
        week_of_month = p_week_of_month,
        status = requested,
        no_special_issue = p_no_special_issue,
        submitted_at = case when requested = 'submitted' then now() else null end,
        review_comment = case when requested = 'submitted' then '검토요청' else review_comment end,
        updated_by = actor_id,
        updated_at = now()
    where id = existing.id
    returning id into saved_id;
  else
    select * into existing
    from public.weekly_client_reports
    where client_id = p_client_id
      and week_start_date = p_week_start_date
      and deleted_at is null
    for update;

    if found then
      raise exception '선택한 화주와 주차에는 이미 화주별 자료가 등록되어 있습니다.';
    end if;

    insert into public.weekly_client_reports(
      department_id,
      client_id,
      week_start_date,
      week_end_date,
      report_year,
      report_month,
      week_of_month,
      status,
      no_special_issue,
      submitted_at,
      review_comment,
      created_by,
      updated_by
    )
    values (
      p_department_id,
      p_client_id,
      p_week_start_date,
      p_week_end_date,
      p_report_year,
      p_report_month,
      p_week_of_month,
      requested,
      p_no_special_issue,
      case when requested = 'submitted' then now() else null end,
      case when requested = 'submitted' then '검토요청' else null end,
      actor_id,
      actor_id
    )
    returning id into saved_id;
  end if;

  delete from public.weekly_client_report_items where report_id = saved_id;
  delete from public.weekly_volumes where report_id = saved_id;

  insert into public.weekly_client_report_items(report_id, item_period, importance, work_category_id, title, content, sort_order)
  select
    saved_id,
    item_period::public.item_period,
    importance::public.importance_level,
    work_category_id,
    title,
    content,
    sort_order
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
    item_period text,
    importance text,
    work_category_id uuid,
    title text,
    content text,
    sort_order integer
  );

  insert into public.weekly_volumes(report_id, volume_type, quantity, unit, custom_unit, note, sort_order)
  select
    saved_id,
    volume_type::public.volume_type,
    quantity,
    unit::public.volume_unit,
    nullif(custom_unit, ''),
    nullif(note, ''),
    sort_order
  from jsonb_to_recordset(coalesce(p_volumes, '[]'::jsonb)) as volume(
    volume_type text,
    quantity numeric,
    unit text,
    custom_unit text,
    note text,
    sort_order integer
  );

  if requested = 'submitted' then
    insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
    values (
      'client_report',
      saved_id,
      '검토요청',
      coalesce(existing.status::text, 'draft'),
      'submitted',
      '검토요청',
      actor_id
    );
  end if;

  return jsonb_build_object('ok', true, 'id', saved_id, 'status', requested);
end;
$$;

grant execute on function public.save_client_report_atomic(uuid, uuid, uuid, date, date, integer, integer, integer, text, boolean, jsonb, jsonb) to authenticated;

-- 021_notice_comments.sql
create table if not exists public.notice_comments (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices(id) on delete cascade,
  parent_id uuid references public.notice_comments(id) on delete cascade,
  content text not null check (length(btrim(content)) > 0),
  author_name text not null,
  author_department_name text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create or replace function public.ensure_notice_comment_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_notice_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.notice_id = old.notice_id
    and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;

  if new.parent_id is null then
    return new;
  end if;

  select notice_id into parent_notice_id
  from public.notice_comments
  where id = new.parent_id
    and deleted_at is null;

  if parent_notice_id is null then
    raise exception '답글 대상 댓글을 찾을 수 없습니다.';
  end if;

  if parent_notice_id <> new.notice_id then
    raise exception '같은 게시글의 댓글에만 답글을 등록할 수 있습니다.';
  end if;

  return new;
end;
$$;

create or replace function public.protect_notice_comment_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.deleted_at is not null then
    raise exception '삭제된 댓글은 수정할 수 없습니다.';
  end if;

  if new.notice_id <> old.notice_id
    or new.parent_id is distinct from old.parent_id
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
    or new.author_name <> old.author_name
    or new.author_department_name is distinct from old.author_department_name then
    raise exception '댓글의 작성자와 연결 정보는 변경할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists notice_comments_set_updated_at on public.notice_comments;
create trigger notice_comments_set_updated_at
  before update on public.notice_comments
  for each row execute function public.set_updated_at();

drop trigger if exists notice_comments_protect_immutable on public.notice_comments;
create trigger notice_comments_protect_immutable
  before update on public.notice_comments
  for each row execute function public.protect_notice_comment_immutable_fields();

drop trigger if exists notice_comments_ensure_parent on public.notice_comments;
create trigger notice_comments_ensure_parent
  before insert or update on public.notice_comments
  for each row execute function public.ensure_notice_comment_parent();

alter table public.notice_comments enable row level security;

drop policy if exists "notice_comments_select_active_notice" on public.notice_comments;
create policy "notice_comments_select_active_notice" on public.notice_comments
  for select to authenticated using (
    deleted_at is null
    and exists (
      select 1
      from public.notices n
      where n.id = notice_id
        and n.deleted_at is null
        and n.is_active = true
    )
  );

drop policy if exists "notice_comments_insert_authenticated" on public.notice_comments;
create policy "notice_comments_insert_authenticated" on public.notice_comments
  for insert to authenticated with check (
    created_by = auth.uid()
    and deleted_at is null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
    )
    and exists (
      select 1
      from public.notices n
      where n.id = notice_id
        and n.deleted_at is null
        and n.is_active = true
    )
  );

drop policy if exists "notice_comments_update_owner_or_admin" on public.notice_comments;
create policy "notice_comments_update_owner_or_admin" on public.notice_comments
  for update to authenticated using (
    deleted_at is null
    and (created_by = auth.uid() or public.is_admin())
  ) with check (
    created_by = auth.uid() or public.is_admin()
  );

create index if not exists notice_comments_notice_created_idx
  on public.notice_comments(notice_id, created_at)
  where deleted_at is null;

create index if not exists notice_comments_parent_created_idx
  on public.notice_comments(parent_id, created_at)
  where deleted_at is null;

create index if not exists notice_comments_created_by_idx
  on public.notice_comments(created_by)
  where deleted_at is null;

create or replace function public.save_department_submission_atomic(
  p_submission_id uuid,
  p_department_id uuid,
  p_week_start_date date,
  p_week_end_date date,
  p_report_year integer,
  p_report_month integer,
  p_week_of_month integer,
  p_status text,
  p_exception_reason text,
  p_contents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  requested public.department_submission_status := p_status::public.department_submission_status;
  target public.department_weekly_submissions%rowtype;
  saved_id uuid;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  if actor_role <> 'admin' and actor_department_id is distinct from p_department_id then
    raise exception '소속 부서 자료만 처리할 수 있습니다.';
  end if;

  if actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '부서자료 저장 권한이 없습니다.';
  end if;

  if requested = 'submitted_to_division' and actor_role not in ('admin', 'department_head') then
    raise exception '부서 최종 제출은 부서장과 관리자만 가능합니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('department-submission:' || p_department_id::text || ':' || p_week_start_date::text, 0));

  if p_submission_id is not null then
    select * into target
    from public.department_weekly_submissions
    where id = p_submission_id and deleted_at is null
    for update;

    if not found then
      raise exception '수정할 부서자료를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 선택하세요.';
    end if;
  else
    select * into target
    from public.department_weekly_submissions
    where department_id = p_department_id
      and week_start_date = p_week_start_date
      and deleted_at is null
    for update;
  end if;

  if found then
    if actor_role <> 'admin' and actor_department_id is distinct from target.department_id then
      raise exception '소속 부서 자료만 처리할 수 있습니다.';
    end if;

    if target.status not in ('draft', 'division_rejected') then
      raise exception '확정 또는 승인된 부서자료는 수정할 수 없습니다.';
    end if;

    update public.department_weekly_submissions
    set department_id = p_department_id,
        week_start_date = p_week_start_date,
        week_end_date = p_week_end_date,
        report_year = p_report_year,
        report_month = p_report_month,
        week_of_month = p_week_of_month,
        status = case when requested = 'submitted_to_division' then 'draft'::public.department_submission_status else requested end,
        exception_reason = p_exception_reason,
        finalized_by = case when requested = 'submitted_to_division' then finalized_by else null end,
        finalized_at = case when requested = 'submitted_to_division' then finalized_at else null end,
        updated_at = now()
    where id = target.id
    returning id into saved_id;
  else
    insert into public.department_weekly_submissions(
      department_id,
      week_start_date,
      week_end_date,
      report_year,
      report_month,
      week_of_month,
      status,
      exception_reason
    )
    values (
      p_department_id,
      p_week_start_date,
      p_week_end_date,
      p_report_year,
      p_report_month,
      p_week_of_month,
      case when requested = 'submitted_to_division' then 'draft'::public.department_submission_status else requested end,
      p_exception_reason
    )
    returning id into saved_id;
  end if;

  insert into public.department_weekly_contents(
    submission_id,
    section_type,
    current_week_content,
    next_week_content,
    current_importance,
    current_work_category_id,
    next_importance,
    next_work_category_id,
    created_by,
    updated_by
  )
  select
    saved_id,
    section_type::public.department_section_type,
    coalesce(current_week_content, ''),
    coalesce(next_week_content, ''),
    current_importance::public.importance_level,
    current_work_category_id,
    next_importance::public.importance_level,
    next_work_category_id,
    actor_id,
    actor_id
  from jsonb_to_recordset(coalesce(p_contents, '[]'::jsonb)) as content(
    section_type text,
    current_week_content text,
    next_week_content text,
    current_importance text,
    current_work_category_id uuid,
    next_importance text,
    next_work_category_id uuid
  )
  on conflict (submission_id, section_type) do update
  set current_week_content = excluded.current_week_content,
      next_week_content = excluded.next_week_content,
      current_importance = excluded.current_importance,
      current_work_category_id = excluded.current_work_category_id,
      next_importance = excluded.next_importance,
      next_work_category_id = excluded.next_work_category_id,
      updated_by = actor_id,
      updated_at = now();

  if requested = 'submitted_to_division' then
    perform public.transition_department_submission_status(saved_id, 'submitted_to_division', coalesce(p_exception_reason, '사업부 검토요청'));
  end if;

  return jsonb_build_object('ok', true, 'id', saved_id, 'status', requested);
end;
$$;

grant execute on function public.save_department_submission_atomic(uuid, uuid, date, date, integer, integer, integer, text, text, jsonb) to authenticated;

-- supabase/migrations/019_bulk_import_clients_atomic.sql

create or replace function public.bulk_import_clients_atomic(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  input_count integer := 0;
  normalized_count integer := 0;
  existing_count integer := 0;
  duplicate_count integer := 0;
  invalid_row_numbers text;
begin
  if actor_id is null or actor_role <> 'admin' then
    raise exception '관리자만 처리할 수 있습니다.';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '일괄등록 데이터를 확인하세요.';
  end if;

  select count(*) into input_count
  from jsonb_array_elements(p_rows);

  if input_count = 0 then
    raise exception '등록할 화주가 없습니다.';
  end if;

  if input_count > 2000 then
    raise exception '한 번에 2000건까지 등록할 수 있습니다.';
  end if;

  drop table if exists pg_temp.bulk_import_clients_raw;
  create temporary table bulk_import_clients_raw (
    ord bigint not null,
    client_code text not null,
    client_name text not null,
    notes text
  ) on commit drop;

  insert into bulk_import_clients_raw (ord, client_code, client_name, notes)
  select ord, client_code, client_name, nullif(notes, '')
  from (
    select
      item.ord,
      btrim(coalesce(item.value->>'client_code', '')) as client_code,
      btrim(coalesce(item.value->>'client_name', '')) as client_name,
      btrim(coalesce(item.value->>'notes', '')) as notes
    from jsonb_array_elements(p_rows) with ordinality as item(value, ord)
  ) parsed
  where client_code <> '' or client_name <> '' or notes <> '';

  if not exists (select 1 from bulk_import_clients_raw) then
    raise exception '등록할 화주가 없습니다.';
  end if;

  select string_agg(ord::text, ', ' order by ord)
    into invalid_row_numbers
  from bulk_import_clients_raw
  where client_code = '' or client_name = '';

  if invalid_row_numbers is not null then
    raise exception '%행의 화주코드와 화주명을 입력하세요.', invalid_row_numbers;
  end if;

  drop table if exists pg_temp.bulk_import_clients_normalized;
  create temporary table bulk_import_clients_normalized as
  select distinct on (client_code)
    client_code,
    client_name,
    notes
  from bulk_import_clients_raw
  order by client_code, ord desc;

  select count(*) into normalized_count from bulk_import_clients_normalized;
  duplicate_count := input_count - normalized_count;

  select count(*)
    into existing_count
  from bulk_import_clients_normalized n
  join public.clients c on c.client_code = n.client_code;

  insert into public.clients (
    client_code,
    client_name,
    notes,
    created_by,
    updated_by
  )
  select
    client_code,
    client_name,
    notes,
    actor_id,
    actor_id
  from bulk_import_clients_normalized
  on conflict (client_code) do update
    set client_name = excluded.client_name,
        notes = excluded.notes,
        updated_by = actor_id,
        updated_at = now();

  return jsonb_build_object(
    'total_count', normalized_count,
    'inserted_count', normalized_count - existing_count,
    'updated_count', existing_count,
    'duplicate_count', duplicate_count
  );
end;
$$;

revoke all on function public.bulk_import_clients_atomic(jsonb) from public;
grant execute on function public.bulk_import_clients_atomic(jsonb) to authenticated;

-- supabase/migrations/020_department_client_links.sql

create table if not exists public.department_client_links (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (department_id, client_id)
);

alter table public.client_assignments
  add column if not exists department_id uuid references public.departments(id) on delete cascade;

alter table public.client_assignments
  drop constraint if exists client_assignments_client_id_user_id_key;

alter table public.department_client_links enable row level security;

drop policy if exists "department_client_links_select_accessible" on public.department_client_links;
create policy "department_client_links_select_accessible" on public.department_client_links
  for select to authenticated using (public.can_access_department(department_id));

drop policy if exists "department_client_links_admin_insert" on public.department_client_links;
create policy "department_client_links_admin_insert" on public.department_client_links
  for insert to authenticated with check (public.is_admin());

drop policy if exists "department_client_links_admin_update" on public.department_client_links;
create policy "department_client_links_admin_update" on public.department_client_links
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "department_client_links_department_leads_insert" on public.department_client_links;
create policy "department_client_links_department_leads_insert" on public.department_client_links
  for insert to authenticated with check (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = department_id
  );

drop policy if exists "department_client_links_department_leads_update" on public.department_client_links;
create policy "department_client_links_department_leads_update" on public.department_client_links
  for update to authenticated using (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = department_id
  ) with check (
    public.current_app_role() in ('department_head', 'manager')
    and public.current_department_id() = department_id
  );

drop policy if exists "clients_select_accessible_department" on public.clients;
create policy "clients_select_accessible_department" on public.clients
  for select to authenticated using (
    public.is_admin()
    or public.can_access_department(department_id)
    or exists (
      select 1
      from public.department_client_links dcl
      where dcl.client_id = id
        and dcl.is_active = true
        and public.can_access_department(dcl.department_id)
    )
  );

drop index if exists public.client_assignments_primary_active_uidx;
create unique index if not exists client_assignments_department_primary_active_uidx
  on public.client_assignments(department_id, client_id)
  where is_active = true and is_primary = true and department_id is not null;

create index if not exists department_client_links_department_idx
  on public.department_client_links(department_id, is_active);

create index if not exists department_client_links_client_idx
  on public.department_client_links(client_id, is_active);

create unique index if not exists client_assignments_department_client_user_uidx
  on public.client_assignments(department_id, client_id, user_id);

drop index if exists public.weekly_client_reports_client_week_active_uidx;
create unique index if not exists weekly_client_reports_department_client_week_active_uidx
  on public.weekly_client_reports(department_id, client_id, week_start_date)
  where deleted_at is null;

create or replace function public.is_department_client(target_department_id uuid, target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.department_client_links dcl
    join public.clients c on c.id = dcl.client_id
    where dcl.department_id = target_department_id
      and dcl.client_id = target_client_id
      and dcl.is_active = true
      and c.is_active = true
  );
$$;

create or replace function public.is_assigned_department_client(target_department_id uuid, target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.client_assignments ca
    join public.profiles p on p.id = ca.user_id
    where ca.department_id = target_department_id
      and ca.client_id = target_client_id
      and ca.user_id = auth.uid()
      and ca.is_active = true
      and p.department_id = target_department_id
      and p.is_active = true
  );
$$;

create or replace function public.is_assigned_client(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_assigned_department_client(public.current_department_id(), target_client_id);
$$;

create or replace function public.can_write_client_report(target_department_id uuid, target_client_id uuid, target_status public.client_report_status)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_department_client(target_department_id, target_client_id)
    and (
      public.current_app_role() = 'admin'
      or public.current_department_id() = target_department_id
    )
    and (
      public.current_app_role() in ('admin', 'department_head', 'manager')
      or (
        public.current_app_role() = 'client_owner'
        and public.is_assigned_department_client(target_department_id, target_client_id)
      )
    )
    and target_status in ('draft', 'rejected');
$$;

create or replace function public.save_client_report_atomic(
  p_report_id uuid,
  p_department_id uuid,
  p_client_id uuid,
  p_week_start_date date,
  p_week_end_date date,
  p_report_year integer,
  p_report_month integer,
  p_week_of_month integer,
  p_status text,
  p_no_special_issue boolean,
  p_items jsonb,
  p_volumes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  requested public.client_report_status := p_status::public.client_report_status;
  existing public.weekly_client_reports%rowtype;
  duplicate public.weekly_client_reports%rowtype;
  saved_id uuid;
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if requested not in ('draft', 'submitted') then
    raise exception '화주자료 작성 화면에서는 저장 또는 확정만 처리할 수 있습니다.';
  end if;

  if not public.is_department_client(p_department_id, p_client_id) then
    raise exception '해당 부서에 등록된 화주만 처리할 수 있습니다.';
  end if;

  if actor_role <> 'admin' and actor_department_id is distinct from p_department_id then
    raise exception '소속 부서 자료만 처리할 수 있습니다.';
  end if;

  if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
    raise exception '화주자료 저장 권한이 없습니다.';
  end if;

  if actor_role = 'client_owner' and not public.is_assigned_department_client(p_department_id, p_client_id) then
    raise exception '배정된 화주 자료만 처리할 수 있습니다.';
  end if;

  if requested = 'submitted' and (p_no_special_issue is false) and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception '확정하려면 실시사항 또는 예정사항을 1개 이상 입력하세요.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('client-report:' || p_client_id::text || ':' || p_week_start_date::text, 0));

  if p_report_id is not null then
    select *
      into existing
    from public.weekly_client_reports
    where id = p_report_id
      and deleted_at is null
    for update;

    if not found then
      raise exception '화주자료를 찾을 수 없습니다.';
    end if;

    if existing.status not in ('draft', 'rejected') then
      raise exception '확정된 화주자료는 확정취소 후 수정할 수 있습니다.';
    end if;

    if existing.department_id <> p_department_id or existing.client_id <> p_client_id then
      raise exception '수정 대상 화주자료가 일치하지 않습니다.';
    end if;
  else
    select *
      into duplicate
    from public.weekly_client_reports
    where client_id = p_client_id
      and department_id = p_department_id
      and week_start_date = p_week_start_date
      and deleted_at is null
    for update;

    if found then
      if duplicate.status not in ('draft', 'rejected') then
        raise exception '이미 확정된 화주자료가 있습니다. 확정취소 후 수정하세요.';
      end if;
      existing := duplicate;
    end if;
  end if;

  if existing.id is not null then
    update public.weekly_client_reports
    set department_id = p_department_id,
        client_id = p_client_id,
        week_start_date = p_week_start_date,
        week_end_date = p_week_end_date,
        report_year = p_report_year,
        report_month = p_report_month,
        week_of_month = p_week_of_month,
        status = case when requested = 'submitted' then 'draft'::public.client_report_status else requested end,
        no_special_issue = p_no_special_issue,
        updated_by = actor_id,
        updated_at = now()
    where id = existing.id
    returning id into saved_id;
  else
    insert into public.weekly_client_reports(
      department_id,
      client_id,
      week_start_date,
      week_end_date,
      report_year,
      report_month,
      week_of_month,
      status,
      no_special_issue,
      created_by,
      updated_by
    )
    values (
      p_department_id,
      p_client_id,
      p_week_start_date,
      p_week_end_date,
      p_report_year,
      p_report_month,
      p_week_of_month,
      case when requested = 'submitted' then 'draft'::public.client_report_status else requested end,
      p_no_special_issue,
      actor_id,
      actor_id
    )
    returning id into saved_id;
  end if;

  delete from public.weekly_client_report_items where report_id = saved_id;
  delete from public.weekly_volumes where report_id = saved_id;

  insert into public.weekly_client_report_items(
    report_id,
    item_period,
    importance,
    work_category_id,
    title,
    content,
    sort_order
  )
  select
    saved_id,
    item_period::public.item_period,
    importance::public.importance_level,
    work_category_id,
    title,
    content,
    sort_order
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
    item_period text,
    importance text,
    work_category_id uuid,
    title text,
    content text,
    sort_order integer
  );

  insert into public.weekly_volumes(
    report_id,
    volume_type,
    quantity,
    unit,
    custom_unit,
    note,
    sort_order
  )
  select
    saved_id,
    volume_type::public.volume_type,
    quantity,
    unit::public.volume_unit,
    custom_unit,
    note,
    sort_order
  from jsonb_to_recordset(coalesce(p_volumes, '[]'::jsonb)) as volume(
    volume_type text,
    quantity numeric,
    unit text,
    custom_unit text,
    note text,
    sort_order integer
  );

  if requested = 'submitted' then
    perform public.transition_client_report_status(saved_id, 'submitted', '확정');
  end if;

  return jsonb_build_object('ok', true, 'id', saved_id, 'status', requested);
end;
$$;

grant execute on function public.is_department_client(uuid, uuid) to authenticated;
grant execute on function public.is_assigned_department_client(uuid, uuid) to authenticated;
grant execute on function public.is_assigned_client(uuid) to authenticated;
grant execute on function public.can_write_client_report(uuid, uuid, public.client_report_status) to authenticated;
grant execute on function public.save_client_report_atomic(uuid, uuid, uuid, date, date, integer, integer, integer, text, boolean, jsonb, jsonb) to authenticated;

-- 022_report_item_requests.sql
create table if not exists public.weekly_report_item_requests (
  id uuid primary key default gen_random_uuid(),
  report_item_id uuid not null references public.weekly_client_report_items(id) on delete cascade,
  request_content text not null check (length(btrim(request_content)) > 0),
  request_author_name text not null,
  request_author_department_name text,
  result_content text,
  result_author_name text,
  result_author_department_name text,
  result_created_by uuid references auth.users(id),
  result_created_at timestamptz,
  result_updated_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create index if not exists idx_weekly_report_item_requests_item
  on public.weekly_report_item_requests(report_item_id)
  where deleted_at is null;

create index if not exists idx_weekly_report_item_requests_created
  on public.weekly_report_item_requests(created_at);

drop trigger if exists weekly_report_item_requests_set_updated_at on public.weekly_report_item_requests;
create trigger weekly_report_item_requests_set_updated_at
before update on public.weekly_report_item_requests
for each row execute function public.set_updated_at();

alter table public.weekly_report_item_requests enable row level security;

drop policy if exists "weekly_report_item_requests_select_scope" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_select_scope" on public.weekly_report_item_requests
for select using (
  deleted_at is null
  and exists (
    select 1
    from public.weekly_client_report_items item
    join public.weekly_client_reports report on report.id = item.report_id
    where item.id = weekly_report_item_requests.report_item_id
      and report.deleted_at is null
      and (
        public.is_admin()
        or report.department_id = public.current_department_id()
      )
  )
);

drop policy if exists "weekly_report_item_requests_insert_scope" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_insert_scope" on public.weekly_report_item_requests
for insert with check (
  auth.uid() = created_by
  and public.current_app_role() in ('admin', 'department_head', 'manager', 'client_owner')
  and exists (
    select 1
    from public.weekly_client_report_items item
    join public.weekly_client_reports report on report.id = item.report_id
    where item.id = weekly_report_item_requests.report_item_id
      and report.deleted_at is null
      and (
        public.is_admin()
        or report.department_id = public.current_department_id()
      )
  )
);

drop policy if exists "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests
for update using (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
  )
) with check (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
  )
);

-- 027_performance_rpc_indexes.sql
-- Performance pass: keep RLS enabled, reduce repeated round trips, and add lookup indexes.

create index if not exists departments_active_sort_name_idx
  on public.departments(is_active, sort_order, department_name, id);

create index if not exists clients_active_name_idx
  on public.clients(is_active, client_name, id);

create index if not exists department_client_links_active_department_client_idx
  on public.department_client_links(is_active, department_id, client_id);

create index if not exists profiles_department_active_name_idx
  on public.profiles(department_id, is_active, full_name, id);

create index if not exists weekly_client_reports_week_department_client_active_idx
  on public.weekly_client_reports(week_start_date, department_id, client_id, updated_at desc)
  where deleted_at is null;

create index if not exists weekly_client_report_items_report_importance_period_idx
  on public.weekly_client_report_items(report_id, importance, item_period, sort_order);

create index if not exists weekly_client_report_items_importance_report_idx
  on public.weekly_client_report_items(importance, report_id)
  where importance in ('very_high', 'high');

create index if not exists weekly_report_item_requests_target_active_idx
  on public.weekly_report_item_requests(target_key, created_at)
  where deleted_at is null;

create index if not exists department_weekly_contents_submission_section_active_idx
  on public.department_weekly_contents(submission_id, section_type)
  where deleted_at is null;

create or replace function public.get_header_filter_options()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  department_scope uuid := null;
begin
  if actor_id is null or actor_role is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if actor_role <> 'admin' then
    department_scope := actor_department_id;
  end if;

  return jsonb_build_object(
    'departments',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'department_name', d.department_name
          )
          order by d.department_name
        )
        from public.departments d
        where d.is_active = true
          and (department_scope is null or d.id = department_scope)
      ),
      '[]'::jsonb
    ),
    'clients',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'client_name', c.client_name,
            'department_id', dcl.department_id
          )
          order by c.client_name
        )
        from public.department_client_links dcl
        join public.clients c on c.id = dcl.client_id
        where dcl.is_active = true
          and c.is_active = true
          and (department_scope is null or dcl.department_id = department_scope)
      ),
      '[]'::jsonb
    ),
    'assignedClientIds',
    case
      when actor_role = 'client_owner' then
        coalesce(
          (
            select jsonb_agg(ca.client_id order by ca.client_id)
            from public.client_assignments ca
            where ca.user_id = actor_id
              and ca.is_active = true
              and (department_scope is null or ca.department_id = department_scope)
          ),
          '[]'::jsonb
        )
      else '[]'::jsonb
    end
  );
end;
$$;

revoke all on function public.get_header_filter_options() from public;
grant execute on function public.get_header_filter_options() to authenticated;

-- 028_notice_author_delete_rpc.sql
-- Allow notice authors to soft delete their own notices through a narrow RPC.
-- RLS stays enabled; the function validates ownership/admin role before updating.

create index if not exists notices_created_by_active_idx
  on public.notices(created_by, created_at desc)
  where deleted_at is null;

create or replace function public.soft_delete_notices_atomic(p_notice_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  affected_count integer := 0;
  target public.notices%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct notice_id
    from unnest(coalesce(p_notice_ids, array[]::uuid[])) as selected(notice_id)
  ) selected;

  if expected_count = 0 then
    raise exception '삭제할 게시글을 선택하세요.';
  end if;

  for target in
    select *
    from public.notices
    where id = any(p_notice_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if actor_role <> 'admin' and target.created_by is distinct from actor_id then
      raise exception '본인이 작성한 게시글만 삭제할 수 있습니다.';
    end if;
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 게시글 중 삭제할 수 없는 게시글이 있습니다.';
  end if;

  update public.notices
  set deleted_at = now(),
      deleted_by = actor_id,
      is_active = false,
      updated_by = actor_id,
      updated_at = now()
  where id = any(p_notice_ids)
    and deleted_at is null
    and (actor_role = 'admin' or created_by = actor_id);

  get diagnostics affected_count = row_count;
  if affected_count <> expected_count then
    raise exception '선택한 게시글 중 삭제할 수 없는 게시글이 있습니다.';
  end if;

  return jsonb_build_object('ok', true, 'count', affected_count);
end;
$$;

revoke all on function public.soft_delete_notices_atomic(uuid[]) from public;
grant execute on function public.soft_delete_notices_atomic(uuid[]) to authenticated;

-- 026_report_item_request_closure.sql
alter table public.weekly_report_item_requests
  add column if not exists closed_by uuid references auth.users(id),
  add column if not exists closed_author_name text,
  add column if not exists closed_author_department_name text,
  add column if not exists closed_at timestamptz;

create index if not exists idx_weekly_report_item_requests_closed
  on public.weekly_report_item_requests(closed_at)
  where deleted_at is null and closed_at is not null;

drop policy if exists "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests
for update using (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
) with check (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
);

-- 026_report_item_request_closure.sql
alter table public.weekly_report_item_requests
  add column if not exists closed_by uuid references auth.users(id),
  add column if not exists closed_author_name text,
  add column if not exists closed_author_department_name text,
  add column if not exists closed_at timestamptz;

create index if not exists idx_weekly_report_item_requests_closed
  on public.weekly_report_item_requests(closed_at)
  where deleted_at is null and closed_at is not null;

drop policy if exists "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests
for update using (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
) with check (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
);

-- 026_report_item_request_closure.sql
alter table public.weekly_report_item_requests
  add column if not exists closed_by uuid references auth.users(id),
  add column if not exists closed_author_name text,
  add column if not exists closed_author_department_name text,
  add column if not exists closed_at timestamptz;

create index if not exists idx_weekly_report_item_requests_closed
  on public.weekly_report_item_requests(closed_at)
  where deleted_at is null and closed_at is not null;

drop policy if exists "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests
for update using (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
) with check (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
);

-- 024_confirmation_cancel_window.sql
create or replace function public.cancel_client_reports_submission_atomic(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  target public.weekly_client_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct report_id
    from unnest(coalesce(p_report_ids, array[]::uuid[])) as selected(report_id)
  ) selected;

  if expected_count = 0 then
    raise exception '확정취소할 화주별 자료를 선택하세요.';
  end if;

  for target in
    select *
    from public.weekly_client_reports
    where id = any(p_report_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if not public.can_access_department(target.department_id) then
      raise exception '처리 권한이 없습니다.';
    end if;

    if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
      raise exception '확정취소 권한이 없습니다.';
    end if;

    if actor_role = 'client_owner'
      and (target.created_by <> actor_id or not public.is_assigned_client(target.client_id)) then
      raise exception '배정된 본인 자료만 확정취소할 수 있습니다.';
    end if;

    if target.status <> 'submitted' then
      raise exception '확정 상태의 자료만 확정취소할 수 있습니다.';
    end if;

    if target.submitted_at is not null and now() > target.submitted_at + interval '3 days' then
      raise exception '확정 후 3일이 지난 화주자료는 확정취소할 수 없습니다.';
    end if;

    update public.weekly_client_reports
    set status = 'draft',
        submitted_at = null,
        review_comment = '확정취소',
        updated_by = actor_id,
        updated_at = now()
    where id = target.id;

    insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
    values ('client_report', target.id, '확정취소', target.status::text, 'draft', '확정취소', actor_id);
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 자료 중 조회할 수 없는 자료가 있습니다.';
  end if;

  return jsonb_build_object('ok', true, 'count', found_count);
end;
$$;

grant execute on function public.cancel_client_reports_submission_atomic(uuid[]) to authenticated;

create or replace function public.cancel_department_submission_atomic(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  target public.department_weekly_submissions%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  if actor_role not in ('admin', 'department_head') then
    raise exception '확정취소는 부서장과 관리자만 가능합니다.';
  end if;

  select * into target
  from public.department_weekly_submissions
  where id = p_submission_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '확정취소할 부서자료를 찾을 수 없습니다.';
  end if;

  if actor_role <> 'admin' and actor_department_id is distinct from target.department_id then
    raise exception '소속 부서 자료만 확정취소할 수 있습니다.';
  end if;

  if target.status <> 'submitted_to_division' then
    raise exception '사업부 검토요청 상태의 부서자료만 확정취소할 수 있습니다.';
  end if;

  if target.finalized_at is not null and now() > target.finalized_at + interval '3 days' then
    raise exception '확정 후 3일이 지난 부서자료는 확정취소할 수 없습니다.';
  end if;

  update public.department_weekly_submissions
  set status = 'draft',
      finalized_by = null,
      finalized_at = null,
      updated_at = now()
  where id = target.id;

  insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
  values ('department_submission', target.id, '확정취소', target.status::text, 'draft', '부서 확정취소', actor_id);

  return jsonb_build_object('ok', true, 'id', target.id, 'status', 'draft');
end;
$$;

grant execute on function public.cancel_department_submission_atomic(uuid) to authenticated;

-- 026_report_item_request_closure.sql
alter table public.weekly_report_item_requests
  add column if not exists closed_by uuid references auth.users(id),
  add column if not exists closed_author_name text,
  add column if not exists closed_author_department_name text,
  add column if not exists closed_at timestamptz;

create index if not exists idx_weekly_report_item_requests_closed
  on public.weekly_report_item_requests(closed_at)
  where deleted_at is null and closed_at is not null;

drop policy if exists "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests
for update using (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
) with check (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
);

-- 025_confirmation_cancel_window_three_days.sql
create or replace function public.cancel_client_reports_submission_atomic(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  target public.weekly_client_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct report_id
    from unnest(coalesce(p_report_ids, array[]::uuid[])) as selected(report_id)
  ) selected;

  if expected_count = 0 then
    raise exception '확정취소할 화주별 자료를 선택하세요.';
  end if;

  for target in
    select *
    from public.weekly_client_reports
    where id = any(p_report_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if not public.can_access_department(target.department_id) then
      raise exception '처리 권한이 없습니다.';
    end if;

    if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
      raise exception '확정취소 권한이 없습니다.';
    end if;

    if actor_role = 'client_owner'
      and (target.created_by <> actor_id or not public.is_assigned_client(target.client_id)) then
      raise exception '배정된 본인 자료만 확정취소할 수 있습니다.';
    end if;

    if target.status <> 'submitted' then
      raise exception '확정 상태의 자료만 확정취소할 수 있습니다.';
    end if;

    if target.submitted_at is not null and now() > target.submitted_at + interval '3 days' then
      raise exception '확정 후 3일이 지난 화주자료는 확정취소할 수 없습니다.';
    end if;

    update public.weekly_client_reports
    set status = 'draft',
        submitted_at = null,
        review_comment = '확정취소',
        updated_by = actor_id,
        updated_at = now()
    where id = target.id;

    insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
    values ('client_report', target.id, '확정취소', target.status::text, 'draft', '확정취소', actor_id);
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 자료 중 조회할 수 없는 자료가 있습니다.';
  end if;

  return jsonb_build_object('ok', true, 'count', found_count);
end;
$$;

grant execute on function public.cancel_client_reports_submission_atomic(uuid[]) to authenticated;

create or replace function public.cancel_department_submission_atomic(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  target public.department_weekly_submissions%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  if actor_role not in ('admin', 'department_head') then
    raise exception '확정취소는 부서장과 관리자만 가능합니다.';
  end if;

  select * into target
  from public.department_weekly_submissions
  where id = p_submission_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '확정취소할 부서자료를 찾을 수 없습니다.';
  end if;

  if actor_role <> 'admin' and actor_department_id is distinct from target.department_id then
    raise exception '소속 부서 자료만 확정취소할 수 있습니다.';
  end if;

  if target.status <> 'submitted_to_division' then
    raise exception '사업부 검토요청 상태의 부서자료만 확정취소할 수 있습니다.';
  end if;

  if target.finalized_at is not null and now() > target.finalized_at + interval '3 days' then
    raise exception '확정 후 3일이 지난 부서자료는 확정취소할 수 없습니다.';
  end if;

  update public.department_weekly_submissions
  set status = 'draft',
      finalized_by = null,
      finalized_at = null,
      updated_at = now()
  where id = target.id;

  insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
  values ('department_submission', target.id, '확정취소', target.status::text, 'draft', '부서 확정취소', actor_id);

  return jsonb_build_object('ok', true, 'id', target.id, 'status', 'draft');
end;
$$;

grant execute on function public.cancel_department_submission_atomic(uuid) to authenticated;

-- 023_common_report_item_requests.sql
alter table public.weekly_report_item_requests
  add column if not exists target_type text not null default 'client_item',
  add column if not exists target_key text,
  add column if not exists department_submission_id uuid references public.department_weekly_submissions(id) on delete cascade,
  add column if not exists section_type public.department_section_type,
  add column if not exists item_period public.item_period,
  add column if not exists item_sort_order integer;

alter table public.weekly_report_item_requests
  alter column report_item_id drop not null;

update public.weekly_report_item_requests
set target_key = report_item_id::text
where target_key is null
  and report_item_id is not null;

alter table public.weekly_report_item_requests
  alter column target_key set not null;

alter table public.weekly_report_item_requests
  drop constraint if exists weekly_report_item_requests_target_check;

alter table public.weekly_report_item_requests
  add constraint weekly_report_item_requests_target_check
  check (
    (
      target_type = 'client_item'
      and report_item_id is not null
      and target_key = report_item_id::text
    )
    or
    (
      target_type = 'department_common'
      and report_item_id is null
      and department_submission_id is not null
      and section_type = 'common'
      and item_period is not null
      and item_sort_order is not null
      and target_key = department_submission_id::text || ':common:' || item_period::text || ':' || item_sort_order::text
    )
  );

create index if not exists idx_weekly_report_item_requests_target_key
  on public.weekly_report_item_requests(target_key)
  where deleted_at is null;

create index if not exists idx_weekly_report_item_requests_common_target
  on public.weekly_report_item_requests(department_submission_id, section_type, item_period, item_sort_order)
  where deleted_at is null
    and target_type = 'department_common';

drop policy if exists "weekly_report_item_requests_select_scope" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_select_scope" on public.weekly_report_item_requests
for select using (
  deleted_at is null
  and (
    (
      target_type = 'client_item'
      and exists (
        select 1
        from public.weekly_client_report_items item
        join public.weekly_client_reports report on report.id = item.report_id
        where item.id = weekly_report_item_requests.report_item_id
          and report.deleted_at is null
          and (
            public.is_admin()
            or report.department_id = public.current_department_id()
          )
      )
    )
    or
    (
      target_type = 'department_common'
      and exists (
        select 1
        from public.department_weekly_submissions submission
        where submission.id = weekly_report_item_requests.department_submission_id
          and submission.deleted_at is null
          and (
            public.is_admin()
            or submission.department_id = public.current_department_id()
          )
      )
    )
  )
);

drop policy if exists "weekly_report_item_requests_insert_scope" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_insert_scope" on public.weekly_report_item_requests
for insert with check (
  auth.uid() = created_by
  and public.current_app_role() in ('admin', 'department_head', 'manager', 'client_owner')
  and (
    (
      target_type = 'client_item'
      and exists (
        select 1
        from public.weekly_client_report_items item
        join public.weekly_client_reports report on report.id = item.report_id
        where item.id = weekly_report_item_requests.report_item_id
          and report.deleted_at is null
          and (
            public.is_admin()
            or report.department_id = public.current_department_id()
          )
      )
    )
    or
    (
      target_type = 'department_common'
      and exists (
        select 1
        from public.department_weekly_submissions submission
        where submission.id = weekly_report_item_requests.department_submission_id
          and submission.deleted_at is null
          and (
            public.is_admin()
            or submission.department_id = public.current_department_id()
          )
      )
    )
  )
);

drop policy if exists "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests
for update using (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
  )
) with check (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
  )
);

-- 029_simplify_permission_helpers.sql
-- Simplify hot permission helpers used by RLS.
-- This keeps the same access rules but avoids nested profile lookups such as
-- can_access_department -> is_admin -> current_app_role.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.app_role = 'admin'
  );
$$;

create or replace function public.can_access_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.app_role = 'admin'
        or p.department_id = target_department_id
      )
  );
$$;

create or replace function public.is_assigned_department_client(target_department_id uuid, target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.client_assignments ca
      on ca.user_id = p.id
     and ca.department_id = target_department_id
     and ca.client_id = target_client_id
     and ca.is_active = true
    where p.id = auth.uid()
      and p.department_id = target_department_id
      and p.is_active = true
  );
$$;

create or replace function public.is_assigned_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.client_assignments ca
      on ca.user_id = p.id
     and ca.department_id = p.department_id
     and ca.client_id = target_client_id
     and ca.is_active = true
    where p.id = auth.uid()
      and p.is_active = true
  );
$$;

create or replace function public.can_write_client_report(
  target_department_id uuid,
  target_client_id uuid,
  target_status public.client_report_status
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
  actor_department_id uuid;
begin
  select p.app_role, p.department_id
    into actor_role, actor_department_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if actor_role is null then
    return false;
  end if;

  if not public.is_department_client(target_department_id, target_client_id) then
    return false;
  end if;

  if target_status not in ('draft', 'rejected') then
    return false;
  end if;

  if actor_role = 'admin' then
    return true;
  end if;

  if actor_department_id is distinct from target_department_id then
    return false;
  end if;

  if actor_role in ('department_head', 'manager') then
    return true;
  end if;

  if actor_role = 'client_owner' then
    return public.is_assigned_department_client(target_department_id, target_client_id);
  end if;

  return false;
end;
$$;

-- 030_center_masters.sql
create table if not exists public.center_masters (
  id uuid primary key default gen_random_uuid(),
  source_center_id uuid not null unique,
  center_name text not null,
  address text,
  notes text,
  source_status text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  is_active boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

drop trigger if exists center_masters_set_updated_at on public.center_masters;
create trigger center_masters_set_updated_at
before update on public.center_masters
for each row execute function public.set_updated_at();

alter table public.center_masters enable row level security;

drop policy if exists "center_masters_select_master_viewers" on public.center_masters;
create policy "center_masters_select_master_viewers" on public.center_masters
  for select to authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.app_role in ('admin', 'department_head', 'manager')
    )
  );

drop policy if exists "center_masters_admin_insert" on public.center_masters;
create policy "center_masters_admin_insert" on public.center_masters
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "center_masters_admin_update" on public.center_masters;
create policy "center_masters_admin_update" on public.center_masters
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists center_masters_active_name_idx
  on public.center_masters(center_name)
  where is_active = true;
