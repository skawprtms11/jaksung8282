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
