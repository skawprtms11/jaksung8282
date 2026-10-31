-- 보안 보완(2026-10-31 6차 점검): 비밀번호 재설정 메일 발송 제한의 DoS 완화.
-- 기존(20261031130000)은 같은 이메일 1시간 3회로 막아, 공격자가 피해자 이메일로 3번만 요청해도
--   피해자가 1시간 동안 재설정 메일을 받을 수 없었다.
-- 새 기준(src/lib/auth/password-reset-limit.ts 상수와 같아야 함, tests/password-reset-limit.test.ts 가 확인):
--   같은 (이메일, IP) 쌍 1시간 3회 → reason = 'pair'
--   같은 이메일 전체(IP 무관) 1시간 10회 → reason = 'email'(메일 폭탄 상한)
--   같은 IP 1시간 10회 → reason = 'ip'('unknown' 버킷 제외)
-- 'unknown' 버킷(IP 헤더 없음): IP 기준은 정상 사용자까지 막으므로 걸지 않고, 쌍 기준은 (이메일, 'unknown')
--   쌍으로 그대로 적용한다. 헤더 없는 요청끼리만 이메일당 3회를 나눠 쓰게 되어 기존 이메일 기준과 같은
--   보수적 상한이 유지되고, IP 가 있는 피해자의 쌍 버킷과는 분리되어 DoS 로 번지지 않는다.
-- 시그니처·반환형은 그대로라 코드와 배포 순서 제약이 없다(이 파일만 적용해도 기존 코드가 그대로 동작).
--
-- 되돌리기(새 migration 파일로 적용): 20261031130000_login_attempt_rpc.sql 의
--   create or replace function public.reserve_password_reset ... 본문과 revoke/grant 2줄을 다시 실행한다.

create or replace function public.reserve_password_reset(p_email_hash text, p_ip_hash text)
returns table (blocked boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_pair_limit constant integer := 3;
  c_email_limit constant integer := 10;
  c_ip_limit constant integer := 10;
  c_window constant interval := interval '60 minutes';
  v_ip_hash text := coalesce(nullif(pg_catalog.btrim(p_ip_hash), ''), 'unknown');
  v_now timestamptz := pg_catalog.now();
begin
  if p_email_hash is null or p_email_hash = '' then
    raise exception '재설정 이메일 해시가 비어 있습니다.';
  end if;

  -- 같은 이메일, 같은 IP 요청을 각각 직렬화한다. 로그인 잠금(단일 bigint 키)과 키 공간이 다른 두 정수 키를 쓰고,
  -- 항상 이메일 → IP 순으로 잡아 교착이 생기지 않는다.
  perform pg_catalog.pg_advisory_xact_lock(1, pg_catalog.hashtext(p_email_hash));
  if v_ip_hash <> 'unknown' then
    perform pg_catalog.pg_advisory_xact_lock(2, pg_catalog.hashtext(v_ip_hash));
  end if;

  if (
    select pg_catalog.count(*)
    from public.password_reset_attempts pra
    where pra.email_hash = p_email_hash
      and pra.created_at > v_now - c_window
  ) >= c_email_limit then
    return query select true, 'email'::text;
    return;
  end if;

  -- 'unknown' 도 (이메일, 'unknown') 쌍으로 센다. 헤더 없는 요청끼리만 공유하므로 IP 가 있는 사용자는 막지 않는다.
  if (
    select pg_catalog.count(*)
    from public.password_reset_attempts pra
    where pra.email_hash = p_email_hash
      and pra.ip_hash = v_ip_hash
      and pra.created_at > v_now - c_window
  ) >= c_pair_limit then
    return query select true, 'pair'::text;
    return;
  end if;

  -- 'unknown' 버킷은 헤더 없는 요청 전체가 공유하므로 IP 기준을 걸면 정상 사용자까지 막힌다. 위 두 기준만 적용한다.
  if v_ip_hash <> 'unknown' and (
    select pg_catalog.count(*)
    from public.password_reset_attempts pra
    where pra.ip_hash = v_ip_hash
      and pra.created_at > v_now - c_window
  ) >= c_ip_limit then
    return query select true, 'ip'::text;
    return;
  end if;

  insert into public.password_reset_attempts (email_hash, ip_hash)
  values (p_email_hash, v_ip_hash);

  delete from public.password_reset_attempts pra
  where pra.email_hash = p_email_hash
    and pra.created_at < v_now - c_window;

  delete from public.password_reset_attempts pra
  where pra.id in (
    select old.id
    from public.password_reset_attempts old
    where old.created_at < v_now - c_window
    limit 100
    for update skip locked
  );

  return query select false, 'none'::text;
end;
$$;

revoke execute on function public.reserve_password_reset(text, text) from public, anon, authenticated;
grant execute on function public.reserve_password_reset(text, text) to service_role;
