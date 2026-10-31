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
