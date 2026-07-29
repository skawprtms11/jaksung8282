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
