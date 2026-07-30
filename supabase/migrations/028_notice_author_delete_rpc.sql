-- Allow notice authors to soft delete their own notices through a narrow RPC.
-- RLS stays enabled; the function validates ownership/admin role before updating.

create index if not exists notices_created_by_active_idx
  on public.notices(created_by, created_at desc)
  where deleted_at is null;

create or replace function public.soft_delete_notices_atomic(p_notice_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  expected_count integer;
  found_count integer := 0;
  affected_count integer := 0;
  target public.notices%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select count(*) into expected_count
  from (
    select distinct notice_id
    from unnest(coalesce(p_notice_ids, array[]::uuid[])) as selected(notice_id)
  ) selected;

  if expected_count = 0 then
    raise exception '삭제할 게시글을 선택하세요.';
  end if;

  for target in
    select *
    from public.notices
    where id = any(p_notice_ids)
      and deleted_at is null
    order by id
    for update
  loop
    found_count := found_count + 1;

    if actor_role <> 'admin' and target.created_by is distinct from actor_id then
      raise exception '본인이 작성한 게시글만 삭제할 수 있습니다.';
    end if;
  end loop;

  if found_count <> expected_count then
    raise exception '선택한 게시글 중 삭제할 수 없는 게시글이 있습니다.';
  end if;

  update public.notices
  set deleted_at = now(),
      deleted_by = actor_id,
      is_active = false,
      updated_by = actor_id,
      updated_at = now()
  where id = any(p_notice_ids)
    and deleted_at is null
    and (actor_role = 'admin' or created_by = actor_id);

  get diagnostics affected_count = row_count;
  if affected_count <> expected_count then
    raise exception '선택한 게시글 중 삭제할 수 없는 게시글이 있습니다.';
  end if;

  return jsonb_build_object('ok', true, 'count', affected_count);
end;
$$;

revoke all on function public.soft_delete_notices_atomic(uuid[]) from public;
grant execute on function public.soft_delete_notices_atomic(uuid[]) to authenticated;
