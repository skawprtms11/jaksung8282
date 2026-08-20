-- 자료취합 부서 작성 내용 열람 범위 제한:
-- 전체확인은 관리자·부서장·매니저만, 그 외(화주담당자 등)는 소속 부서 것만 조회한다.
-- (docs/permission-matrix.md: 화주담당자 전체 부서 조회 불가)
drop policy if exists "data_collection_entries_select" on public.data_collection_entries;
create policy "data_collection_entries_select" on public.data_collection_entries
  for select to authenticated
  using (
    public.current_app_role() in ('admin', 'department_head', 'manager')
    or public.can_access_department(department_id)
  );
