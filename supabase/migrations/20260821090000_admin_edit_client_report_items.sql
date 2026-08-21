-- 화주자료 업무 항목의 관리자(관리자·부서장·매니저) 수정 기능.
-- 첫 관리자 수정 시점의 제목·내용을 original_* 컬럼에 보존해
-- 화면에서 기존내용/수정내용을 비교해 보여줄 수 있게 한다.
-- 확정·확정취소·삭제·저장(in-place upsert) 로직은 title/content만 다루므로 영향이 없다.

alter table public.weekly_client_report_items
  add column if not exists original_title text,
  add column if not exists original_content text,
  add column if not exists admin_edited_by uuid references auth.users(id),
  add column if not exists admin_edited_at timestamptz;

create or replace function public.admin_edit_client_report_item(
  p_item_id uuid,
  p_title text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_app_role();
  actor_department_id uuid := public.current_department_id();
  target public.weekly_client_report_items%rowtype;
  parent public.weekly_client_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception '사용자 정보가 없거나 비활성화 상태입니다.';
  end if;

  if actor_role not in ('admin', 'department_head', 'manager') then
    raise exception '관리자 수정 권한이 없습니다. (관리자·부서장·매니저 전용)';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception '제목을 입력하세요.';
  end if;

  select * into target
  from public.weekly_client_report_items
  where id = p_item_id
  for update;

  if not found then
    raise exception '수정할 업무 항목을 찾을 수 없습니다.';
  end if;

  select * into parent
  from public.weekly_client_reports
  where id = target.report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '화주자료를 찾을 수 없습니다.';
  end if;

  if actor_role <> 'admin' and actor_department_id is distinct from parent.department_id then
    raise exception '소속 부서의 화주자료만 관리자 수정할 수 있습니다.';
  end if;

  update public.weekly_client_report_items
  set original_title = coalesce(original_title, title),
      original_content = coalesce(original_content, content),
      title = btrim(p_title),
      content = coalesce(p_content, ''),
      admin_edited_by = actor_id,
      admin_edited_at = now()
  where id = p_item_id;

  select * into target from public.weekly_client_report_items where id = p_item_id;

  return jsonb_build_object(
    'ok', true,
    'id', target.id,
    'title', target.title,
    'content', target.content,
    'original_title', target.original_title,
    'original_content', target.original_content,
    'admin_edited_at', target.admin_edited_at
  );
end;
$$;

revoke execute on function public.admin_edit_client_report_item(uuid, text, text) from anon, public;
grant execute on function public.admin_edit_client_report_item(uuid, text, text) to authenticated;

-- 롤백 절차 (새 migration 파일로 추가해 적용할 것)
-- drop function if exists public.admin_edit_client_report_item(uuid, text, text);
-- alter table public.weekly_client_report_items
--   drop column if exists original_title,
--   drop column if exists original_content,
--   drop column if exists admin_edited_by,
--   drop column if exists admin_edited_at;
