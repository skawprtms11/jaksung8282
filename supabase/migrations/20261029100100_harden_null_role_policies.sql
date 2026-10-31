-- 보안 보완(2026-10-28 점검) 2·3·5번 + 공지 댓글 작성자 위조 차단.
-- 승인 대기·비활성 계정(current_app_role() = NULL)도 Auth 직접 호출로 authenticated JWT를 받을 수 있으므로
-- 로그인만 확인하던 조회·작성 정책에 역할 확인을 추가한다.
--
-- 되돌리기(새 migration 파일로 적용, 원래 정의 위치):
--   approval_history_insert_authenticated     → 004_rls_policies.sql:178
--   notices_select_active                     → 004_rls_policies.sql:46
--   work_categories_select_active             → 004_rls_policies.sql:53
--   notice_comments_select_active_notice      → 021_notice_comments.sql:91
--   notice_comments_update_owner_or_admin     → 021_notice_comments.sql:124
--   data_collections_select_active            → 20260820061000_data_collections.sql:17
--   mini_game_scores_select_authenticated     → 010_mini_game_scores.sql:14
--   mini_game_scores_insert_self              → 010_mini_game_scores.sql:18
--   department_meeting_memos_admin_all        → 20260819000000_add_department_meeting_memos.sql:16
--   weekly_report_item_requests_select_scope  → 023_common_report_item_requests.sql:53
--   weekly_report_item_requests_insert_scope  → 023_common_report_item_requests.sql:89
--   weekly_report_item_requests_update_owner  → 026_report_item_request_closure.sql:12
--   추가 트리거·함수는 drop trigger / drop function 으로 제거한다.
--     drop trigger if exists weekly_report_item_requests_protect_target on public.weekly_report_item_requests;
--     drop function if exists public.protect_report_item_request_target();
--     drop trigger if exists notice_comments_enforce_author on public.notice_comments;
--     drop function if exists public.enforce_notice_comment_author();

-- 2. 승인 이력은 security definer 상태 전환 함수와 서버(service_role)만 기록한다.
drop policy if exists "approval_history_insert_authenticated" on public.approval_history;

-- 3. 승인 전·비활성 계정의 조회 차단
drop policy if exists "notices_select_active" on public.notices;
create policy "notices_select_active" on public.notices
  for select to authenticated using (
    deleted_at is null
    and is_active = true
    and public.current_app_role() is not null
  );

drop policy if exists "work_categories_select_active" on public.work_categories;
create policy "work_categories_select_active" on public.work_categories
  for select to authenticated using (
    is_active = true
    and public.current_app_role() is not null
  );

drop policy if exists "notice_comments_select_active_notice" on public.notice_comments;
create policy "notice_comments_select_active_notice" on public.notice_comments
  for select to authenticated using (
    deleted_at is null
    and public.current_app_role() is not null
    and exists (
      select 1
      from public.notices n
      where n.id = notice_id
        and n.deleted_at is null
        and n.is_active = true
    )
  );

drop policy if exists "notice_comments_update_owner_or_admin" on public.notice_comments;
create policy "notice_comments_update_owner_or_admin" on public.notice_comments
  for update to authenticated using (
    deleted_at is null
    and public.current_app_role() is not null
    and (created_by = auth.uid() or public.is_admin())
  ) with check (
    public.current_app_role() is not null
    and (created_by = auth.uid() or public.is_admin())
  );

drop policy if exists "data_collections_select_active" on public.data_collections;
create policy "data_collections_select_active" on public.data_collections
  for select to authenticated using (
    deleted_at is null
    and public.current_app_role() is not null
  );

drop policy if exists "mini_game_scores_select_authenticated" on public.mini_game_scores;
create policy "mini_game_scores_select_authenticated" on public.mini_game_scores
  for select to authenticated using (public.current_app_role() is not null);

drop policy if exists "mini_game_scores_insert_self" on public.mini_game_scores;
create policy "mini_game_scores_insert_self" on public.mini_game_scores
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.current_app_role() is not null
  );

-- 추가. 댓글 작성자명·부서명을 클라이언트 값 대신 profiles 기준으로 강제한다.
-- RLS insert 정책은 created_by = auth.uid()만 확인하므로 PostgREST 직접 호출로 타인 이름을 쓸 수 있었다.
create or replace function public.enforce_notice_comment_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile_name text;
  profile_department_name text;
begin
  select p.full_name, d.department_name
    into profile_name, profile_department_name
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  where p.id = new.created_by;

  if not found then
    raise exception '댓글 작성자 정보를 찾을 수 없습니다.';
  end if;

  new.author_name := profile_name;
  new.author_department_name := profile_department_name;
  return new;
end;
$$;

revoke all on function public.enforce_notice_comment_author() from anon, authenticated, public;

drop trigger if exists notice_comments_enforce_author on public.notice_comments;
create trigger notice_comments_enforce_author
  before insert on public.notice_comments
  for each row execute function public.enforce_notice_comment_author();

-- 5. {public} 대상 정책을 authenticated 로 한정
drop policy if exists department_meeting_memos_admin_all on public.department_meeting_memos;
create policy department_meeting_memos_admin_all
  on public.department_meeting_memos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "weekly_report_item_requests_select_scope" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_select_scope" on public.weekly_report_item_requests
for select to authenticated using (
  deleted_at is null
  and (
    (
      target_type = 'client_item'
      and exists (
        select 1
        from public.weekly_client_report_items item
        join public.weekly_client_reports report on report.id = item.report_id
        where item.id = weekly_report_item_requests.report_item_id
          and report.deleted_at is null
          and (
            public.is_admin()
            or report.department_id = public.current_department_id()
          )
      )
    )
    or
    (
      target_type = 'department_common'
      and exists (
        select 1
        from public.department_weekly_submissions submission
        where submission.id = weekly_report_item_requests.department_submission_id
          and submission.deleted_at is null
          and (
            public.is_admin()
            or submission.department_id = public.current_department_id()
          )
      )
    )
  )
);

drop policy if exists "weekly_report_item_requests_insert_scope" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_insert_scope" on public.weekly_report_item_requests
for insert to authenticated with check (
  auth.uid() = created_by
  and public.current_app_role() in ('admin', 'department_head', 'manager', 'client_owner')
  and (
    (
      target_type = 'client_item'
      and exists (
        select 1
        from public.weekly_client_report_items item
        join public.weekly_client_reports report on report.id = item.report_id
        where item.id = weekly_report_item_requests.report_item_id
          and report.deleted_at is null
          and (
            public.is_admin()
            or report.department_id = public.current_department_id()
          )
      )
    )
    or
    (
      target_type = 'department_common'
      and exists (
        select 1
        from public.department_weekly_submissions submission
        where submission.id = weekly_report_item_requests.department_submission_id
          and submission.deleted_at is null
          and (
            public.is_admin()
            or submission.department_id = public.current_department_id()
          )
      )
    )
  )
);

-- update 는 작성자 조건만 보던 WITH CHECK 에 select 와 같은 부서 범위 조건을 더해
-- 수정 결과 행도 본인 부서(또는 관리자) 자료에 속해야 하도록 한다.
drop policy if exists "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests;
create policy "weekly_report_item_requests_update_owner" on public.weekly_report_item_requests
for update to authenticated using (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
) with check (
  deleted_at is null
  and (
    public.is_admin()
    or created_by = auth.uid()
    or result_created_by = auth.uid()
    or closed_by = auth.uid()
  )
  and (
    (
      target_type = 'client_item'
      and exists (
        select 1
        from public.weekly_client_report_items item
        join public.weekly_client_reports report on report.id = item.report_id
        where item.id = weekly_report_item_requests.report_item_id
          and report.deleted_at is null
          and (
            public.is_admin()
            or report.department_id = public.current_department_id()
          )
      )
    )
    or
    (
      target_type = 'department_common'
      and exists (
        select 1
        from public.department_weekly_submissions submission
        where submission.id = weekly_report_item_requests.department_submission_id
          and submission.deleted_at is null
          and (
            public.is_admin()
            or submission.department_id = public.current_department_id()
          )
      )
    )
  )
);

-- 요청이 붙은 대상(어느 항목·어느 부서 자료인지)과 작성자는 등록 후 바꿀 수 없다.
-- 서버(service_role) 경로도 대상 열을 수정하지 않으므로 역할 구분 없이 막는다.
create or replace function public.protect_report_item_request_target()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.target_type is distinct from old.target_type
    or new.report_item_id is distinct from old.report_item_id
    or new.department_submission_id is distinct from old.department_submission_id
    or new.target_key is distinct from old.target_key
    or new.created_by is distinct from old.created_by then
    raise exception '요청사항의 대상과 작성자는 변경할 수 없습니다.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_report_item_request_target() from anon, authenticated, public;

drop trigger if exists weekly_report_item_requests_protect_target on public.weekly_report_item_requests;
create trigger weekly_report_item_requests_protect_target
  before update on public.weekly_report_item_requests
  for each row execute function public.protect_report_item_request_target();
