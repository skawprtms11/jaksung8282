-- 보안 보완(2026-10-31 4차 점검): 로그인 실패 제한의 판정·기록을 DB 함수 하나로 묶어 경합을 없앤다.
-- 기존에는 앱이 "조회 → 판정 → Supabase 로그인 → 실패 기록" 순으로 나눠 처리해, 같은 이메일로 동시에
--   여러 요청을 보내면 모두 판정을 통과해 임계값보다 많이 시도할 수 있었다.
-- reserve_login_attempt: 같은 이메일을 advisory lock 으로 직렬화한 뒤 판정하고, 차단이 아니면 실패 1행을
--   먼저 기록한다(선기록). 로그인이 성공하면 record_login_success 가 그 행을 지우고 성공 1행을 남긴다.
-- 임계값(src/lib/auth/login-lock.ts 상수와 같아야 함, tests/login-lock.test.ts 가 이 파일을 읽어 확인):
--   같은 이메일·같은 IP 15분 5회 실패 → 그 IP 15분 차단(reason = 'ip')
--   같은 이메일 전체 15분 30회 실패 → 비신뢰 IP 15분 차단(reason = 'email')
--   신뢰 IP = 30일 안에 같은 이메일로 성공 기록이 있는 IP('unknown' 버킷은 제외)
-- email_hash·ip_hash 는 앱이 HMAC-SHA256(서비스 키 파생 키)으로 만든 값이며 'unknown' 은 IP 헤더 없음을 뜻한다.
--
-- 5차 점검 추가: 비밀번호 재설정 메일 발송 제한(password_reset_attempts + reserve_password_reset).
--   같은 이메일 1시간 3회, 같은 IP 1시간 10회('unknown' 버킷은 이메일 기준만 적용)를 넘으면 발송하지 않는다.
--   임계값은 src/lib/auth/password-reset-limit.ts 상수와 같아야 함(tests/password-reset-limit.test.ts 가 확인).
--   로그인 기록(login_attempts)과 표를 나눠 서로의 판정·정리에 섞이지 않게 한다.
--
-- 오래된 행 정리: 각 함수는 자기 이메일(직렬화한 범위) 행만 기다려서 지운다. 다른 이메일의 오래된 행은
--   for update skip locked 로 다른 요청이 잡고 있는 행을 건너뛰며 최대 100행만 지운다(잠금 대기·교착 없음).
--
-- 모든 함수와 표는 service_role(admin 클라이언트)만 쓸 수 있다.
--
-- 적용 순서: 이 파일을 코드 배포보다 먼저 적용한다. 함수가 없는 상태에서 새 코드가 돌면 제한이 꺼진 채
--   (서버 로그만 남김) 로그인·재설정 메일 발송이 허용된다. 이전 코드는 이 함수들을 쓰지 않으므로 먼저 적용해도 안전하다.
--
-- 되돌리기(새 migration 파일로 적용, 이전 코드로 되돌린 뒤):
--   drop function if exists public.reserve_login_attempt(text, text);
--   drop function if exists public.record_login_success(text, text);
--   drop function if exists public.reserve_password_reset(text, text);
--   drop table if exists public.password_reset_attempts;

create or replace function public.reserve_login_attempt(p_email_hash text, p_ip_hash text)
returns table (blocked boolean, reason text, trusted_ip boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_pair_limit constant integer := 5;
  c_email_limit constant integer := 30;
  c_failure_window constant interval := interval '15 minutes';
  c_lock constant interval := interval '15 minutes';
  c_retention constant interval := interval '30 minutes';
  c_trusted_ip constant interval := interval '30 days';
  v_ip_hash text := coalesce(nullif(pg_catalog.btrim(p_ip_hash), ''), 'unknown');
  v_now timestamptz := pg_catalog.now();
  v_pair timestamptz[];
  v_email timestamptz[];
  v_trusted boolean := false;
begin
  if p_email_hash is null or p_email_hash = '' then
    raise exception '로그인 이메일 해시가 비어 있습니다.';
  end if;

  -- 같은 이메일 요청을 트랜잭션 끝까지 직렬화한다(판정과 선기록 사이에 다른 요청이 끼지 못하게).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email_hash, 0));

  select coalesce(pg_catalog.array_agg(recent.created_at order by recent.created_at desc), '{}')
    into v_pair
  from (
    select la.created_at
    from public.login_attempts la
    where la.email_hash = p_email_hash
      and la.ip_hash = v_ip_hash
      and not la.succeeded
      and la.created_at >= v_now - c_retention
    order by la.created_at desc
    limit c_pair_limit
  ) recent;

  select coalesce(pg_catalog.array_agg(recent.created_at order by recent.created_at desc), '{}')
    into v_email
  from (
    select la.created_at
    from public.login_attempts la
    where la.email_hash = p_email_hash
      and not la.succeeded
      and la.created_at >= v_now - c_retention
    order by la.created_at desc
    limit c_email_limit
  ) recent;

  if v_ip_hash <> 'unknown' then
    v_trusted := exists (
      select 1
      from public.login_attempts la
      where la.email_hash = p_email_hash
        and la.ip_hash = v_ip_hash
        and la.succeeded
        and la.created_at > v_now - c_trusted_ip
    );
  end if;

  -- 판정 기준 시점은 마지막 실패 시각이다. 차단 중에는 실패를 더 기록하지 않으므로 최신 실패가 차단 시작점이다.
  -- 이메일 전체 잠금을 먼저 본다. 둘 다 걸린 비신뢰 IP 에도 재설정 메일 안내가 나가게 하기 위해서다.
  if not v_trusted
    and pg_catalog.cardinality(v_email) >= c_email_limit
    and v_email[1] - v_email[c_email_limit] <= c_failure_window
    and v_now - v_email[1] < c_lock then
    return query select true, 'email'::text, v_trusted;
    return;
  end if;

  if pg_catalog.cardinality(v_pair) >= c_pair_limit
    and v_pair[1] - v_pair[c_pair_limit] <= c_failure_window
    and v_now - v_pair[1] < c_lock then
    return query select true, 'ip'::text, v_trusted;
    return;
  end if;

  insert into public.login_attempts (email_hash, ip_hash, succeeded)
  values (p_email_hash, v_ip_hash, false);

  -- 자기 이메일(advisory lock 으로 직렬화한 범위) 행만 기다려서 지운다.
  delete from public.login_attempts la
  where la.email_hash = p_email_hash
    and ((la.succeeded and la.created_at < v_now - c_trusted_ip)
      or (not la.succeeded and la.created_at < v_now - c_retention));

  -- 다른 이메일의 오래된 행은 잠긴 행을 건너뛰며 조금씩 지운다(대기하지 않으므로 교착이 생기지 않음).
  delete from public.login_attempts la
  where la.id in (
    select old.id
    from public.login_attempts old
    where (old.succeeded and old.created_at < v_now - c_trusted_ip)
       or (not old.succeeded and old.created_at < v_now - c_retention)
    limit 100
    for update skip locked
  );

  return query select false, 'none'::text, v_trusted;
end;
$$;

create or replace function public.record_login_success(p_email_hash text, p_ip_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_retention constant interval := interval '30 minutes';
  c_trusted_ip constant interval := interval '30 days';
  v_ip_hash text := coalesce(nullif(pg_catalog.btrim(p_ip_hash), ''), 'unknown');
  v_now timestamptz := pg_catalog.now();
begin
  if p_email_hash is null or p_email_hash = '' then
    raise exception '로그인 이메일 해시가 비어 있습니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email_hash, 0));

  -- 성공한 이메일·IP 의 기록(선기록 실패 포함)만 지운다. 이메일 전체를 지우면 분산 대입 누적이 초기화된다.
  delete from public.login_attempts la
  where la.email_hash = p_email_hash
    and la.ip_hash = v_ip_hash;

  -- 'unknown' 버킷은 헤더만 빼면 누구나 들어오는 공용 키라 신뢰 IP 로 쓰지 않으므로 성공 기록을 남기지 않는다.
  if v_ip_hash <> 'unknown' then
    insert into public.login_attempts (email_hash, ip_hash, succeeded)
    values (p_email_hash, v_ip_hash, true);
  end if;

  -- 자기 이메일 범위만 정리한다. 다른 이메일 행은 reserve_login_attempt 가 잠금 대기 없이 정리한다.
  delete from public.login_attempts la
  where la.email_hash = p_email_hash
    and ((la.succeeded and la.created_at < v_now - c_trusted_ip)
      or (not la.succeeded and la.created_at < v_now - c_retention));
end;
$$;

-- 비밀번호 재설정 메일 발송 기록. 발송을 시도한 요청만 1행씩 남는다(제한에 걸린 요청은 남기지 않음).
-- RLS 활성화 + 정책 없음 + 권한 회수 = service_role 외 접근 전면 차단.
create table if not exists public.password_reset_attempts (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_attempts_email_created_idx
  on public.password_reset_attempts (email_hash, created_at desc);
create index if not exists password_reset_attempts_ip_created_idx
  on public.password_reset_attempts (ip_hash, created_at desc);
create index if not exists password_reset_attempts_created_idx
  on public.password_reset_attempts (created_at);

alter table public.password_reset_attempts enable row level security;

revoke all on table public.password_reset_attempts from public, anon, authenticated;

create or replace function public.reserve_password_reset(p_email_hash text, p_ip_hash text)
returns table (blocked boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_email_limit constant integer := 3;
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

  -- 'unknown' 버킷은 헤더 없는 요청 전체가 공유하므로 IP 기준을 걸면 정상 사용자까지 막힌다. 이메일 기준만 적용한다.
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

revoke execute on function public.reserve_login_attempt(text, text) from public, anon, authenticated;
revoke execute on function public.record_login_success(text, text) from public, anon, authenticated;
revoke execute on function public.reserve_password_reset(text, text) from public, anon, authenticated;
grant execute on function public.reserve_login_attempt(text, text) to service_role;
grant execute on function public.record_login_success(text, text) to service_role;
grant execute on function public.reserve_password_reset(text, text) to service_role;
