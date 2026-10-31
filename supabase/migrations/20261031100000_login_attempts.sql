-- 보안 보완(2026-10-31 점검) 3번: 계정별 로그인 실패 제한용 시도 기록 테이블.
-- 같은 이메일로 15분 안에 5회 실패하면 15분간 로그인을 막는다(판정·정리는 src/actions/auth.ts).
-- 이메일 원문은 저장하지 않고 소문자 정규화 후 sha256 해시만 저장한다.
-- service_role(admin 클라이언트)로만 접근한다. RLS 활성화 + 정책 없음 = 일반 사용자 접근 전면 차단.
-- 앱 코드는 이 표가 없으면 제한 없이 로그인을 허용하므로(로그만 남김) 코드보다 먼저·나중 어느 쪽에 적용해도 된다.
--
-- 되돌리기(새 migration 파일로 적용):
--   drop table if exists public.login_attempts;

create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_email_created_idx
  on public.login_attempts (email_hash, created_at desc);
create index if not exists login_attempts_created_idx
  on public.login_attempts (created_at);

alter table public.login_attempts enable row level security;

revoke all on table public.login_attempts from anon, authenticated;
