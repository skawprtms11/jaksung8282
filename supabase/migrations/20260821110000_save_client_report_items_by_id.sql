-- 화주자료 저장의 업무 항목 매칭을 (item_period, 순번) 위치 기준에서 항목 id 기준으로 교체한다.
-- 위치 기준 매칭은 항목 삭제·순서 변경 시 기존 row에 다른 항목의 내용이 덮여
-- 관리자수정 이력(original_*, admin_edited_*)과 사업부 요청사항이 엉뚱한 항목에 붙는 오귀속을 일으킨다.
-- 에디터는 이제 저장 payload에 항목 id를 싣는다. id가 하나도 없는 구버전 payload(배포 전환기 브라우저)는
-- 기존 위치 기준 로직으로 처리해 항목 id 보존을 유지한다.
-- 함께: weekly_client_report_items의 직접 INSERT/UPDATE 권한을 컬럼 단위로 제한해
-- 화주담당자가 PostgREST 직접 호출로 관리자수정 감사 컬럼을 위조할 수 없게 한다. (security definer RPC는 영향 없음)

revoke insert, update on public.weekly_client_report_items from authenticated;
grant insert (report_id, item_period, importance, work_category_id, title, content, sort_order),
      update (item_period, importance, work_category_id, title, content, sort_order)
  on public.weekly_client_report_items to authenticated;

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
  has_payload_ids boolean;
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

-- 롤백 절차
-- 함수 본문은 20260817013521_preserve_client_report_items_on_save.sql의 본문으로 create or replace 하면 된다.
-- 권한은 아래로 원복한다. (기존 migration을 수정하지 말고 새 migration 파일로 적용할 것)
-- grant insert, update on public.weekly_client_report_items to authenticated;
