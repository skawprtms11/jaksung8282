# 데이터베이스 설계

Migration은 `supabase/migrations`에 기능별로 분리했다.

- `001_extensions_and_enums.sql`: UUID 확장과 권한/상태 enum
- `002_tables.sql`: 부서, 사용자 프로필, 화주, 담당자, 공지, 주간자료, 승인 이력 테이블
- `003_functions_and_triggers.sql`: updated_at trigger, RLS helper, 승인상태 전환 RPC
- `004_rls_policies.sql`: 역할별 SELECT/INSERT/UPDATE/DELETE 정책
- `005_indexes.sql`: 검색/필터/중복 방지 index
- `006_seed_data.sql`: 업무구분 seed, 안전 사용자 조회 view

핵심 중복 방지는 다음 partial unique index로 처리한다.

```sql
weekly_client_reports(client_id, week_start_date) where deleted_at is null
department_weekly_submissions(department_id, week_start_date) where deleted_at is null
```

월말·월초 혼선 방지를 위해 애플리케이션은 월요일 시작일을 계산하고, 해당 주 목요일이 속한 월을 화면용 `report_month`로 저장한다.
