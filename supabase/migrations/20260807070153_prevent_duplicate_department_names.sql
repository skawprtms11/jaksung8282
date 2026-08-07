create or replace function public.prevent_duplicate_department_name()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  normalized_name text := lower(btrim(new.department_name));
begin
  if tg_op = 'UPDATE' and lower(btrim(old.department_name)) = normalized_name then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(normalized_name, 0));

  if exists (
    select 1
    from public.departments department
    where department.id <> new.id
      and lower(btrim(department.department_name)) = normalized_name
  ) then
    raise exception using
      errcode = '23505',
      message = 'duplicate department name',
      constraint = 'departments_department_name_normalized_key';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_duplicate_department_name() from public, anon, authenticated;

drop trigger if exists departments_prevent_duplicate_name on public.departments;
create trigger departments_prevent_duplicate_name
before insert or update of department_name on public.departments
for each row
execute function public.prevent_duplicate_department_name();
