create table if not exists public.center_masters (
  id uuid primary key default gen_random_uuid(),
  source_center_id uuid not null unique,
  center_name text not null,
  address text,
  notes text,
  source_status text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  is_active boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

drop trigger if exists center_masters_set_updated_at on public.center_masters;
create trigger center_masters_set_updated_at
before update on public.center_masters
for each row execute function public.set_updated_at();

alter table public.center_masters enable row level security;

drop policy if exists "center_masters_select_master_viewers" on public.center_masters;
create policy "center_masters_select_master_viewers" on public.center_masters
  for select to authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.app_role in ('admin', 'department_head', 'manager')
    )
  );

drop policy if exists "center_masters_admin_insert" on public.center_masters;
create policy "center_masters_admin_insert" on public.center_masters
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "center_masters_admin_update" on public.center_masters;
create policy "center_masters_admin_update" on public.center_masters
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists center_masters_active_name_idx
  on public.center_masters(center_name)
  where is_active = true;
