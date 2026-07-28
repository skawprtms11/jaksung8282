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
