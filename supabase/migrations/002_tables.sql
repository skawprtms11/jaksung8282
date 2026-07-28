create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  department_code text not null unique,
  department_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  employee_no text not null unique,
  full_name text not null,
  department_id uuid references public.departments(id),
  app_role public.app_role not null default 'client_owner',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique,
  client_name text not null,
  notes text,
  department_id uuid references public.departments(id),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  unique (client_id, user_id)
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  notice_type public.notice_type not null default 'general',
  title text not null,
  content text not null,
  is_pinned boolean not null default false,
  publish_start_date date,
  publish_end_date date,
  view_count integer not null default 0 check (view_count >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists public.work_categories (
  id uuid primary key default gen_random_uuid(),
  category_code text not null unique,
  category_name text not null,
  icon_key text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.weekly_client_reports (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  week_end_date date not null,
  report_year integer not null check (report_year between 2020 and 2100),
  report_month integer not null check (report_month between 1 and 12),
  week_of_month integer not null check (week_of_month between 1 and 6),
  department_id uuid not null references public.departments(id),
  client_id uuid not null references public.clients(id),
  status public.client_report_status not null default 'draft',
  no_special_issue boolean not null default false,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  submitted_at timestamptz,
  department_reviewed_by uuid references auth.users(id),
  department_reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists public.weekly_client_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.weekly_client_reports(id) on delete cascade,
  item_period public.item_period not null,
  importance public.importance_level not null default 'medium',
  work_category_id uuid not null references public.work_categories(id),
  title text not null check (length(btrim(title)) > 0),
  content text not null check (length(btrim(content)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_volumes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.weekly_client_reports(id) on delete cascade,
  volume_type public.volume_type not null,
  quantity numeric(14, 2) not null check (quantity >= 0),
  unit public.volume_unit not null,
  custom_unit text,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.department_weekly_submissions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id),
  week_start_date date not null,
  week_end_date date not null,
  report_year integer not null check (report_year between 2020 and 2100),
  report_month integer not null check (report_month between 1 and 12),
  week_of_month integer not null check (week_of_month between 1 and 6),
  status public.department_submission_status not null default 'draft',
  exception_reason text,
  finalized_by uuid references auth.users(id),
  finalized_at timestamptz,
  division_reviewed_by uuid references auth.users(id),
  division_reviewed_at timestamptz,
  division_review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists public.department_weekly_contents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.department_weekly_submissions(id) on delete cascade,
  section_type public.department_section_type not null,
  current_week_content text not null default '',
  next_week_content text not null default '',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  unique (submission_id, section_type)
);

create table if not exists public.approval_history (
  id uuid primary key default gen_random_uuid(),
  target_type public.approval_target_type not null,
  target_id uuid not null,
  action text not null,
  previous_status text,
  next_status text not null,
  comment text,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
