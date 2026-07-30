create table if not exists public.department_vacancy_records (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id),
  center_master_id uuid not null references public.center_masters(id),
  week_start_date date not null,
  week_end_date date not null,
  report_year integer not null,
  report_month integer not null check (report_month between 1 and 12),
  week_of_month integer not null check (week_of_month between 1 and 6),
  operating_area numeric(14, 2) not null default 0 check (operating_area >= 0),
  simple_storage_area numeric(14, 2) not null default 0 check (simple_storage_area >= 0),
  vacancy_area numeric(14, 2) not null default 0 check (vacancy_area >= 0),
  total_area numeric(14, 2) not null default 0 check (total_area >= 0),
  simple_storage_note text,
  vacancy_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create unique index if not exists department_vacancy_records_unique_active_idx
  on public.department_vacancy_records(department_id, center_master_id, week_start_date)
  where deleted_at is null;

create index if not exists department_vacancy_records_department_month_idx
  on public.department_vacancy_records(department_id, report_year, report_month, week_of_month)
  where deleted_at is null and is_active = true;

create index if not exists department_vacancy_records_trend_idx
  on public.department_vacancy_records(department_id, week_start_date)
  where deleted_at is null and is_active = true;

drop trigger if exists department_vacancy_records_set_updated_at on public.department_vacancy_records;
create trigger department_vacancy_records_set_updated_at
before update on public.department_vacancy_records
for each row execute function public.set_updated_at();

alter table public.department_vacancy_records enable row level security;

drop policy if exists "department_vacancy_records_select_department" on public.department_vacancy_records;
create policy "department_vacancy_records_select_department" on public.department_vacancy_records
  for select to authenticated
  using (deleted_at is null and is_active = true and public.can_access_department(department_id));

drop policy if exists "department_vacancy_records_insert_department_managers" on public.department_vacancy_records;
create policy "department_vacancy_records_insert_department_managers" on public.department_vacancy_records
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.current_app_role() in ('department_head', 'manager')
      and public.current_department_id() = department_id
    )
  );

drop policy if exists "department_vacancy_records_update_department_managers" on public.department_vacancy_records;
create policy "department_vacancy_records_update_department_managers" on public.department_vacancy_records
  for update to authenticated
  using (
    public.is_admin()
    or (
      public.current_app_role() in ('department_head', 'manager')
      and public.current_department_id() = department_id
    )
  )
  with check (
    public.is_admin()
    or (
      public.current_app_role() in ('department_head', 'manager')
      and public.current_department_id() = department_id
    )
  );
