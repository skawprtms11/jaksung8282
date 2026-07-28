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
