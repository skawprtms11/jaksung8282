-- 부서별화주등록(/client-registrations): 현황관리(now) 인원상세 비중으로 만든 '현황 담당자' 명단 표와 가져오기 RPC.
-- 대표님 결정(2026-11-05)
--   - 현황 담당자는 기존 담당자 배정(client_assignments = 로그인 계정, 화주담당자 권한용)과 별도로 저장·표시한다.
--     계정 유무와 무관한 참고 명단이며, client_assignments·담당자 저장 기능은 그대로 둔다.
--   - 원천: now.employee_status(인원상세) + now.employee_alloc(센터·화주별 비중 %). now 와 public 마스터 표는 읽기만 한다
--     (현황관리 소유·가드 표, 트리거 추가 금지).
--   - 기준 월: 그 부서에서 비중(ratio > 0)이 있는 가장 최근 base_month 를 자동 선택한다. 화면에 기준 월을 표시한다.
--   - 포함 기준: 화주명 기준으로 직원별 비중을 합산해 1% 이상인 담당자. 부서장(duty = '팀장')은 제외한다.
--     같은 직원이 같은 화주에 여러 센터로 나뉘어 있거나, 같은 이름의 화주가 여러 ID 로 있으면 이름(앞뒤 공백 제거)으로 묶어 합산한다.
--     합산 결과는 이 부서에 활성 연결된 사용 중 화주 중 이름이 같은 화주 전부에 붙인다.
--     같은 이름의 연결 화주가 없으면 비중이 잡힌 화주 ID 에 그대로 붙인다(화면 목록에는 나타나지 않고 건수로만 안내).
--   - 직원 키: 사번(emp_no, 앞뒤 공백 제거). 사번이 비어 있으면 'now#' || employee_status.id 로 대신한다.
--     같은 월·부서 안에서 사번은 겹치지 않는다(2026-08 확인). 사번 기준이라 월이 바뀌어도 같은 사람이 같은 키를 갖는다.
--   - 다시 가져오기: 그 부서의 현황 담당자 명단 전체를 교체한다. 비중 자료가 없으면 기존 명단을 지우지 않는다.
--   - 실행: 관리자 전체 부서, 부서장·매니저 소속 부서만. 화주담당자·역할 NULL·비활성은 차단(운영 화주 저장과 같은 규칙).
-- 조회는 가져오기 RPC 와 같은 규칙: 관리자 전체, 부서장·매니저 소속 부서만. 화주담당자·역할 NULL·비활성은 조회 불가.
-- 쓰기는 아래 RPC 로만 한다(insert/update/delete 정책 없음). anon 권한 없음.
--
-- 적용 순서: 이 파일을 코드 배포보다 먼저 적용한다. 기존 앱은 이 표·함수를 쓰지 않으므로 먼저 적용해도 안전하다.
--
-- 되돌리기(새 migration 파일로 적용, 이전 코드로 되돌린 뒤):
--   drop function if exists public.import_department_client_staff_from_now(uuid);
--   drop table if exists public.department_client_staff;

create table if not exists public.department_client_staff (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  emp_no text not null,
  staff_name text not null,
  position text,
  -- 화주명 기준 합산 비중(% 단위, 예: 2.5 = 2.5%)
  ratio numeric not null,
  base_month text not null check (base_month ~ '^[0-9]{4}-[0-9]{2}$'),
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id),
  unique (department_id, client_id, emp_no)
);
-- 부서 조회는 unique(department_id, client_id, emp_no) 인덱스(부서 선두)를 쓰므로 별도 인덱스를 두지 않는다.

alter table public.department_client_staff enable row level security;

revoke all on table public.department_client_staff from public, anon;
revoke all on table public.department_client_staff from authenticated;
grant select on table public.department_client_staff to authenticated;

drop policy if exists "department_client_staff_select_accessible" on public.department_client_staff;
create policy "department_client_staff_select_accessible" on public.department_client_staff
  for select to authenticated using (
    -- 부서 없는 부서장·매니저(current_department_id() NULL)가 NULL 비교로 통과하지 않도록 NULL 안전하게 판정한다.
    coalesce(
      public.current_app_role() is not null
      and (
        public.is_admin()
        or (
          public.current_app_role() in ('department_head', 'manager')
          and public.current_department_id() is not null
          and public.current_department_id() = department_id
        )
      ),
      false
    )
  );

-- 현황에서 가져오기: 이 부서의 최신 비중 월 기준으로 현황 담당자 명단을 통째로 바꾼다.
-- now.department.id = public.departments.id, now.client.id = public.clients.id (2026-11-05 전수 일치 확인).
create or replace function public.import_department_client_staff_from_now(p_department_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_min_ratio constant numeric := 1;
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  actor_department_id uuid;
  v_base_month text;
  v_row_count integer := 0;
  v_staff_count integer := 0;
  v_client_count integer := 0;
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
    raise exception '현황 담당자 가져오기 권한이 없습니다.' using errcode = 'P0001';
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
    raise exception '관리자 또는 소속 부서의 부서장·매니저만 현황 담당자를 가져올 수 있습니다.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.departments d where d.id = p_department_id and d.is_active = true
  ) then
    raise exception '사용 중인 부서만 현황 담당자를 가져올 수 있습니다.' using errcode = 'P0001';
  end if;

  -- 같은 부서를 동시에 가져올 때 지우기·넣기가 섞이지 않게 부서 단위로 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended('department_client_staff:' || p_department_id::text, 0));

  select max(e.base_month)
    into v_base_month
  from now.employee_status e
  where e.dept_id = p_department_id
    and exists (
      select 1 from now.employee_alloc a where a.employee_id = e.id and a.ratio > 0
    );

  -- 비중 자료가 없으면 기존 명단을 그대로 둔다.
  if v_base_month is null then
    return jsonb_build_object('base_month', null, 'staff_count', 0, 'client_count', 0, 'row_count', 0);
  end if;

  delete from public.department_client_staff s where s.department_id = p_department_id;

  with emp as (
    select
      e.id,
      coalesce(nullif(btrim(e.emp_no), ''), 'now#' || e.id::text) as staff_key,
      btrim(e.name) as staff_name,
      nullif(btrim(e.position), '') as position,
      coalesce(btrim(e.duty), '') = '팀장' as is_head
    from now.employee_status e
    where e.dept_id = p_department_id
      and e.base_month = v_base_month
  ),
  heads as (
    select emp.staff_key from emp group by emp.staff_key having bool_or(emp.is_head)
  ),
  by_name as (
    select
      emp.staff_key,
      max(emp.staff_name) as staff_name,
      max(emp.position) as position,
      btrim(c.client_name) as client_name,
      sum(a.ratio) as ratio,
      array_agg(distinct a.client_id) as alloc_client_ids
    from emp
    join now.employee_alloc a on a.employee_id = emp.id
    join public.clients c on c.id = a.client_id
    where a.ratio is not null
      and not exists (select 1 from heads h where h.staff_key = emp.staff_key)
    group by emp.staff_key, btrim(c.client_name)
    having sum(a.ratio) >= c_min_ratio
  ),
  linked as (
    select dcl.client_id, btrim(c.client_name) as client_name
    from public.department_client_links dcl
    join public.clients c on c.id = dcl.client_id and c.is_active = true
    where dcl.department_id = p_department_id
      and dcl.is_active = true
  )
  insert into public.department_client_staff
    (department_id, client_id, emp_no, staff_name, position, ratio, base_month, imported_by)
  select p_department_id, target.client_id, b.staff_key, coalesce(b.staff_name, ''), b.position, b.ratio, v_base_month, actor_id
  from by_name b
  cross join lateral (
    select l.client_id from linked l where l.client_name = b.client_name
    union all
    select alloc.client_id
    from unnest(b.alloc_client_ids) as alloc(client_id)
    where not exists (select 1 from linked l where l.client_name = b.client_name)
  ) as target;

  get diagnostics v_row_count = row_count;

  select count(distinct s.emp_no), count(distinct s.client_id)
    into v_staff_count, v_client_count
  from public.department_client_staff s
  where s.department_id = p_department_id;

  return jsonb_build_object(
    'base_month', v_base_month,
    'staff_count', v_staff_count,
    'client_count', v_client_count,
    'row_count', v_row_count
  );
end;
$$;

revoke all on function public.import_department_client_staff_from_now(uuid) from public, anon;
grant execute on function public.import_department_client_staff_from_now(uuid) to authenticated;
