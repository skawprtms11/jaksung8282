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
