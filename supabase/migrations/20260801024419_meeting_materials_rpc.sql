create or replace function public.get_meeting_materials_payload(
  p_tab text,
  p_week_start_date date,
  p_report_year integer,
  p_report_month integer,
  p_week_of_month integer,
  p_department_id uuid default null,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  actor_department_id uuid;
  resolved_department_id uuid;
  previous_year integer;
  previous_month integer;
  departments_json jsonb := '[]'::jsonb;
  clients_json jsonb := '[]'::jsonb;
  reports_json jsonb := '[]'::jsonb;
  open_requests_json jsonb := '[]'::jsonb;
  submissions_json jsonb := '[]'::jsonb;
  work_categories_json jsonb := '[]'::jsonb;
  common_requests_json jsonb := '[]'::jsonb;
  volume_trend_json jsonb := '[]'::jsonb;
  previous_volume_trend_json jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  select p.app_role, p.department_id
    into actor_role, actor_department_id
  from public.profiles p
  where p.id = actor_id
    and p.is_active = true;

  if actor_role is null or actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '회의자료 접근 권한이 없습니다.' using errcode = '42501';
  end if;

  if p_tab not in ('collection', 'materials', 'volumes', 'holiday', 'facility') then
    raise exception '회의자료 탭을 확인하세요.' using errcode = '22023';
  end if;
  if p_report_year not between 2020 and 2100
    or p_report_month not between 1 and 12
    or p_week_of_month not between 1 and 6 then
    raise exception '조회 주차를 확인하세요.' using errcode = '22023';
  end if;

  if actor_role = 'admin' then
    resolved_department_id := p_department_id;
  else
    if p_department_id is not null and p_department_id is distinct from actor_department_id then
      raise exception '다른 부서의 회의자료를 조회할 수 없습니다.' using errcode = '42501';
    end if;
    resolved_department_id := actor_department_id;
  end if;

  if p_tab = 'materials'
    and resolved_department_id is null
    and p_client_id is null then
    select d.id
      into resolved_department_id
    from public.departments d
    where d.is_active = true
    order by
      case when lower(regexp_replace(d.department_name, '\s+', '', 'g')) = 'tpl전략팀' then 0 else 1 end,
      d.sort_order,
      d.department_name
    limit 1;
  end if;

  if resolved_department_id is not null
    and not exists (
      select 1
      from public.departments d
      where d.id = resolved_department_id
        and d.is_active = true
    ) then
    raise exception '조회할 부서를 확인하세요.' using errcode = '22023';
  end if;

  if p_client_id is not null
    and not exists (
      select 1
      from public.department_client_links dcl
      join public.clients c on c.id = dcl.client_id
      where dcl.client_id = p_client_id
        and dcl.is_active = true
        and c.is_active = true
        and (resolved_department_id is null or dcl.department_id = resolved_department_id)
    ) then
    raise exception '조회할 화주를 확인하세요.' using errcode = '22023';
  end if;

  previous_year := case when p_report_month = 1 then p_report_year - 1 else p_report_year end;
  previous_month := case when p_report_month = 1 then 12 else p_report_month - 1 end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', d.id, 'department_name', d.department_name)
      order by d.sort_order, d.department_name
    ),
    '[]'::jsonb
  )
    into departments_json
  from public.departments d
  where d.is_active = true
    and (resolved_department_id is null or d.id = resolved_department_id);

  if p_tab = 'collection' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', dcl.client_id, 'department_id', dcl.department_id)
        order by dcl.department_id, dcl.client_id
      ),
      '[]'::jsonb
    )
      into clients_json
    from public.department_client_links dcl
    join public.clients c on c.id = dcl.client_id and c.is_active = true
    where dcl.is_active = true
      and (resolved_department_id is null or dcl.department_id = resolved_department_id)
      and (p_client_id is null or dcl.client_id = p_client_id);
  end if;

  if p_tab in ('collection', 'materials') then
    select coalesce(jsonb_agg(report_payload order by updated_at desc), '[]'::jsonb)
      into reports_json
    from (
      select
        r.updated_at,
        jsonb_build_object(
          'id', r.id,
          'department_id', r.department_id,
          'client_id', r.client_id,
          'departments', jsonb_build_object('department_name', d.department_name),
          'clients', jsonb_build_object('client_name', c.client_name),
          'weekly_client_report_items', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', item.id,
                  'item_period', item.item_period,
                  'title', item.title,
                  'content', item.content,
                  'importance', item.importance,
                  'work_categories', jsonb_build_object('category_name', wc.category_name),
                  'weekly_report_item_requests', case
                    when p_tab = 'materials' then coalesce(
                      (
                        select jsonb_agg(to_jsonb(req) order by req.created_at)
                        from public.weekly_report_item_requests req
                        where req.report_item_id = item.id
                          and req.deleted_at is null
                      ),
                      '[]'::jsonb
                    )
                    else '[]'::jsonb
                  end
                )
                order by item.sort_order, item.created_at
              )
              from public.weekly_client_report_items item
              left join public.work_categories wc on wc.id = item.work_category_id
              where item.report_id = r.id
                and (
                  p_tab <> 'collection'
                  or item.importance in ('very_high', 'high')
                )
            ),
            '[]'::jsonb
          ),
          'weekly_volumes', '[]'::jsonb
        ) as report_payload
      from public.weekly_client_reports r
      join public.departments d on d.id = r.department_id
      join public.clients c on c.id = r.client_id
      where r.week_start_date = p_week_start_date
        and r.deleted_at is null
        and (resolved_department_id is null or r.department_id = resolved_department_id)
        and (p_client_id is null or r.client_id = p_client_id)
      order by r.updated_at desc
      limit 500
    ) report_rows;
  end if;

  if p_tab = 'collection' then
    select coalesce(jsonb_agg(request_payload order by created_at desc), '[]'::jsonb)
      into open_requests_json
    from (
      select request_rows.created_at, request_rows.request_payload
      from (
        select
          req.created_at,
          to_jsonb(req) || jsonb_build_object(
            'weekly_client_report_items', jsonb_build_object(
              'id', item.id,
              'item_period', item.item_period,
              'title', item.title,
              'content', item.content,
              'importance', item.importance,
              'work_categories', jsonb_build_object('category_name', wc.category_name),
              'weekly_client_reports', jsonb_build_object(
                'department_id', r.department_id,
                'client_id', r.client_id,
                'week_start_date', r.week_start_date,
                'report_year', r.report_year,
                'report_month', r.report_month,
                'week_of_month', r.week_of_month,
                'departments', jsonb_build_object('department_name', d.department_name),
                'clients', jsonb_build_object('client_name', c.client_name)
              )
            ),
            'department_weekly_submissions', null
          ) as request_payload
        from public.weekly_report_item_requests req
        join public.weekly_client_report_items item on item.id = req.report_item_id
        join public.weekly_client_reports r on r.id = item.report_id and r.deleted_at is null
        join public.departments d on d.id = r.department_id
        join public.clients c on c.id = r.client_id
        left join public.work_categories wc on wc.id = item.work_category_id
        where req.target_type = 'client_item'
          and req.deleted_at is null
          and req.closed_at is null
          and (resolved_department_id is null or r.department_id = resolved_department_id)
          and (p_client_id is null or r.client_id = p_client_id)

        union all

        select
          req.created_at,
          to_jsonb(req) || jsonb_build_object(
            'weekly_client_report_items', null,
            'department_weekly_submissions', jsonb_build_object(
              'id', submission.id,
              'department_id', submission.department_id,
              'week_start_date', submission.week_start_date,
              'report_year', submission.report_year,
              'report_month', submission.report_month,
              'week_of_month', submission.week_of_month,
              'departments', jsonb_build_object('department_name', d.department_name),
              'department_weekly_contents', coalesce(
                (
                  select jsonb_agg(to_jsonb(content) order by content.section_type)
                  from public.department_weekly_contents content
                  where content.submission_id = submission.id
                    and content.deleted_at is null
                ),
                '[]'::jsonb
              )
            )
          ) as request_payload
        from public.weekly_report_item_requests req
        join public.department_weekly_submissions submission
          on submission.id = req.department_submission_id
         and submission.deleted_at is null
        join public.departments d on d.id = submission.department_id
        where req.target_type = 'department_common'
          and req.deleted_at is null
          and req.closed_at is null
          and p_client_id is null
          and (resolved_department_id is null or submission.department_id = resolved_department_id)
      ) request_rows
      order by request_rows.created_at desc
      limit 500
    ) request_rows;
  end if;

  if p_tab in ('collection', 'materials', 'holiday', 'facility') then
    select coalesce(jsonb_agg(submission_payload order by department_name), '[]'::jsonb)
      into submissions_json
    from (
      select
        d.department_name,
        to_jsonb(submission) || jsonb_build_object(
          'departments', jsonb_build_object('department_name', d.department_name),
          'department_weekly_contents', case
            when p_tab = 'collection' then '[]'::jsonb
            else coalesce(
              (
                select jsonb_agg(to_jsonb(content) order by content.section_type)
                from public.department_weekly_contents content
                where content.submission_id = submission.id
                  and content.deleted_at is null
                  and (
                    p_tab = 'materials'
                    or (p_tab = 'holiday' and content.section_type = 'holiday_work')
                    or (p_tab = 'facility' and content.section_type = 'facility')
                  )
              ),
              '[]'::jsonb
            )
          end
        ) as submission_payload
      from public.department_weekly_submissions submission
      join public.departments d on d.id = submission.department_id
      where submission.week_start_date = p_week_start_date
        and submission.deleted_at is null
        and (resolved_department_id is null or submission.department_id = resolved_department_id)
        and (
          p_tab not in ('holiday', 'facility')
          or exists (
            select 1
            from public.department_weekly_contents required_content
            where required_content.submission_id = submission.id
              and required_content.deleted_at is null
              and (
                (p_tab = 'holiday' and required_content.section_type = 'holiday_work')
                or (p_tab = 'facility' and required_content.section_type = 'facility')
              )
          )
        )
      limit 500
    ) submission_rows;
  end if;

  if p_tab in ('collection', 'materials') then
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', wc.id, 'category_name', wc.category_name)
        order by wc.sort_order, wc.category_name
      ),
      '[]'::jsonb
    )
      into work_categories_json
    from public.work_categories wc
    where wc.is_active = true;
  end if;

  if p_tab = 'materials' then
    select coalesce(jsonb_agg(to_jsonb(req) order by req.created_at), '[]'::jsonb)
      into common_requests_json
    from public.weekly_report_item_requests req
    join public.department_weekly_submissions submission
      on submission.id = req.department_submission_id
     and submission.deleted_at is null
    where req.target_type = 'department_common'
      and req.deleted_at is null
      and submission.week_start_date = p_week_start_date
      and (resolved_department_id is null or submission.department_id = resolved_department_id);
  end if;

  if p_tab = 'volumes' then
    select coalesce(jsonb_agg(volume_payload order by week_of_month), '[]'::jsonb)
      into volume_trend_json
    from (
      select
        r.week_of_month,
        jsonb_build_object(
          'id', r.id,
          'department_id', r.department_id,
          'client_id', r.client_id,
          'week_of_month', r.week_of_month,
          'weekly_volumes', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'volume_type', volume.volume_type,
                  'quantity', volume.quantity,
                  'unit', volume.unit
                )
                order by volume.sort_order, volume.created_at
              )
              from public.weekly_volumes volume
              where volume.report_id = r.id
            ),
            '[]'::jsonb
          )
        ) as volume_payload
      from public.weekly_client_reports r
      where r.report_year = p_report_year
        and r.report_month = p_report_month
        and r.week_of_month <= p_week_of_month
        and r.deleted_at is null
        and (resolved_department_id is null or r.department_id = resolved_department_id)
        and (p_client_id is null or r.client_id = p_client_id)
      order by r.week_of_month
      limit 500
    ) volume_rows;

    select coalesce(jsonb_agg(volume_payload order by week_of_month), '[]'::jsonb)
      into previous_volume_trend_json
    from (
      select
        r.week_of_month,
        jsonb_build_object(
          'id', r.id,
          'department_id', r.department_id,
          'client_id', r.client_id,
          'week_of_month', r.week_of_month,
          'weekly_volumes', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'volume_type', volume.volume_type,
                  'quantity', volume.quantity,
                  'unit', volume.unit
                )
                order by volume.sort_order, volume.created_at
              )
              from public.weekly_volumes volume
              where volume.report_id = r.id
            ),
            '[]'::jsonb
          )
        ) as volume_payload
      from public.weekly_client_reports r
      where r.report_year = previous_year
        and r.report_month = previous_month
        and r.week_of_month <= p_week_of_month
        and r.deleted_at is null
        and (resolved_department_id is null or r.department_id = resolved_department_id)
        and (p_client_id is null or r.client_id = p_client_id)
      order by r.week_of_month
      limit 500
    ) volume_rows;
  end if;

  return jsonb_build_object(
    'resolvedDepartmentId', resolved_department_id,
    'departments', departments_json,
    'clients', clients_json,
    'reports', reports_json,
    'openRequests', open_requests_json,
    'submissions', submissions_json,
    'workCategories', work_categories_json,
    'commonMaterialRequests', common_requests_json,
    'volumeTrendReports', volume_trend_json,
    'previousVolumeTrendReports', previous_volume_trend_json
  );
end;
$$;

revoke all on function public.get_meeting_materials_payload(text, date, integer, integer, integer, uuid, uuid)
  from public, anon;
grant execute on function public.get_meeting_materials_payload(text, date, integer, integer, integer, uuid, uuid)
  to authenticated, service_role;
