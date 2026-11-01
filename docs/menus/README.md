# 메뉴별 시스템 지침

이 디렉터리는 사이드바 메뉴별 목적과 현재 구현 계약을 기록한다. 전역 원칙은 루트 `AGENTS.md`를 우선 적용하고, 메뉴 작업을 시작하기 전에 아래 해당 문서를 추가로 읽는다.

| 메뉴 | 경로 | 상세 문서 |
| --- | --- | --- |
| 공지사항 | `/notices` | [notices.md](./notices.md) |
| 자료취합 | `/data-collections` | [data-collections.md](./data-collections.md) |
| 회의자료 | `/meeting-materials` | [meeting-materials.md](./meeting-materials.md) |
| 부서자료 | `/department-reports` | [department-reports.md](./department-reports.md) |
| 화주자료 | `/client-reports` | [client-reports.md](./client-reports.md) |
| 미니게임 | `/mini-game` | [mini-game.md](./mini-game.md) |
| 부서마스터 | `/admin/departments` | [department-master.md](./department-master.md) |
| 센터마스터 | `/admin/centers` | [center-master.md](./center-master.md) |
| 화주마스터 | `/admin/clients` | [client-master.md](./client-master.md) |
| 사용자관리 | `/admin/users` | [user-management.md](./user-management.md) |
| 모바일 앱 | `/mobile` | [mobile-app.md](./mobile-app.md) |

공유 코드 변경 시 한 문서만 읽어서는 안 된다.

- `src/actions/reports.ts`: 회의자료, 부서자료, 화주자료 문서를 모두 확인한다.
- `src/components/masters/MasterForms.tsx` 또는 `src/actions/masters.ts`: 영향받는 마스터 메뉴 문서를 모두 확인한다.
- `src/components/masters/NowMasterViews.tsx`, `src/lib/masters/now-master.ts`: 화주마스터, 센터마스터, 부서마스터 문서를 모두 확인한다(현황관리 now 원본 조회).
- `src/components/layout/Header.tsx`, `Sidebar.tsx`, `/api/header-filters`: 회의자료, 부서자료, 화주자료와 권한이 달라지는 모든 메뉴 문서를 확인한다.
- 사이드바의 공지사항·회의자료·부서자료·화주자료는 배포 환경에서 전체 route payload를 백그라운드 프리페치한다. 마스터·보조 메뉴는 자동 부분 프리페치를 사용하며 모든 링크는 Next.js 기본 내비게이션을 유지한다.
- `src/lib/auth/permissions.ts`, `src/types/enums.ts`, `src/types/database.ts`, Supabase RLS/RPC: 루트 `AGENTS.md`와 영향받는 모든 메뉴 문서를 확인한다.

기능 계약이 바뀌면 코드와 같은 작업에서 해당 메뉴 문서를 갱신한다.

## 상단 헤더 조건(소속부서 / 화주 / 담당자)

모든 보호 화면 상단 헤더는 `소속부서` 선택, `화주` 선택(선택 부서의 화주만), `담당자`(로그인 사용자 이름·역할, 툴팁에 소속부서)를 한 줄로 보여준다. 좁은 화면에서는 줄바꿈으로 배치한다. 구현은 `src/components/layout/Header.tsx`, 조건 결정 순수 함수는 `src/lib/auth/header-scope.ts`, 저장소는 `src/lib/auth/header-scope-store.ts`, 테스트는 `tests/header-scope.test.ts`다.

| 화면 | 적용 조건 | 서버 반영 |
| --- | --- | --- |
| 화주자료 `/client-reports`, 부서자료 `/department-reports`, 회의자료 `/meeting-materials`, 모바일 `/mobile` | 부서·화주 | 기존 화면별 조회 로직 그대로(화주자료 필수 선택, 회의자료 탭 제한·부서 이전/다음 이동 유지) |
| 공지사항 `/notices`, `/notices/[id]` | 부서만 | 자료취합 공지의 부서별 완료현황을 선택 부서 행만 표시. 공지 목록·본문은 부서 개념이 없어 그대로. 새 자료취합 공지의 대상 부서는 계속 활성 부서 전체 |
| 자료취합 `/data-collections` | 부서만 | 부서 행·작성 내용은 선택 부서로 좁힌다. 진행률·자동 완료 상태·상태 필터는 활성 부서 전체 기준으로 계산하고, 한 부서 조회 중에는 "완료율(전체 부서)"와 "선택 부서 ○○: 확정/미확정"으로 구분 표시 |
| 관리 `/admin/*`, 미니게임 `/mini-game` | 미적용 | 헤더는 저장된 조건을 비활성 상태로 표시하고 "이 화면은 헤더 조건 미적용" 안내. 관리 화면의 `department_id`는 그 화면 자체 필터로만 쓴다 |

헤더에는 부서만 적용하는 화면에서 "이 화면은 부서 조건만 적용" 안내를 표시하고 화주 선택은 비활성화한다. 회의자료·자료취합은 `canViewMeetingMaterials`가 아니면 조건 미적용으로 취급한다.

### 조건 유지

- URL `department_id`, `client_id`가 화면 조회 조건의 기준이다.
- 조건 적용 화면에서 사용자가 고르거나 URL로 들어온 조건을 `sessionStorage`의 `tpl-header-scope:<profileId>`에 저장한다. 헤더 옵션에 없는 부서·화주와 화주담당자의 미배정 화주는 저장하지 않는다. 화면이 자동으로 채운 기본값(화주자료 첫 화주 등)은 저장하지 않는다.
- 사이드바 링크(로고 포함)와 공지 상세의 목록 버튼은 `ScopedLink`를 쓴다. href 는 고정해 프리페치가 반복되지 않게 하고, 클릭 시 저장된 조건을 붙여 `router.push`한다. 새 탭·가운데 클릭·우클릭 메뉴는 직전에 DOM href 를 조건 붙은 주소로 바꾼다. 관리·미니게임 링크에는 조건을 붙이지 않으며, 이 화면들을 거쳐도 저장값은 바뀌지 않는다.
- 조건 적용 화면에 URL 조건 없이 들어오면(북마크 등) 저장값으로 `router.replace`해 복원한다. 공지 상세 `/notices/[id]`는 조건이 조회에 영향이 없어 복원하지 않는다. URL에 조건이 하나라도 있으면 URL이 우선한다.
- 모바일 앱 셸도 같은 저장값을 읽고, 부서·화주를 바꾸면 `toPersistedHeaderScope` 검증을 거쳐 저장한다.
- 데스크톱·모바일 로그아웃은 `SignOutForm`이 제출 직전에 저장값을 지운다(로그아웃 실패 시에도 조건 초기화만 일어나 안전). 저장소는 탭 단위(`sessionStorage`)라 탭을 닫아도 사라진다.

### 권한

- 조건은 조회 범위를 좁히는 용도로만 쓴다. 관리자만 전체 부서·다른 부서를 고를 수 있고, 일반 사용자는 헤더에 소속 부서가 고정 표시된다.
- 서버는 `resolveServerDepartmentScope`(공지·자료취합) 또는 각 화면의 기존 로직으로 관리자가 아니면 URL 값과 무관하게 소속 부서로 강제한다. 소속 부서가 없는 일반 사용자는 부서 데이터가 비어 보인다. RLS는 그대로 최종 방어선이다.

