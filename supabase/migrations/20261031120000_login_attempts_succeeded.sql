-- 보안 보완(2026-10-31 3차 점검): 같은 이메일 전체 30회 실패 잠금을 이용한 계정 잠금(DoS) 완화.
-- 로그인 성공도 login_attempts 에 succeeded = true 1행(이메일 해시 + IP 해시)으로 남긴다.
-- 최근 30일 안에 성공 기록이 있는 IP(신뢰 IP)는 이메일 전체 잠금(15분 30회)에서 제외하고,
--   그 IP 자체의 같은 이메일·같은 IP 5회 제한은 그대로 적용한다(src/lib/auth/login-lock.ts).
-- 'unknown' IP 버킷은 신뢰 IP 로 쓰지 않으며 성공 기록도 남기지 않는다.
-- 성공 시 해당 이메일·IP 의 기존 행(실패·이전 성공)을 지운 뒤 성공 1행을 기록하고, 30일 지난 성공 행은 앱이 정리한다.
-- 기존 행은 기본값 false(실패)로 채워져 지금과 같이 실패로 집계된다.
-- RLS(정책 없음)·anon/authenticated 권한 회수 상태는 그대로 유지된다(service_role 전용).
--
-- 적용 순서: 이 파일을 코드 배포보다 먼저 적용한다. 열이 없는 상태에서 새 코드가 돌면 조회가 실패해
--   제한이 꺼진 채(로그만 남김) 로그인이 허용된다. 이전 코드는 이 열을 무시하고 성공 행도 만들지 않으므로
--   먼저 적용해도 안전하다.
--
-- 되돌리기(새 migration 파일로 적용, 이전 코드로 되돌린 뒤):
--   delete from public.login_attempts where succeeded;
--   drop index if exists public.login_attempts_success_idx;
--   alter table public.login_attempts drop column if exists succeeded;

alter table public.login_attempts add column if not exists succeeded boolean not null default false;

create index if not exists login_attempts_success_idx
  on public.login_attempts (email_hash, ip_hash, created_at desc)
  where succeeded;

alter table public.login_attempts enable row level security;

revoke all on table public.login_attempts from anon, authenticated;
