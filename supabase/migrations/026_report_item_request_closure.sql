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
