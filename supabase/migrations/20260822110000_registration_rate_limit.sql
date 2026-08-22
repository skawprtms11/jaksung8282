-- H-1 보강: 미인증 가입 요청 레이트리밋용 시도 기록 테이블.
-- service_role(admin 클라이언트)로만 접근한다. RLS 활성화 + 정책 없음 = 일반 사용자 접근 전면 차단.
-- IP는 원문 대신 해시로 저장한다.
create table if not exists public.registration_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists registration_attempts_ip_created_idx
  on public.registration_attempts (ip_hash, created_at desc);
create index if not exists registration_attempts_email_created_idx
  on public.registration_attempts (email, created_at desc);

alter table public.registration_attempts enable row level security;

-- 롤백: drop table if exists public.registration_attempts;
