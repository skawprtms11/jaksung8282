-- Simplify hot permission helpers used by RLS.
-- This keeps the same access rules but avoids nested profile lookups such as
-- can_access_department -> is_admin -> current_app_role.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.app_role = 'admin'
  );
$$;

create or replace function public.can_access_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.app_role = 'admin'
        or p.department_id = target_department_id
      )
  );
$$;

create or replace function public.is_assigned_department_client(target_department_id uuid, target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.client_assignments ca
      on ca.user_id = p.id
     and ca.department_id = target_department_id
     and ca.client_id = target_client_id
     and ca.is_active = true
    where p.id = auth.uid()
      and p.department_id = target_department_id
      and p.is_active = true
  );
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
    from public.profiles p
    join public.client_assignments ca
      on ca.user_id = p.id
     and ca.department_id = p.department_id
     and ca.client_id = target_client_id
     and ca.is_active = true
    where p.id = auth.uid()
      and p.is_active = true
  );
$$;

create or replace function public.can_write_client_report(
  target_department_id uuid,
  target_client_id uuid,
  target_status public.client_report_status
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
  actor_department_id uuid;
begin
  select p.app_role, p.department_id
    into actor_role, actor_department_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if actor_role is null then
    return false;
  end if;

  if not public.is_department_client(target_department_id, target_client_id) then
    return false;
  end if;

  if target_status not in ('draft', 'rejected') then
    return false;
  end if;

  if actor_role = 'admin' then
    return true;
  end if;

  if actor_department_id is distinct from target_department_id then
    return false;
  end if;

  if actor_role in ('department_head', 'manager') then
    return true;
  end if;

  if actor_role = 'client_owner' then
    return public.is_assigned_department_client(target_department_id, target_client_id);
  end if;

  return false;
end;
$$;
