-- 보안 보완(2026-10-31 2차 점검) [4]: 관리자 비밀번호 초기화 시 대상 사용자의 기존 세션을 모두 끊는다.
-- 초기화 전 탈취된 세션이 살아 있으면 그 세션으로 강제 변경 화면에 들어가 비밀번호를 가로챌 수 있었다.
-- auth.sessions 를 지우면 연결된 refresh_tokens 는 FK(on delete cascade)로 함께 지워지지만,
-- session_id 가 없는 구형 리프레시 토큰이 남을 수 있어 user_id 기준으로도 직접 지운다(refresh_tokens.user_id 는 문자열).
-- 이미 발급된 access token(JWT)은 만료(기본 1시간)까지 서명 검증만으로는 유효하다. 다만 갱신은 불가하고,
-- Auth 서버를 거치는 getUser()·updateUser() 는 세션이 없어 실패하므로 비밀번호 변경 탈취는 막힌다.
-- service_role(admin 클라이언트, resetUserPasswordAction)만 실행할 수 있다.
--
-- 적용 순서: 이 파일을 코드 배포보다 먼저 적용한다. 함수가 없으면 초기화는 되지만 관리자에게 세션 종료 실패 경고가 뜬다.
--
-- 되돌리기(새 migration 파일로 적용):
--   drop function if exists public.revoke_user_sessions(uuid);

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_count integer;
begin
  if p_user_id is null then
    raise exception '세션을 종료할 사용자를 지정하세요.';
  end if;

  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;

revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
