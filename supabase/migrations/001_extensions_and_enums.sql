create extension if not exists "pgcrypto";

do $$ begin
  create type public.app_role as enum ('admin', 'department_head', 'manager', 'client_owner');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notice_type as enum ('general', 'important', 'urgent', 'system');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.client_report_status as enum ('draft', 'submitted', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.department_submission_status as enum ('draft', 'submitted_to_division', 'division_approved', 'division_rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.item_period as enum ('current', 'next');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.importance_level as enum ('very_high', 'high', 'medium', 'low');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.volume_type as enum ('inbound', 'outbound', 'inventory', 'order', 'return', 'etc');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.volume_unit as enum ('EA', 'BOX', 'CASE', 'PLT', 'case_count', 'TON', 'CBM', 'etc');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.department_section_type as enum ('common', 'facility', 'vacancy', 'holiday_work');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.approval_target_type as enum ('client_report', 'department_submission');
exception when duplicate_object then null;
end $$;
