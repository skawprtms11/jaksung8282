create index if not exists weekly_client_reports_department_updated_idx
  on public.weekly_client_reports(department_id, updated_at desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_updated_idx
  on public.weekly_client_reports(updated_at desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_week_desc_idx
  on public.weekly_client_reports(week_start_date desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_department_week_desc_idx
  on public.weekly_client_reports(department_id, week_start_date desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_department_status_week_desc_idx
  on public.weekly_client_reports(department_id, status, week_start_date desc)
  where deleted_at is null;

create index if not exists weekly_client_reports_status_week_desc_idx
  on public.weekly_client_reports(status, week_start_date desc)
  where deleted_at is null;

create index if not exists weekly_client_report_items_report_period_sort_idx
  on public.weekly_client_report_items(report_id, item_period, sort_order);

create index if not exists department_weekly_submissions_department_updated_idx
  on public.department_weekly_submissions(department_id, updated_at desc)
  where deleted_at is null;

create index if not exists department_weekly_submissions_week_desc_idx
  on public.department_weekly_submissions(week_start_date desc)
  where deleted_at is null;

create or replace function public.submit_client_reports_atomic(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  target public.weekly_client_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct report_id
    from unnest(coalesce(p_report_ids, array[]::uuid[])) as selected(report_id)
  ) selected;

  if expected_count = 0 then
    raise exception '확정할 화주별 자료를 선택하세요.';
  end if;

  for target in
    select *
    from public.weekly_client_reports
    where id = any(p_report_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if not public.can_access_department(target.department_id) then
      raise exception '처리 권한이 없습니다.';
    end if;

    if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
      raise exception '검토요청 권한이 없습니다.';
    end if;

    if actor_role = 'client_owner'
      and (target.created_by <> actor_id or not public.is_assigned_client(target.client_id)) then
      raise exception '배정된 본인 자료만 검토요청할 수 있습니다.';
    end if;

    if target.status not in ('draft', 'rejected') then
      raise exception '저장 또는 반려 상태의 자료만 확정할 수 있습니다.';
    end if;

    update public.weekly_client_reports
    set status = 'submitted',
        submitted_at = now(),
        review_comment = '확정',
        updated_by = actor_id,
        updated_at = now()
    where id = target.id;

    insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
    values ('client_report', target.id, '검토요청', target.status::text, 'submitted', '확정', actor_id);
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 자료 중 조회할 수 없는 자료가 있습니다.';
  end if;

  return jsonb_build_object('ok', true, 'count', found_count);
end;
$$;

grant execute on function public.submit_client_reports_atomic(uuid[]) to authenticated;

create or replace function public.cancel_client_reports_submission_atomic(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  target public.weekly_client_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct report_id
    from unnest(coalesce(p_report_ids, array[]::uuid[])) as selected(report_id)
  ) selected;

  if expected_count = 0 then
    raise exception '확정취소할 화주별 자료를 선택하세요.';
  end if;

  for target in
    select *
    from public.weekly_client_reports
    where id = any(p_report_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if not public.can_access_department(target.department_id) then
      raise exception '처리 권한이 없습니다.';
    end if;

    if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
      raise exception '확정취소 권한이 없습니다.';
    end if;

    if actor_role = 'client_owner'
      and (target.created_by <> actor_id or not public.is_assigned_client(target.client_id)) then
      raise exception '배정된 본인 자료만 확정취소할 수 있습니다.';
    end if;

    if target.status <> 'submitted' then
      raise exception '확정 상태의 자료만 확정취소할 수 있습니다.';
    end if;

    update public.weekly_client_reports
    set status = 'draft',
        submitted_at = null,
        review_comment = '확정취소',
        updated_by = actor_id,
        updated_at = now()
    where id = target.id;

    insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
    values ('client_report', target.id, '확정취소', target.status::text, 'draft', '확정취소', actor_id);
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 자료 중 조회할 수 없는 자료가 있습니다.';
  end if;

  return jsonb_build_object('ok', true, 'count', found_count);
end;
$$;

grant execute on function public.cancel_client_reports_submission_atomic(uuid[]) to authenticated;

create or replace function public.soft_delete_client_reports_atomic(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  affected_count integer;
  target public.weekly_client_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct report_id
    from unnest(coalesce(p_report_ids, array[]::uuid[])) as selected(report_id)
  ) selected;

  if expected_count = 0 then
    raise exception '삭제할 화주별 자료를 선택하세요.';
  end if;

  for target in
    select *
    from public.weekly_client_reports
    where id = any(p_report_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if not public.can_access_department(target.department_id) then
      raise exception '처리 권한이 없습니다.';
    end if;

    if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
      raise exception '화주자료 삭제 권한이 없습니다.';
    end if;

    if actor_role = 'client_owner' and not public.is_assigned_client(target.client_id) then
      raise exception '배정된 화주 자료만 처리할 수 있습니다.';
    end if;

    if actor_role = 'client_owner' and target.status not in ('draft', 'rejected') then
      raise exception '화주담당자는 저장 또는 반려 상태의 자료만 삭제할 수 있습니다.';
    end if;

    if actor_role <> 'admin' and target.status = 'approved' then
      raise exception '부서 승인된 자료는 삭제할 수 없습니다.';
    end if;
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 자료 중 조회할 수 없는 자료가 있습니다.';
  end if;

  update public.weekly_client_reports
  set deleted_at = now(),
      deleted_by = actor_id,
      updated_by = actor_id,
      updated_at = now()
  where id = any(p_report_ids)
    and deleted_at is null;

  get diagnostics affected_count = row_count;
  if affected_count <> expected_count then
    raise exception '삭제 중 상태가 변경된 자료가 있습니다. 새로고침 후 다시 시도하세요.';
  end if;

  return jsonb_build_object('ok', true, 'count', affected_count);
end;
$$;

grant execute on function public.soft_delete_client_reports_atomic(uuid[]) to authenticated;

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
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  if requested not in ('draft', 'submitted') then
    raise exception '화주자료 작성 화면에서는 저장 또는 확정만 처리할 수 있습니다.';
  end if;

  if public.client_department_id(p_client_id) is distinct from p_department_id then
    raise exception '화주와 부서가 일치하지 않습니다.';
  end if;

  if actor_role <> 'admin' and actor_department_id is distinct from p_department_id then
    raise exception '소속 부서 자료만 처리할 수 있습니다.';
  end if;

  if actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
    raise exception '화주자료 저장 권한이 없습니다.';
  end if;

  if actor_role = 'client_owner' and not public.is_assigned_client(p_client_id) then
    raise exception '배정된 화주 자료만 작성할 수 있습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('client-report:' || p_client_id::text || ':' || p_week_start_date::text, 0));

  if p_report_id is not null then
    select * into existing
    from public.weekly_client_reports
    where id = p_report_id and deleted_at is null
    for update;

    if not found then
      raise exception '수정할 화주별 자료를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 선택하세요.';
    end if;

    if actor_role <> 'admin' and actor_department_id is distinct from existing.department_id then
      raise exception '소속 부서 자료만 처리할 수 있습니다.';
    end if;

    if actor_role = 'client_owner' and not public.is_assigned_client(existing.client_id) then
      raise exception '배정된 화주 자료만 처리할 수 있습니다.';
    end if;

    if existing.status not in ('draft', 'rejected') then
      raise exception '확정 또는 승인된 자료는 수정할 수 없습니다.';
    end if;

    select * into duplicate
    from public.weekly_client_reports
    where client_id = p_client_id
      and week_start_date = p_week_start_date
      and id <> p_report_id
      and deleted_at is null
    for update;

    if found then
      raise exception '선택한 화주와 주차에는 이미 화주별 자료가 등록되어 있습니다.';
    end if;

    update public.weekly_client_reports
    set department_id = p_department_id,
        client_id = p_client_id,
        week_start_date = p_week_start_date,
        week_end_date = p_week_end_date,
        report_year = p_report_year,
        report_month = p_report_month,
        week_of_month = p_week_of_month,
        status = requested,
        no_special_issue = p_no_special_issue,
        submitted_at = case when requested = 'submitted' then now() else null end,
        review_comment = case when requested = 'submitted' then '검토요청' else review_comment end,
        updated_by = actor_id,
        updated_at = now()
    where id = existing.id
    returning id into saved_id;
  else
    select * into existing
    from public.weekly_client_reports
    where client_id = p_client_id
      and week_start_date = p_week_start_date
      and deleted_at is null
    for update;

    if found then
      raise exception '선택한 화주와 주차에는 이미 화주별 자료가 등록되어 있습니다.';
    end if;

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
      submitted_at,
      review_comment,
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
      requested,
      p_no_special_issue,
      case when requested = 'submitted' then now() else null end,
      case when requested = 'submitted' then '검토요청' else null end,
      actor_id,
      actor_id
    )
    returning id into saved_id;
  end if;

  delete from public.weekly_client_report_items where report_id = saved_id;
  delete from public.weekly_volumes where report_id = saved_id;

  insert into public.weekly_client_report_items(report_id, item_period, importance, work_category_id, title, content, sort_order)
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

  insert into public.weekly_volumes(report_id, volume_type, quantity, unit, custom_unit, note, sort_order)
  select
    saved_id,
    volume_type::public.volume_type,
    quantity,
    unit::public.volume_unit,
    nullif(custom_unit, ''),
    nullif(note, ''),
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
    insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
    values (
      'client_report',
      saved_id,
      '검토요청',
      coalesce(existing.status::text, 'draft'),
      'submitted',
      '검토요청',
      actor_id
    );
  end if;

  return jsonb_build_object('ok', true, 'id', saved_id, 'status', requested);
end;
$$;

grant execute on function public.save_client_report_atomic(uuid, uuid, uuid, date, date, integer, integer, integer, text, boolean, jsonb, jsonb) to authenticated;

create or replace function public.save_department_submission_atomic(
  p_submission_id uuid,
  p_department_id uuid,
  p_week_start_date date,
  p_week_end_date date,
  p_report_year integer,
  p_report_month integer,
  p_week_of_month integer,
  p_status text,
  p_exception_reason text,
  p_contents jsonb
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
  requested public.department_submission_status := p_status::public.department_submission_status;
  target public.department_weekly_submissions%rowtype;
  saved_id uuid;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  if actor_role <> 'admin' and actor_department_id is distinct from p_department_id then
    raise exception '소속 부서 자료만 처리할 수 있습니다.';
  end if;

  if actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '부서자료 저장 권한이 없습니다.';
  end if;

  if requested = 'submitted_to_division' and actor_role not in ('admin', 'department_head') then
    raise exception '부서 최종 제출은 부서장과 관리자만 가능합니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('department-submission:' || p_department_id::text || ':' || p_week_start_date::text, 0));

  if p_submission_id is not null then
    select * into target
    from public.department_weekly_submissions
    where id = p_submission_id and deleted_at is null
    for update;

    if not found then
      raise exception '수정할 부서자료를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 선택하세요.';
    end if;
  else
    select * into target
    from public.department_weekly_submissions
    where department_id = p_department_id
      and week_start_date = p_week_start_date
      and deleted_at is null
    for update;
  end if;

  if found then
    if actor_role <> 'admin' and actor_department_id is distinct from target.department_id then
      raise exception '소속 부서 자료만 처리할 수 있습니다.';
    end if;

    if target.status not in ('draft', 'division_rejected') then
      raise exception '확정 또는 승인된 부서자료는 수정할 수 없습니다.';
    end if;

    update public.department_weekly_submissions
    set department_id = p_department_id,
        week_start_date = p_week_start_date,
        week_end_date = p_week_end_date,
        report_year = p_report_year,
        report_month = p_report_month,
        week_of_month = p_week_of_month,
        status = case when requested = 'submitted_to_division' then 'draft'::public.department_submission_status else requested end,
        exception_reason = p_exception_reason,
        finalized_by = case when requested = 'submitted_to_division' then finalized_by else null end,
        finalized_at = case when requested = 'submitted_to_division' then finalized_at else null end,
        updated_at = now()
    where id = target.id
    returning id into saved_id;
  else
    insert into public.department_weekly_submissions(
      department_id,
      week_start_date,
      week_end_date,
      report_year,
      report_month,
      week_of_month,
      status,
      exception_reason
    )
    values (
      p_department_id,
      p_week_start_date,
      p_week_end_date,
      p_report_year,
      p_report_month,
      p_week_of_month,
      case when requested = 'submitted_to_division' then 'draft'::public.department_submission_status else requested end,
      p_exception_reason
    )
    returning id into saved_id;
  end if;

  insert into public.department_weekly_contents(
    submission_id,
    section_type,
    current_week_content,
    next_week_content,
    current_importance,
    current_work_category_id,
    next_importance,
    next_work_category_id,
    created_by,
    updated_by
  )
  select
    saved_id,
    section_type::public.department_section_type,
    coalesce(current_week_content, ''),
    coalesce(next_week_content, ''),
    current_importance::public.importance_level,
    current_work_category_id,
    next_importance::public.importance_level,
    next_work_category_id,
    actor_id,
    actor_id
  from jsonb_to_recordset(coalesce(p_contents, '[]'::jsonb)) as content(
    section_type text,
    current_week_content text,
    next_week_content text,
    current_importance text,
    current_work_category_id uuid,
    next_importance text,
    next_work_category_id uuid
  )
  on conflict (submission_id, section_type) do update
  set current_week_content = excluded.current_week_content,
      next_week_content = excluded.next_week_content,
      current_importance = excluded.current_importance,
      current_work_category_id = excluded.current_work_category_id,
      next_importance = excluded.next_importance,
      next_work_category_id = excluded.next_work_category_id,
      updated_by = actor_id,
      updated_at = now();

  if requested = 'submitted_to_division' then
    perform public.transition_department_submission_status(saved_id, 'submitted_to_division', coalesce(p_exception_reason, '사업부 검토요청'));
  end if;

  return jsonb_build_object('ok', true, 'id', saved_id, 'status', requested);
end;
$$;

grant execute on function public.save_department_submission_atomic(uuid, uuid, date, date, integer, integer, integer, text, text, jsonb) to authenticated;
