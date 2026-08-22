-- H-2: department_weekly_contents 쓰기 정책이 부서만 확인하고 역할을 확인하지 않아
-- 화주담당자(client_owner)가 PostgREST 직접 호출로 부서 공통자료 본문을 수정/삭제할 수 있었다.
-- 부모 테이블(department_weekly_submissions)과 동일하게 admin·부서장·매니저로 역할을 제한한다.
drop policy if exists "department_weekly_contents_write_parent" on public.department_weekly_contents;
create policy "department_weekly_contents_write_parent" on public.department_weekly_contents
  for all to authenticated using (
    public.current_app_role() in ('admin', 'department_head', 'manager')
    and exists (
      select 1 from public.department_weekly_submissions s
      where s.id = submission_id
        and public.can_access_department(s.department_id)
        and s.status in ('draft', 'division_rejected')
    )
  ) with check (
    public.current_app_role() in ('admin', 'department_head', 'manager')
    and exists (
      select 1 from public.department_weekly_submissions s
      where s.id = submission_id
        and public.can_access_department(s.department_id)
        and s.status in ('draft', 'division_rejected')
    )
  );

-- M-5: SECURITY DEFINER 함수들의 search_path에 pg_temp를 명시(마지막)해 임시테이블 섀도잉 여지를 제거한다.
-- 함수 본문은 건드리지 않고 설정만 바꾸므로 동작·성능 영향이 없다.
alter function public.admin_edit_client_report_item(uuid, text, text) set search_path = public, pg_temp;
alter function public.bulk_import_clients_atomic(jsonb) set search_path = public, pg_temp;
alter function public.can_access_department(uuid) set search_path = public, pg_temp;
alter function public.can_write_client_report(uuid, uuid, public.client_report_status) set search_path = public, pg_temp;
alter function public.cancel_client_reports_submission_atomic(uuid[]) set search_path = public, pg_temp;
alter function public.cancel_department_submission_atomic(uuid) set search_path = public, pg_temp;
alter function public.client_department_id(uuid) set search_path = public, pg_temp;
alter function public.current_app_role() set search_path = public, pg_temp;
alter function public.current_department_id() set search_path = public, pg_temp;
alter function public.get_header_filter_options() set search_path = public, pg_temp;
alter function public.increment_notice_view(uuid) set search_path = public, pg_temp;
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.is_assigned_client(uuid) set search_path = public, pg_temp;
alter function public.is_assigned_department_client(uuid, uuid) set search_path = public, pg_temp;
alter function public.is_department_client(uuid, uuid) set search_path = public, pg_temp;
alter function public.save_client_report_atomic(uuid, uuid, uuid, date, date, integer, integer, integer, text, boolean, jsonb, jsonb) set search_path = public, pg_temp;
alter function public.save_department_submission_atomic(uuid, uuid, date, date, integer, integer, integer, text, text, jsonb) set search_path = public, pg_temp;
alter function public.soft_delete_client_reports_atomic(uuid[]) set search_path = public, pg_temp;
alter function public.soft_delete_notices_atomic(uuid[]) set search_path = public, pg_temp;
alter function public.submit_client_reports_atomic(uuid[]) set search_path = public, pg_temp;
alter function public.transition_client_report_status(uuid, text, text) set search_path = public, pg_temp;
alter function public.transition_department_submission_status(uuid, text, text) set search_path = public, pg_temp;

-- 롤백: 정책은 012_harden_review_permissions.sql의 원본으로 되돌리고,
-- 함수는 `alter function ... set search_path = public;`으로 되돌린다. (새 migration 파일로 적용)
