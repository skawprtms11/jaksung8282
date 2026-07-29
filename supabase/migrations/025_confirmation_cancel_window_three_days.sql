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

    if target.submitted_at is not null and now() > target.submitted_at + interval '3 days' then
      raise exception '확정 후 3일이 지난 화주자료는 확정취소할 수 없습니다.';
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

create or replace function public.cancel_department_submission_atomic(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  target public.department_weekly_submissions%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  if actor_role not in ('admin', 'department_head') then
    raise exception '확정취소는 부서장과 관리자만 가능합니다.';
  end if;

  select * into target
  from public.department_weekly_submissions
  where id = p_submission_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '확정취소할 부서자료를 찾을 수 없습니다.';
  end if;

  if actor_role <> 'admin' and actor_department_id is distinct from target.department_id then
    raise exception '소속 부서 자료만 확정취소할 수 있습니다.';
  end if;

  if target.status <> 'submitted_to_division' then
    raise exception '사업부 검토요청 상태의 부서자료만 확정취소할 수 있습니다.';
  end if;

  if target.finalized_at is not null and now() > target.finalized_at + interval '3 days' then
    raise exception '확정 후 3일이 지난 부서자료는 확정취소할 수 없습니다.';
  end if;

  update public.department_weekly_submissions
  set status = 'draft',
      finalized_by = null,
      finalized_at = null,
      updated_at = now()
  where id = target.id;

  insert into public.approval_history(target_type, target_id, action, previous_status, next_status, comment, actor_id)
  values ('department_submission', target.id, '확정취소', target.status::text, 'draft', '부서 확정취소', actor_id);

  return jsonb_build_object('ok', true, 'id', target.id, 'status', 'draft');
end;
$$;

grant execute on function public.cancel_department_submission_atomic(uuid) to authenticated;
