create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select app_role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.current_department_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

create or replace function public.can_access_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.current_department_id() = target_department_id;
$$;

create or replace function public.is_assigned_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_assignments ca
    where ca.client_id = target_client_id
      and ca.user_id = auth.uid()
      and ca.is_active = true
  );
$$;

create or replace function public.client_department_id(target_client_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.clients where id = target_client_id and is_active = true;
$$;

create or replace function public.can_write_client_report(target_department_id uuid, target_client_id uuid, target_status public.client_report_status)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.client_department_id(target_client_id) = target_department_id
    and (
      public.is_admin()
      or (
        public.current_app_role() in ('department_head', 'manager')
        and public.current_department_id() = target_department_id
        and target_status <> 'approved'
      )
      or (
        public.current_app_role() = 'client_owner'
        and public.current_department_id() = target_department_id
        and public.is_assigned_client(target_client_id)
        and target_status in ('draft', 'submitted', 'rejected')
      )
    );
$$;

create or replace function public.increment_notice_view(notice_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notices
  set view_count = view_count + 1
  where id = notice_id
    and deleted_at is null
    and is_active = true;
$$;

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
    or (target.status = 'submitted' and requested in ('approved', 'rejected'))
    or (target.status = 'rejected' and requested in ('draft', 'submitted'))
    or (target.status = 'approved' and requested in ('submitted', 'draft') and actor_role in ('admin', 'department_head'))
  ) then
    raise exception '허용되지 않은 상태 변경입니다.';
  end if;

  update public.weekly_client_reports
  set status = requested,
      submitted_at = case when requested = 'submitted' then now() else submitted_at end,
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
    case requested when 'submitted' then '검토요청' when 'approved' then '승인' when 'rejected' then '반려' else '승인 해제' end,
    target.status::text,
    requested::text,
    comment,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'status', requested);
end;
$$;

create or replace function public.transition_department_submission_status(submission_id uuid, next_status text, comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.department_weekly_submissions%rowtype;
  requested public.department_submission_status := next_status::public.department_submission_status;
  actor_role public.app_role := public.current_app_role();
begin
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

drop trigger if exists departments_set_updated_at on public.departments;
create trigger departments_set_updated_at before update on public.departments for each row execute function public.set_updated_at();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients for each row execute function public.set_updated_at();
drop trigger if exists notices_set_updated_at on public.notices;
create trigger notices_set_updated_at before update on public.notices for each row execute function public.set_updated_at();
drop trigger if exists weekly_client_reports_set_updated_at on public.weekly_client_reports;
create trigger weekly_client_reports_set_updated_at before update on public.weekly_client_reports for each row execute function public.set_updated_at();
drop trigger if exists weekly_client_report_items_set_updated_at on public.weekly_client_report_items;
create trigger weekly_client_report_items_set_updated_at before update on public.weekly_client_report_items for each row execute function public.set_updated_at();
drop trigger if exists weekly_volumes_set_updated_at on public.weekly_volumes;
create trigger weekly_volumes_set_updated_at before update on public.weekly_volumes for each row execute function public.set_updated_at();
drop trigger if exists department_weekly_submissions_set_updated_at on public.department_weekly_submissions;
create trigger department_weekly_submissions_set_updated_at before update on public.department_weekly_submissions for each row execute function public.set_updated_at();
drop trigger if exists department_weekly_contents_set_updated_at on public.department_weekly_contents;
create trigger department_weekly_contents_set_updated_at before update on public.department_weekly_contents for each row execute function public.set_updated_at();

revoke all on function public.current_app_role() from public;
revoke all on function public.current_department_id() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_access_department(uuid) from public;
revoke all on function public.is_assigned_client(uuid) from public;
revoke all on function public.client_department_id(uuid) from public;
revoke all on function public.can_write_client_report(uuid, uuid, public.client_report_status) from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_department_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_department(uuid) to authenticated;
grant execute on function public.is_assigned_client(uuid) to authenticated;
grant execute on function public.client_department_id(uuid) to authenticated;
grant execute on function public.can_write_client_report(uuid, uuid, public.client_report_status) to authenticated;
grant execute on function public.transition_client_report_status(uuid, text, text) to authenticated;
grant execute on function public.transition_department_submission_status(uuid, text, text) to authenticated;
grant execute on function public.increment_notice_view(uuid) to authenticated;
