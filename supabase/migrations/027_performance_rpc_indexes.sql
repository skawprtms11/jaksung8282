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
