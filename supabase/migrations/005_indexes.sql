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
