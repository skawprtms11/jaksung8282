create or replace function public.transition_client_report_status(report_id uuid, next_status text, comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.weekly_client_reports%rowtype;
  requested public.client_report_status := next_status::public.client_report_status;
  actor_role public.app_role := public.current_app_role();
begin
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
