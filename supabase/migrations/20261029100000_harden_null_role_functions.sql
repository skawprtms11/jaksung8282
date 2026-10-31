-- 보안 보완(2026-10-28 점검) 1·7·8번 + 3번 중 조회수 함수.
-- 승인 대기·비활성 계정은 profiles.is_active = false 라 current_app_role()이 NULL을 돌려준다.
-- NULL 역할은 `actor_role <> 'admin'`, `actor_role not in (...)` 같은 비교에서 NULL(=거짓)로 평가돼
-- 권한 검사를 통과해 버리므로, 각 함수 맨 앞에서 역할 NULL을 명시적으로 차단한다.
-- 본문은 각 함수의 최신 정의를 그대로 옮기고 해당 검사 줄만 바꿨다.
-- search_path는 20260822100000에서 강화한 `public, pg_temp`를 유지한다(create or replace 시 SET 절이 설정을 덮어쓰므로 명시).
--
-- 되돌리기(새 migration 파일로 적용):
--   save_client_report_atomic              → 20260821110000_save_client_report_items_by_id.sql:14 본문
--   bulk_import_clients_atomic             → 019_bulk_import_clients_atomic.sql:1 본문
--   transition_client_report_status        → 017_allow_client_report_submit_cancel.sql:1 본문
--   transition_department_submission_status → 003_functions_and_triggers.sql:185 본문
--   increment_notice_view                  → 003_functions_and_triggers.sql:102 본문
--   원본으로 되돌린 뒤 각 함수에 `alter function ... set search_path = public, pg_temp;` 를 다시 적용한다.

-- 1. save_client_report_atomic: 첫 검사에 역할 NULL 포함
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
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  requested public.client_report_status := p_status::public.client_report_status;
  existing public.weekly_client_reports%rowtype;
  duplicate public.weekly_client_reports%rowtype;
  saved_id uuid;
  has_payload_ids boolean;
begin
  if actor_id is null or actor_role is null then
    raise exception '로그인이 필요하거나 사용 승인되지 않은(비활성) 계정입니다.';
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

  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
    where coalesce(item->>'id', '') <> ''
  ) into has_payload_ids;

  if has_payload_ids then
    -- 항목 id 기준 매칭: id가 payload에 없는 기존 항목은 삭제 대상이다.
    if exists (
      select 1
      from public.weekly_client_report_items as report_item
      where report_item.report_id = saved_id
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
          where coalesce(item->>'id', '') <> ''
            and (item->>'id')::uuid = report_item.id
        )
        and exists (
          select 1
          from public.weekly_report_item_requests as item_request
          where item_request.report_item_id = report_item.id
            and item_request.deleted_at is null
            and item_request.closed_at is null
        )
    ) then
      raise exception '종결되지 않은 사업부 요청사항이 있는 업무 항목은 삭제할 수 없습니다. 요청사항을 종결한 뒤 다시 저장하세요.';
    end if;

    delete from public.weekly_client_report_items as target
    where target.report_id = saved_id
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
        where coalesce(item->>'id', '') <> ''
          and (item->>'id')::uuid = target.id
      );

    update public.weekly_client_report_items as target
    set item_period = payload.item_period,
        importance = payload.importance,
        work_category_id = payload.work_category_id,
        title = payload.title,
        content = payload.content,
        sort_order = payload.sort_order
    from (
      select
        (item->>'id')::uuid as id,
        (item->>'item_period')::public.item_period as item_period,
        (item->>'importance')::public.importance_level as importance,
        (item->>'work_category_id')::uuid as work_category_id,
        coalesce(item->>'title', '') as title,
        coalesce(item->>'content', '') as content,
        coalesce((item->>'sort_order')::integer, 0) as sort_order
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
      where coalesce(item->>'id', '') <> ''
    ) as payload
    where target.report_id = saved_id
      and target.id = payload.id;

    -- id가 없는 신규 항목, 또는 이 자료 소속이 아닌 id를 단 항목(다른 화주 편집 잔재)은 새로 삽입한다.
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
      (item->>'item_period')::public.item_period,
      (item->>'importance')::public.importance_level,
      (item->>'work_category_id')::uuid,
      coalesce(item->>'title', ''),
      coalesce(item->>'content', ''),
      coalesce((item->>'sort_order')::integer, 0)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
    where coalesce(item->>'id', '') = ''
       or not exists (
         select 1
         from public.weekly_client_report_items as existing_item
         where existing_item.id = (item->>'id')::uuid
           and existing_item.report_id = saved_id
       );
  else
    -- 구버전 payload(항목 id 없음): 기존 위치(item_period, 순번) 기준 in-place upsert를 유지한다.
    if exists (
      with payload_counts as (
        select
          item.item_period::public.item_period as item_period,
          count(*) as payload_count
        from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
          item_period text,
          importance text,
          work_category_id uuid,
          title text,
          content text,
          sort_order integer
        )
        group by item.item_period
      ),
      existing_items as (
        select
          report_item.id,
          report_item.item_period,
          row_number() over (
            partition by report_item.item_period
            order by report_item.sort_order, report_item.created_at, report_item.id
          ) as item_position
        from public.weekly_client_report_items as report_item
        where report_item.report_id = saved_id
      )
      select 1
      from existing_items
      left join payload_counts on payload_counts.item_period = existing_items.item_period
      where existing_items.item_position > coalesce(payload_counts.payload_count, 0)
        and exists (
          select 1
          from public.weekly_report_item_requests as item_request
          where item_request.report_item_id = existing_items.id
            and item_request.deleted_at is null
            and item_request.closed_at is null
        )
    ) then
      raise exception '종결되지 않은 사업부 요청사항이 있는 업무 항목은 삭제할 수 없습니다. 요청사항을 종결한 뒤 다시 저장하세요.';
    end if;

    with payload_counts as (
      select
        item.item_period::public.item_period as item_period,
        count(*) as payload_count
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
        item_period text,
        importance text,
        work_category_id uuid,
        title text,
        content text,
        sort_order integer
      )
      group by item.item_period
    ),
    existing_items as (
      select
        report_item.id,
        report_item.item_period,
        row_number() over (
          partition by report_item.item_period
          order by report_item.sort_order, report_item.created_at, report_item.id
        ) as item_position
      from public.weekly_client_report_items as report_item
      where report_item.report_id = saved_id
    )
    delete from public.weekly_client_report_items as target
    using existing_items
    left join payload_counts on payload_counts.item_period = existing_items.item_period
    where target.id = existing_items.id
      and existing_items.item_position > coalesce(payload_counts.payload_count, 0);

    with payload as (
      select
        item.item_period::public.item_period as item_period,
        item.importance::public.importance_level as importance,
        item.work_category_id,
        item.title,
        item.content,
        item.sort_order,
        row_number() over (
          partition by item.item_period
          order by item.sort_order
        ) as item_position
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
        item_period text,
        importance text,
        work_category_id uuid,
        title text,
        content text,
        sort_order integer
      )
    ),
    existing_items as (
      select
        report_item.id,
        report_item.item_period,
        row_number() over (
          partition by report_item.item_period
          order by report_item.sort_order, report_item.created_at, report_item.id
        ) as item_position
      from public.weekly_client_report_items as report_item
      where report_item.report_id = saved_id
    )
    update public.weekly_client_report_items as target
    set importance = payload.importance,
        work_category_id = payload.work_category_id,
        title = payload.title,
        content = payload.content,
        sort_order = payload.sort_order
    from existing_items
    join payload
      on payload.item_period = existing_items.item_period
      and payload.item_position = existing_items.item_position
    where target.id = existing_items.id;

    with payload as (
      select
        item.item_period::public.item_period as item_period,
        item.importance::public.importance_level as importance,
        item.work_category_id,
        item.title,
        item.content,
        item.sort_order,
        row_number() over (
          partition by item.item_period
          order by item.sort_order
        ) as item_position
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
        item_period text,
        importance text,
        work_category_id uuid,
        title text,
        content text,
        sort_order integer
      )
    ),
    existing_counts as (
      select
        report_item.item_period,
        count(*) as existing_count
      from public.weekly_client_report_items as report_item
      where report_item.report_id = saved_id
      group by report_item.item_period
    )
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
      payload.item_period,
      payload.importance,
      payload.work_category_id,
      payload.title,
      payload.content,
      payload.sort_order
    from payload
    left join existing_counts on existing_counts.item_period = payload.item_period
    where payload.item_position > coalesce(existing_counts.existing_count, 0);
  end if;

  delete from public.weekly_volumes where report_id = saved_id;

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

revoke execute on function public.save_client_report_atomic(uuid, uuid, uuid, date, date, integer, integer, integer, text, boolean, jsonb, jsonb) from anon, public;
grant execute on function public.save_client_report_atomic(uuid, uuid, uuid, date, date, integer, integer, integer, text, boolean, jsonb, jsonb) to authenticated;

-- 7. bulk_import_clients_atomic: `<>`는 NULL이면 통과하므로 is distinct from 으로 교체
create or replace function public.bulk_import_clients_atomic(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  input_count integer := 0;
  normalized_count integer := 0;
  existing_count integer := 0;
  duplicate_count integer := 0;
  invalid_row_numbers text;
begin
  if actor_id is null or actor_role is distinct from 'admin' then
    raise exception '관리자만 처리할 수 있습니다.';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '일괄등록 데이터를 확인하세요.';
  end if;

  select count(*) into input_count
  from jsonb_array_elements(p_rows);

  if input_count = 0 then
    raise exception '등록할 화주가 없습니다.';
  end if;

  if input_count > 2000 then
    raise exception '한 번에 2000건까지 등록할 수 있습니다.';
  end if;

  drop table if exists pg_temp.bulk_import_clients_raw;
  create temporary table bulk_import_clients_raw (
    ord bigint not null,
    client_code text not null,
    client_name text not null,
    notes text
  ) on commit drop;

  insert into bulk_import_clients_raw (ord, client_code, client_name, notes)
  select ord, client_code, client_name, nullif(notes, '')
  from (
    select
      item.ord,
      btrim(coalesce(item.value->>'client_code', '')) as client_code,
      btrim(coalesce(item.value->>'client_name', '')) as client_name,
      btrim(coalesce(item.value->>'notes', '')) as notes
    from jsonb_array_elements(p_rows) with ordinality as item(value, ord)
  ) parsed
  where client_code <> '' or client_name <> '' or notes <> '';

  if not exists (select 1 from bulk_import_clients_raw) then
    raise exception '등록할 화주가 없습니다.';
  end if;

  select string_agg(ord::text, ', ' order by ord)
    into invalid_row_numbers
  from bulk_import_clients_raw
  where client_code = '' or client_name = '';

  if invalid_row_numbers is not null then
    raise exception '%행의 화주코드와 화주명을 입력하세요.', invalid_row_numbers;
  end if;

  drop table if exists pg_temp.bulk_import_clients_normalized;
  create temporary table bulk_import_clients_normalized as
  select distinct on (client_code)
    client_code,
    client_name,
    notes
  from bulk_import_clients_raw
  order by client_code, ord desc;

  select count(*) into normalized_count from bulk_import_clients_normalized;
  duplicate_count := input_count - normalized_count;

  select count(*)
    into existing_count
  from bulk_import_clients_normalized n
  join public.clients c on c.client_code = n.client_code;

  insert into public.clients (
    client_code,
    client_name,
    notes,
    created_by,
    updated_by
  )
  select
    client_code,
    client_name,
    notes,
    actor_id,
    actor_id
  from bulk_import_clients_normalized
  on conflict (client_code) do update
    set client_name = excluded.client_name,
        notes = excluded.notes,
        updated_by = actor_id,
        updated_at = now();

  return jsonb_build_object(
    'total_count', normalized_count,
    'inserted_count', normalized_count - existing_count,
    'updated_count', existing_count,
    'duplicate_count', duplicate_count
  );
end;
$$;

revoke execute on function public.bulk_import_clients_atomic(jsonb) from anon, public;
grant execute on function public.bulk_import_clients_atomic(jsonb) to authenticated;

-- 8. transition_client_report_status: 맨 앞 역할 NULL 검사(방어용)
create or replace function public.transition_client_report_status(report_id uuid, next_status text, comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.weekly_client_reports%rowtype;
  requested public.client_report_status := next_status::public.client_report_status;
  actor_role public.app_role := public.current_app_role();
begin
  if auth.uid() is null or actor_role is null then
    raise exception '로그인이 필요하거나 사용 승인되지 않은(비활성) 계정입니다.';
  end if;

  select * into target
  from public.weekly_client_reports
  where id = report_id and deleted_at is null
  for update;

  if not found then
    raise exception '자료를 찾을 수 없습니다.';
  end if;

  if not public.can_access_department(target.department_id) then
    raise exception '처리 권한이 없습니다.';
  end if;

  if requested = 'submitted' and actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
    raise exception '검토요청 권한이 없습니다.';
  end if;

  if requested = 'submitted'
    and actor_role = 'client_owner'
    and (target.created_by <> auth.uid() or not public.is_assigned_client(target.client_id)) then
    raise exception '배정된 본인 자료만 검토요청할 수 있습니다.';
  end if;

  if requested = 'draft' and target.status = 'submitted' and actor_role not in ('admin', 'department_head', 'manager', 'client_owner') then
    raise exception '확정취소 권한이 없습니다.';
  end if;

  if requested = 'draft'
    and target.status = 'submitted'
    and actor_role = 'client_owner'
    and (target.created_by <> auth.uid() or not public.is_assigned_client(target.client_id)) then
    raise exception '배정된 본인 자료만 확정취소할 수 있습니다.';
  end if;

  if requested = 'approved' and actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '승인 권한이 없습니다.';
  end if;

  if requested = 'rejected' and actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '반려 권한이 없습니다.';
  end if;

  if requested = 'rejected' and length(btrim(coalesce(comment, ''))) = 0 then
    raise exception '반려사유를 입력하세요.';
  end if;

  if not (
    (target.status = 'draft' and requested = 'submitted')
    or (target.status = 'submitted' and requested in ('draft', 'approved', 'rejected'))
    or (target.status = 'rejected' and requested in ('draft', 'submitted'))
    or (target.status = 'approved' and requested in ('submitted', 'draft') and actor_role in ('admin', 'department_head'))
  ) then
    raise exception '허용되지 않은 상태 변경입니다.';
  end if;

  update public.weekly_client_reports
  set status = requested,
      submitted_at = case
        when requested = 'submitted' then now()
        when target.status = 'submitted' and requested = 'draft' then null
        else submitted_at
      end,
      department_reviewed_by = case when requested in ('approved', 'rejected') then auth.uid() else department_reviewed_by end,
      department_reviewed_at = case when requested in ('approved', 'rejected') then now() else department_reviewed_at end,
      review_comment = comment,
      updated_by = auth.uid(),
      updated_at = now()
  where id = report_id;

  insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
  values (
    'client_report',
    report_id,
    case
      when requested = 'submitted' then '검토요청'
      when requested = 'approved' then '승인'
      when requested = 'rejected' then '반려'
      when requested = 'draft' and target.status = 'submitted' then '확정취소'
      else '승인 해제'
    end,
    target.status::text,
    requested::text,
    comment,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'status', requested);
end;
$$;

revoke execute on function public.transition_client_report_status(uuid, text, text) from anon, public;
grant execute on function public.transition_client_report_status(uuid, text, text) to authenticated;

-- 8. transition_department_submission_status: 맨 앞 역할 NULL 검사(방어용)
create or replace function public.transition_department_submission_status(submission_id uuid, next_status text, comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.department_weekly_submissions%rowtype;
  requested public.department_submission_status := next_status::public.department_submission_status;
  actor_role public.app_role := public.current_app_role();
begin
  if auth.uid() is null or actor_role is null then
    raise exception '로그인이 필요하거나 사용 승인되지 않은(비활성) 계정입니다.';
  end if;

  select * into target
  from public.department_weekly_submissions
  where id = submission_id and deleted_at is null
  for update;

  if not found then
    raise exception '자료를 찾을 수 없습니다.';
  end if;

  if not public.can_access_department(target.department_id) then
    raise exception '처리 권한이 없습니다.';
  end if;

  if requested = 'submitted_to_division' and actor_role not in ('admin', 'department_head') then
    raise exception '부서 최종 제출 권한이 없습니다.';
  end if;

  if requested in ('division_approved', 'division_rejected') and actor_role <> 'admin' then
    raise exception '사업부 승인 권한이 없습니다.';
  end if;

  if requested = 'division_rejected' and length(btrim(coalesce(comment, ''))) = 0 then
    raise exception '반려사유를 입력하세요.';
  end if;

  if not (
    (target.status = 'draft' and requested = 'submitted_to_division')
    or (target.status = 'submitted_to_division' and requested in ('division_approved', 'division_rejected'))
    or (target.status = 'division_rejected' and requested in ('draft', 'submitted_to_division'))
    or (target.status = 'division_approved' and requested = 'draft' and actor_role = 'admin')
  ) then
    raise exception '허용되지 않은 상태 변경입니다.';
  end if;

  update public.department_weekly_submissions
  set status = requested,
      finalized_by = case when requested = 'submitted_to_division' then auth.uid() else finalized_by end,
      finalized_at = case when requested = 'submitted_to_division' then now() else finalized_at end,
      division_reviewed_by = case when requested in ('division_approved', 'division_rejected') then auth.uid() else division_reviewed_by end,
      division_reviewed_at = case when requested in ('division_approved', 'division_rejected') then now() else division_reviewed_at end,
      division_review_comment = comment,
      updated_at = now()
  where id = submission_id;

  insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
  values (
    'department_submission',
    submission_id,
    case requested when 'submitted_to_division' then '사업부 검토요청' when 'division_approved' then '사업부 승인' when 'division_rejected' then '사업부 반려' else '관리자 재오픈' end,
    target.status::text,
    requested::text,
    comment,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'status', requested);
end;
$$;

revoke execute on function public.transition_department_submission_status(uuid, text, text) from anon, public;
grant execute on function public.transition_department_submission_status(uuid, text, text) to authenticated;

-- 3. increment_notice_view: 승인 전·비활성 계정은 조회수를 올리지 않는다.
create or replace function public.increment_notice_view(notice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_app_role() is null then
    return;
  end if;

  update public.notices
  set view_count = view_count + 1
  where id = notice_id
    and deleted_at is null
    and is_active = true;
end;
$$;

revoke execute on function public.increment_notice_view(uuid) from anon, public;
grant execute on function public.increment_notice_view(uuid) to authenticated;
