-- 부서별화주등록(/client-registrations): 주간자료 전용 '운영 화주' 표와 등록·담당자 저장 RPC.
-- 대표님 결정(2026-11-02)
--   - 운영 화주는 현황관리(now)의 부서-화주 연결(now.department_client → public.department_client_links 사본) 중에서 고른다.
--     now 와 department_client_links 는 건드리지 않는다(현황관리 소유·가드 표, 트리거 추가 금지).
--   - 현황관리에서 연결이 해제(is_active = false 또는 행 없음)되면 운영 화주에서도 빠진 것으로 취급한다.
--     이 표의 행은 그대로 두고, 조회할 때 활성 연결과 교집합으로 계산한다(앱: src/lib/masters/operating-clients.ts).
--   - 담당자(client_assignments)는 해당 부서 소속 활성 사용자 여러 명, 대표 1명.
--   - 등록·수정: 관리자 전체 부서, 부서장·매니저 소속 부서만. 화주담당자·역할 NULL 은 차단.
-- 초기값: 적용 시점의 활성 연결 쌍 전부를 운영 화주로 넣어 화면 변화 없이 시작한다.
--   적용 이후 현황관리에서 새로 연결된 화주는 부서별화주등록에서 운영 체크해야 작성 목록에 나타난다.
-- 쓰기는 아래 RPC 로만 한다(insert/update/delete 정책 없음). anon 권한 없음.
--
-- 적용 순서: 이 파일을 코드 배포보다 먼저 적용한다. 기존 앱은 이 표·함수를 쓰지 않으므로 먼저 적용해도 안전하다.
--
-- 되돌리기(새 migration 파일로 적용, 이전 코드로 되돌린 뒤):
--   drop function if exists public.save_department_client_assignments(uuid, uuid, uuid[], uuid);
--   drop function if exists public.save_department_operating_clients(uuid, uuid[]);
--   drop table if exists public.department_operating_clients;
--   (save_department_client_assignments 로 저장된 client_assignments 행은 남는다. 필요하면 별도로 정리한다.)
--   부서장·매니저의 client_assignments 직접 쓰기 정책 복원: 008_department_client_registration_policies.sql 18~47행의
--     "client_assignments_department_leads_insert" / "client_assignments_department_leads_update" 정의를 그대로 다시 create policy.

create table if not exists public.department_operating_clients (
  id uuid primary key default gen_random_uuid(),
  -- 현황관리 사본 표가 행을 지울 때 막히지 않도록 연결 표(department_client_links)와 같이 cascade 로 둔다.
  department_id uuid not null references public.departments(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (department_id, client_id)
);

create index if not exists department_operating_clients_department_active_idx
  on public.department_operating_clients(department_id, is_active);

drop trigger if exists department_operating_clients_set_updated_at on public.department_operating_clients;
create trigger department_operating_clients_set_updated_at
  before update on public.department_operating_clients
  for each row execute function public.set_updated_at();

alter table public.department_operating_clients enable row level security;

revoke all on table public.department_operating_clients from public, anon;
revoke all on table public.department_operating_clients from authenticated;
grant select on table public.department_operating_clients to authenticated;

drop policy if exists "department_operating_clients_select_accessible" on public.department_operating_clients;
create policy "department_operating_clients_select_accessible" on public.department_operating_clients
  for select to authenticated using (
    public.current_app_role() is not null
    and public.can_access_department(department_id)
  );

-- 담당자 배정 쓰기는 save_department_client_assignments RPC 로 일원화한다.
-- 부서장·매니저의 client_assignments 직접 insert/update 정책(008)을 제거한다. 관리자 정책(004)과 조회 정책은 그대로 둔다.
-- 앱에는 client_assignments 직접 쓰기 경로가 없다(조회만, 쓰기는 이 RPC).
drop policy if exists "client_assignments_department_leads_insert" on public.client_assignments;
drop policy if exists "client_assignments_department_leads_update" on public.client_assignments;

insert into public.department_operating_clients (department_id, client_id, is_active)
select dcl.department_id, dcl.client_id, true
from public.department_client_links dcl
where dcl.is_active = true
on conflict (department_id, client_id) do nothing;

-- 운영 화주 저장: p_client_ids 가 이 부서의 운영 화주 전체 목록이다.
-- 목록에 없는 기존 행은 미운영(is_active = false)으로 바꾸되, 현재 활성 연결이 있는 화주만 바꾼다
-- (연결 해제로 화면에 보이지 않는 행은 건드리지 않아, now 에서 다시 연결되면 이전 운영 여부가 살아난다).
create or replace function public.save_department_operating_clients(p_department_id uuid, p_client_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_clients constant integer := 1000;
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  actor_department_id uuid;
  requested_ids uuid[];
  invalid_count integer;
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  select p.app_role, p.department_id
    into actor_role, actor_department_id
  from public.profiles p
  where p.id = actor_id
    and p.is_active = true;

  if actor_role is null then
    raise exception '부서별 화주 등록 권한이 없습니다.' using errcode = 'P0001';
  end if;
  if p_department_id is null then
    raise exception '부서를 선택하세요.' using errcode = 'P0001';
  end if;
  -- 부서 없는 부서장·매니저(actor_department_id NULL)가 NULL 비교로 통과하지 않도록 NULL 안전하게 판정한다.
  if not coalesce(
    actor_role = 'admin'
    or (
      actor_role in ('department_head', 'manager')
      and actor_department_id is not null
      and actor_department_id = p_department_id
    ),
    false
  ) then
    raise exception '관리자 또는 소속 부서의 부서장·매니저만 운영 화주를 등록할 수 있습니다.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.departments d where d.id = p_department_id and d.is_active = true
  ) then
    raise exception '사용 중인 부서만 운영 화주를 등록할 수 있습니다.' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_client_ids), 0) > c_max_clients then
    raise exception '한 번에 저장할 수 있는 화주는 1,000건까지입니다.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct requested.client_id), '{}'::uuid[])
    into requested_ids
  from unnest(coalesce(p_client_ids, '{}'::uuid[])) as requested(client_id)
  where requested.client_id is not null;

  select count(*)
    into invalid_count
  from unnest(requested_ids) as requested(client_id)
  where not exists (
    select 1
    from public.department_client_links dcl
    join public.clients c on c.id = dcl.client_id and c.is_active = true
    where dcl.department_id = p_department_id
      and dcl.client_id = requested.client_id
      and dcl.is_active = true
  );
  if invalid_count > 0 then
    raise exception '현황관리에서 이 부서에 연결된 사용 중 화주만 운영 화주로 등록할 수 있습니다.' using errcode = 'P0001';
  end if;

  -- 같은 부서를 동시에 저장할 때 결과가 섞이지 않게 부서 단위로 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended('department_operating_clients:' || p_department_id::text, 0));

  update public.department_operating_clients doc
  set is_active = false,
      updated_by = actor_id
  where doc.department_id = p_department_id
    and doc.is_active = true
    and not (doc.client_id = any(requested_ids))
    and exists (
      select 1
      from public.department_client_links dcl
      where dcl.department_id = doc.department_id
        and dcl.client_id = doc.client_id
        and dcl.is_active = true
    );

  insert into public.department_operating_clients as doc
    (department_id, client_id, is_active, created_by, updated_by)
  select p_department_id, requested.client_id, true, actor_id, actor_id
  from unnest(requested_ids) as requested(client_id)
  on conflict (department_id, client_id) do update
    set is_active = true,
        updated_by = excluded.updated_by
    where doc.is_active = false;

  return jsonb_build_object(
    'department_id', p_department_id,
    'operating_count', cardinality(requested_ids)
  );
end;
$$;

revoke all on function public.save_department_operating_clients(uuid, uuid[]) from public, anon;
grant execute on function public.save_department_operating_clients(uuid, uuid[]) to authenticated;

-- 화주 담당자 저장(기존 saveDepartmentClientAssignmentsAction 대체).
-- 화주는 이 부서의 운영 화주(운영 표 활성 ∩ 활성 연결 ∩ 사용 중 화주), 담당자는 이 부서 소속 활성 사용자(역할 지정됨).
-- 대표 담당자는 목록 중 하나여야 하고, 비우면 목록의 첫 사용자. 빈 목록이면 담당자를 모두 해제한다.
-- 기존 배정을 모두 비활성화한 뒤 (department_id, client_id, user_id) 기준으로 upsert 한다.
create or replace function public.save_department_client_assignments(
  p_department_id uuid,
  p_client_id uuid,
  p_user_ids uuid[],
  p_primary_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_users constant integer := 100;
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  actor_department_id uuid;
  requested_ids uuid[];
  valid_count integer;
  resolved_primary_id uuid;
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = 'P0001';
  end if;

  select p.app_role, p.department_id
    into actor_role, actor_department_id
  from public.profiles p
  where p.id = actor_id
    and p.is_active = true;

  if actor_role is null then
    raise exception '화주 담당자 지정 권한이 없습니다.' using errcode = 'P0001';
  end if;
  if p_department_id is null or p_client_id is null then
    raise exception '부서와 화주를 선택하세요.' using errcode = 'P0001';
  end if;
  -- 부서 없는 부서장·매니저(actor_department_id NULL)가 NULL 비교로 통과하지 않도록 NULL 안전하게 판정한다.
  if not coalesce(
    actor_role = 'admin'
    or (
      actor_role in ('department_head', 'manager')
      and actor_department_id is not null
      and actor_department_id = p_department_id
    ),
    false
  ) then
    raise exception '관리자 또는 소속 부서의 부서장·매니저만 화주 담당자를 지정할 수 있습니다.' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_user_ids), 0) > c_max_users then
    raise exception '한 화주에 지정할 수 있는 담당자는 100명까지입니다.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.department_operating_clients doc
    join public.department_client_links dcl
      on dcl.department_id = doc.department_id
     and dcl.client_id = doc.client_id
     and dcl.is_active = true
    join public.clients c on c.id = doc.client_id and c.is_active = true
    join public.departments d on d.id = doc.department_id and d.is_active = true
    where doc.department_id = p_department_id
      and doc.client_id = p_client_id
      and doc.is_active = true
  ) then
    raise exception '이 부서의 운영 화주만 담당자를 지정할 수 있습니다.' using errcode = 'P0001';
  end if;

  -- 중복을 지우되 처음 나온 순서를 지킨다(대표 미지정 시 첫 사용자가 대표).
  select coalesce(array_agg(ordered.user_id order by ordered.first_position), '{}'::uuid[])
    into requested_ids
  from (
    select requested.user_id, min(requested.ord) as first_position
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) with ordinality as requested(user_id, ord)
    where requested.user_id is not null
    group by requested.user_id
  ) as ordered;

  select count(*)
    into valid_count
  from public.profiles p
  where p.id = any(requested_ids)
    and p.department_id = p_department_id
    and p.is_active = true
    and p.app_role is not null;
  if valid_count <> cardinality(requested_ids) then
    raise exception '해당 부서 소속 활성 사용자만 담당자로 지정할 수 있습니다.' using errcode = 'P0001';
  end if;

  if p_primary_user_id is not null and not (p_primary_user_id = any(requested_ids)) then
    raise exception '대표 담당자는 선택한 담당자 중에서 지정하세요.' using errcode = 'P0001';
  end if;
  resolved_primary_id := coalesce(p_primary_user_id, requested_ids[1]);

  perform pg_advisory_xact_lock(
    hashtextextended('client_assignments:' || p_department_id::text || ':' || p_client_id::text, 0)
  );

  update public.client_assignments ca
  set is_active = false
  where ca.department_id = p_department_id
    and ca.client_id = p_client_id
    and ca.is_active = true;

  insert into public.client_assignments as ca
    (department_id, client_id, user_id, is_primary, is_active, assigned_at, assigned_by)
  select p_department_id, p_client_id, requested.user_id, requested.user_id = resolved_primary_id, true, now(), actor_id
  from unnest(requested_ids) as requested(user_id)
  on conflict (department_id, client_id, user_id) do update
    set is_primary = excluded.is_primary,
        is_active = true,
        assigned_at = excluded.assigned_at,
        assigned_by = excluded.assigned_by;

  return jsonb_build_object(
    'department_id', p_department_id,
    'client_id', p_client_id,
    'user_count', cardinality(requested_ids),
    'primary_user_id', resolved_primary_id
  );
end;
$$;

revoke all on function public.save_department_client_assignments(uuid, uuid, uuid[], uuid) from public, anon;
grant execute on function public.save_department_client_assignments(uuid, uuid, uuid[], uuid) to authenticated;
