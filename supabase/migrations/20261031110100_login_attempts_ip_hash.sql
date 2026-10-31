-- 보안 보완(2026-10-31 2차 점검) [3]: 로그인 실패 제한을 (이메일 해시 + 클라이언트 IP 해시) 기준으로 바꾼다.
-- 기존에는 이메일만으로 세어 타인이 남의 이메일로 5회 틀리면 그 계정을 15분간 잠글 수 있었다(DoS).
-- 판정(src/lib/auth/login-lock.ts): 같은 이메일·같은 IP 15분 5회 실패 → 15분 차단,
--   같은 이메일 전체(IP 무관) 15분 30회 실패 → 15분 차단(분산 대입 방어).
-- IP 는 원문 대신 sha256 해시만 저장하며, IP 헤더가 없는 요청은 'unknown' 하나로 묶는다.
-- 기존 행(ip_hash = null)은 이메일 전체 집계에만 포함되고 보존 기간(30분) 경과 후 앱이 정리한다.
-- RLS(정책 없음)·anon/authenticated 권한 회수 상태는 그대로 유지된다.
--
-- 적용 순서: 이 파일을 코드 배포보다 먼저 적용한다. 컬럼이 없는 상태에서 새 코드가 돌면
--   조회·기록이 실패해 제한이 꺼진 채(로그만 남김) 로그인이 허용된다. 이전 코드는 이 컬럼을 무시하므로 먼저 적용해도 안전하다.
--
-- 되돌리기(새 migration 파일로 적용, 이전 코드로 되돌린 뒤):
--   drop index if exists public.login_attempts_email_ip_created_idx;
--   alter table public.login_attempts drop column if exists ip_hash;

alter table public.login_attempts add column if not exists ip_hash text;

create index if not exists login_attempts_email_ip_created_idx
  on public.login_attempts (email_hash, ip_hash, created_at desc);
