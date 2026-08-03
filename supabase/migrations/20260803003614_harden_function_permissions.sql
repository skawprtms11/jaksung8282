-- SECURITY DEFINER functions are privileged application RPCs and RLS helpers.
-- Keep their explicit authenticated/service_role grants, but remove anonymous
-- execution through both the anon role and PostgreSQL's implicit PUBLIC role.
revoke execute on function public.bulk_import_clients_atomic(jsonb) from anon, public;
revoke execute on function public.can_access_department(uuid) from anon, public;
revoke execute on function public.can_write_client_report(uuid, uuid, public.client_report_status) from anon, public;
revoke execute on function public.cancel_client_reports_submission_atomic(uuid[]) from anon, public;
revoke execute on function public.cancel_department_submission_atomic(uuid) from anon, public;
revoke execute on function public.client_department_id(uuid) from anon, public;
revoke execute on function public.current_app_role() from anon, public;
revoke execute on function public.current_department_id() from anon, public;
revoke execute on function public.get_header_filter_options() from anon, public;
revoke execute on function public.increment_notice_view(uuid) from anon, public;
revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.is_assigned_client(uuid) from anon, public;
revoke execute on function public.is_assigned_department_client(uuid, uuid) from anon, public;
revoke execute on function public.is_department_client(uuid, uuid) from anon, public;
revoke execute on function public.save_client_report_atomic(uuid, uuid, uuid, date, date, integer, integer, integer, text, boolean, jsonb, jsonb) from anon, public;
revoke execute on function public.save_department_submission_atomic(uuid, uuid, date, date, integer, integer, integer, text, text, jsonb) from anon, public;
revoke execute on function public.soft_delete_client_reports_atomic(uuid[]) from anon, public;
revoke execute on function public.soft_delete_notices_atomic(uuid[]) from anon, public;
revoke execute on function public.submit_client_reports_atomic(uuid[]) from anon, public;
revoke execute on function public.transition_client_report_status(uuid, text, text) from anon, public;
revoke execute on function public.transition_department_submission_status(uuid, text, text) from anon, public;

-- Functions created by repository migrations are owned by postgres. Prevent
-- future functions from inheriting anonymous/PUBLIC execution automatically.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, public;

-- The trigger body only uses NEW and pg_catalog.now(), so an empty fixed path
-- removes search-path resolution ambiguity without changing trigger behavior.
alter function public.set_updated_at() set search_path = '';
