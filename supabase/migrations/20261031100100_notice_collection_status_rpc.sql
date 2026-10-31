-- 보안 보완(2026-10-31 점검) 6번: 긴급(자료취합) 공지 부서별 완료여부를 원자적으로 갱신한다.
-- 기존에는 서버 액션이 content(JSON 문자열)를 읽고 → 자기 부서 행을 바꾼 뒤 → 서비스 키로 통째로 덮어써서
-- 여러 부서가 동시에 입력하면 먼저 저장한 부서의 완료여부가 사라질 수 있었다.
-- 이 함수는 공지 행을 FOR UPDATE 로 잠근 상태에서 collectionStatuses 배열의 호출자 부서 항목만 교체한다.
-- 호출자는 로그인·활성·역할 지정(current_app_role() not null)·소속 부서(활성) 보유가 필수이며,
-- 자기 소속 부서의 항목만 바꿀 수 있다(부서는 인자로 받지 않고 profiles 에서 읽는다).
--
-- 되돌리기(새 migration 파일로 적용):
--   drop function if exists public.set_notice_collection_status(uuid, boolean);
--   (앱 코드는 saveNoticeCollectionStatusAction 의 이전 버전 — admin 클라이언트로 content 전체 update — 으로 되돌린다)

create or replace function public.set_notice_collection_status(
  p_notice_id uuid,
  p_is_completed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  actor_name text;
  actor_department_name text;
  target public.notices%rowtype;
  parsed jsonb;
  statuses jsonb;
  next_row jsonb;
begin
  if actor_id is null or actor_role is null then
    raise exception '로그인이 필요하거나 사용 승인되지 않은(비활성) 계정입니다.';
  end if;

  if actor_department_id is null then
    raise exception '소속 부서가 지정된 사용자만 완료여부를 입력할 수 있습니다.';
  end if;

  select p.full_name, d.department_name
    into actor_name, actor_department_name
  from public.profiles p
  join public.departments d on d.id = p.department_id
  where p.id = actor_id
    and p.is_active = true
    and d.id = actor_department_id
    and d.is_active = true;

  if actor_department_name is null then
    raise exception '소속 부서가 지정된 사용자만 완료여부를 입력할 수 있습니다.';
  end if;

  select *
    into target
  from public.notices
  where id = p_notice_id
    and notice_type = 'urgent'
    and is_active = true
    and deleted_at is null
  for update;

  if not found then
    raise exception '자료취합 공지사항을 찾을 수 없습니다.';
  end if;

  -- content 는 앱의 tpl-notice-content/v1 JSON 문자열이거나 예전 일반 텍스트다(src/lib/notices/content.ts 와 같은 규칙).
  begin
    parsed := target.content::jsonb;
  exception when invalid_text_representation then
    parsed := null;
  end;

  if parsed is null
    or jsonb_typeof(parsed) <> 'object'
    or parsed->>'format' is distinct from 'tpl-notice-content/v1' then
    parsed := jsonb_build_object(
      'format', 'tpl-notice-content/v1',
      'detail', regexp_replace(coalesce(target.content, ''), '^\s+|\s+$', '', 'g'),
      'note', '',
      'collectionStatuses', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
    into statuses
  from jsonb_array_elements(
    case when jsonb_typeof(parsed->'collectionStatuses') = 'array' then parsed->'collectionStatuses' else '[]'::jsonb end
  ) with ordinality as status_rows(elem, ord)
  where elem->>'department_id' is distinct from actor_department_id::text;

  next_row := jsonb_build_object(
    'department_id', actor_department_id,
    'department_name', actor_department_name,
    'is_completed', coalesce(p_is_completed, false),
    'confirmer_name', case when p_is_completed then btrim(actor_name) else '' end
  );
  if p_is_completed then
    next_row := next_row || jsonb_build_object(
      'updated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  end if;

  parsed := jsonb_set(parsed, '{collectionStatuses}', statuses || jsonb_build_array(next_row), true);

  update public.notices
  set content = parsed::text,
      updated_by = actor_id,
      updated_at = now()
  where id = target.id;

  return next_row;
end;
$$;

revoke all on function public.set_notice_collection_status(uuid, boolean) from public;
revoke all on function public.set_notice_collection_status(uuid, boolean) from anon;
grant execute on function public.set_notice_collection_status(uuid, boolean) to authenticated;
