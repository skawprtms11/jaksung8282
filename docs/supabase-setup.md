# Supabase 설정

1. Supabase 프로젝트를 생성한다.
2. SQL Editor 또는 Supabase CLI로 `supabase/migrations`의 SQL을 파일 순서대로 실행한다.
3. Authentication > Providers에서 Email provider를 활성화한다.
4. Authentication > URL Configuration에 로컬과 Netlify URL을 등록한다.

```bash
supabase link --project-ref <project-ref>
supabase db push
```

## 최초 관리자 생성

Supabase Dashboard에서 Auth 사용자를 먼저 만든 뒤, SQL Editor에서 해당 사용자의 UUID를 넣어 실행한다.

> 경고: 아래 `<admin_email>`, `<employee_no>` 등은 자리표시자다. 예시 값을 그대로 사용하지 말고 실제 관리자 이메일·사번으로 바꾼다. 관리자 Auth 비밀번호도 추측하기 어려운 값으로 정한다.

```sql
insert into public.departments (department_code, department_name, sort_order)
values ('TPL', 'TPL사업부', 1)
on conflict (department_code) do update set department_name = excluded.department_name
returning id;

insert into public.profiles (
  id, email, employee_no, full_name, department_id, app_role, is_active
) values (
  '<auth-user-id>',
  '<admin_email>',
  '<employee_no>',
  '관리자',
  '<department-id>',
  'admin',
  true
);
```

업무구분 seed는 `006_seed_data.sql`에 포함되어 있다.

## 배포 후 점검

마이그레이션 적용 후(특히 표·함수를 새로 만든 뒤) SQL Editor에서 아래를 확인한다.

1. public 스키마에 `anon` 권한이 붙은 표·뷰가 없어야 한다. 결과가 0행이어야 정상이다.

```sql
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
order by table_name, privilege_type;
```

2. 함수 실행권도 같은 방식으로 확인한다(`anon` 이 실행할 수 있는 public 함수가 의도한 것뿐인지).

```sql
select routine_name
from information_schema.role_routine_grants
where routine_schema = 'public'
  and grantee = 'anon'
order by routine_name;
```

- 왜 다시 붙을 수 있나: Supabase 플랫폼 역할 `supabase_admin` 의 기본 권한(default privileges)에 `anon` 이 남아 있어,
  플랫폼(대시보드·확장·플랫폼 작업)이 만든 객체에는 `anon` 권한이 자동으로 붙을 수 있다.
  이 기본 권한은 우리 계정(`postgres`) 권한으로 바꿀 수 없다
  (`alter default privileges for role supabase_admin ...` 실행 시 permission denied 확인).
  그래서 마이그레이션으로 막지 못하고 배포 후 점검으로 잡는다.
- 붙어 있으면 새 migration 파일로 회수한다(대상 표·함수 이름만 바꿔서).

```sql
revoke all on table public.<table_name> from anon;
revoke execute on function public.<function_name>(<arg types>) from public, anon;
```

- 회수 후 1번·2번 쿼리를 다시 실행해 0행(또는 의도한 함수만)인지 확인한다.
