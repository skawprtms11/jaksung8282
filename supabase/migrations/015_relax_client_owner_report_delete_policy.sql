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
