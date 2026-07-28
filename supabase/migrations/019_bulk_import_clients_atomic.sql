create or replace function public.bulk_import_clients_atomic(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  input_count integer := 0;
  normalized_count integer := 0;
  existing_count integer := 0;
  duplicate_count integer := 0;
  invalid_row_numbers text;
begin
  if actor_id is null or actor_role <> 'admin' then
    raise exception '관리자만 처리할 수 있습니다.';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '일괄등록 데이터를 확인하세요.';
  end if;

  select count(*) into input_count
  from jsonb_array_elements(p_rows);

  if input_count = 0 then
    raise exception '등록할 화주가 없습니다.';
  end if;

  if input_count > 2000 then
    raise exception '한 번에 2000건까지 등록할 수 있습니다.';
  end if;

  drop table if exists pg_temp.bulk_import_clients_raw;
  create temporary table bulk_import_clients_raw (
    ord bigint not null,
    client_code text not null,
    client_name text not null,
    notes text
  ) on commit drop;

  insert into bulk_import_clients_raw (ord, client_code, client_name, notes)
  select ord, client_code, client_name, nullif(notes, '')
  from (
    select
      item.ord,
      btrim(coalesce(item.value->>'client_code', '')) as client_code,
      btrim(coalesce(item.value->>'client_name', '')) as client_name,
      btrim(coalesce(item.value->>'notes', '')) as notes
    from jsonb_array_elements(p_rows) with ordinality as item(value, ord)
  ) parsed
  where client_code <> '' or client_name <> '' or notes <> '';

  if not exists (select 1 from bulk_import_clients_raw) then
    raise exception '등록할 화주가 없습니다.';
  end if;

  select string_agg(ord::text, ', ' order by ord)
    into invalid_row_numbers
  from bulk_import_clients_raw
  where client_code = '' or client_name = '';

  if invalid_row_numbers is not null then
    raise exception '%행의 화주코드와 화주명을 입력하세요.', invalid_row_numbers;
  end if;

  drop table if exists pg_temp.bulk_import_clients_normalized;
  create temporary table bulk_import_clients_normalized as
  select distinct on (client_code)
    client_code,
    client_name,
    notes
  from bulk_import_clients_raw
  order by client_code, ord desc;

  select count(*) into normalized_count from bulk_import_clients_normalized;
  duplicate_count := input_count - normalized_count;

  select count(*)
    into existing_count
  from bulk_import_clients_normalized n
  join public.clients c on c.client_code = n.client_code;

  insert into public.clients (
    client_code,
    client_name,
    notes,
    created_by,
    updated_by
  )
  select
    client_code,
    client_name,
    notes,
    actor_id,
    actor_id
  from bulk_import_clients_normalized
  on conflict (client_code) do update
    set client_name = excluded.client_name,
        notes = excluded.notes,
        updated_by = actor_id,
        updated_at = now();

  return jsonb_build_object(
    'total_count', normalized_count,
    'inserted_count', normalized_count - existing_count,
    'updated_count', existing_count,
    'duplicate_count', duplicate_count
  );
end;
$$;

revoke all on function public.bulk_import_clients_atomic(jsonb) from public;
grant execute on function public.bulk_import_clients_atomic(jsonb) to authenticated;
