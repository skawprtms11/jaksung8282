# 부서마스터 메뉴 지침

## 1. 목적

`/admin/departments`는 현황관리(now) 부서와 부서에 연결된 화주를 조회하고, 부서장을 지정하며, 등록 화주마다 화주담당자를 배정하는 조직·업무범위의 중심 메뉴다. 화주자료와 헤더 필터의 접근 범위는 이 메뉴의 관계를 사용한다.

### 결정 변경 기록 (2026-11-01 대표님 결정)

- 부서-화주 연결(`department_client_links`)은 현황관리(now) `now.department_client`가 원본이다. 주간자료에서 화주 등록·해제를 하지 않는다.
- 삭제한 UI·액션: 화주 등록 팝업의 화주목록·등록·삭제·저장, `saveDepartmentClientSelectionAction`, `saveDepartmentClientLinksAction`, `removeDepartmentClientLinksAction`, 호환 계약이던 `saveDepartmentClientAction`·`DepartmentClientRegistration`(신규 화주+담당자 동시 등록).
- 화주담당자 배정(`client_assignments`)은 계속 이 메뉴에서 관리한다.
- (2026-11-02 추가 결정) 부서 자체(`public.departments`)도 조회 전용이다. `public.departments`는 현황관리 가드 트리거로 직접 쓰기가 막혀 있어 `saveDepartmentAction`, `deleteDepartmentsAction`, `DepartmentForm`·`DepartmentCreateButton`·`DepartmentEditDialog`(등록·수정·미사용)를 삭제했다.
- 부서장 지정은 `profiles`(department_id, app_role)만 바꾸므로 가드 대상이 아니어서 `saveDepartmentHeadAction`으로 분리해 유지한다.
- (2026-11-02 추가 결정) 현황관리에서 연결이 해제(`department_client_links.is_active = false`)된 화주의 담당자 배정은 데이터는 그대로 두고, 배정 기반 화면 목록에서만 숨긴다.

## 2. 접근과 권한

| 기능 | `admin` | `department_head` | `manager` |
| --- | --- | --- | --- |
| 부서 조회 | 전체 | 소속 부서 | 소속 부서 |
| 부서 생성·수정·미사용 | 현황관리에서만 | 현황관리에서만 | 현황관리에서만 |
| 부서장 지정 | 가능 | 불가 | 불가 |
| 부서 화주 등록·해제 | 현황관리에서만 | 현황관리에서만 | 현황관리에서만 |
| 화주담당자 지정 | 모든 부서 | 소속 부서 | 소속 부서 |

`client_owner`는 접근할 수 없다. 페이지 진입은 `canViewDepartmentMaster`, 관계 쓰기는 `canRegisterDepartmentClients`와 `resolveWritableDepartmentId`로 다시 검사한다.

## 3. URL과 조회 구조

- `q`: 부서코드 또는 부서명 검색
- 활성 부서만 `sort_order`, 부서명 순으로 최대 200건 조회한다.
- 비관리자는 쿼리에 자신의 부서 ID 조건을 추가한다.
- 활성 사용자와 활성 부서-화주 연결을 관리자 클라이언트로 병렬 조회한 뒤, 연결된 활성 화주와 담당자 배정만 읽는다(전체 화주 상한에 걸려 등록 화주가 누락되지 않게). 화주·배정 조회는 ID 100개 단위로 나눠 조회하고, 오류가 나면 상단에 안내한다.
- 담당자 배정은 활성 연결이 있는 (부서, 화주) 쌍만 화면에 쓴다.
- 사용자는 최대 200건, 관계·배정 lookup은 최대 500건이다. 상한을 늘릴 때 화면 성능과 누락 가능성을 함께 검토한다.
- 상단에 "now(현황관리) 시스템이 원본이며 변경은 즉시 반영됩니다. 등록·수정은 현황관리에서 하세요." 안내를 표시한다.

## 4. 화면 기능

### 부서 목록 (조회 전용)

- 부서명, 부서장, 화주등록(등록 화주·담당자 진입), 비고
- 등록·수정·삭제 버튼은 없다. 부서 정보는 현황관리 부서마스터에서 바꾸면 사본 트리거로 즉시 반영된다.

### 부서장 지정 (관리자)

- 부서장 칸의 버튼으로 팝업을 열어 부서장·매니저 역할의 활성 사용자 중 한 명을 고른다.
- `saveDepartmentHeadAction`은 활성 관리자와 사용 중인 부서를 확인한 뒤, 선택 사용자의 `profiles.department_id`와 `app_role = department_head`를 관리자 클라이언트로 갱신한다(`public.departments`에는 쓰지 않는다).

### 등록 화주 목록 (조회 전용)

- 부서 행의 화주 버튼을 누르면 이 부서에 활성 연결된 화주와 지정된 담당자를 보여 준다.
- 화주 등록·해제 버튼은 없다. 현황관리 부서마스터에서 등록하면 사본 트리거로 즉시 반영된다.
- 각 화주의 담당자 버튼으로 화주담당자 지정 팝업을 연다.

### 부서-화주 연결 사본 반영 (현황관리 소유)

- 현황관리 `now.tg_sync_department_client`(트리거 `trg_sync_public`, 현황관리 저장소 `sql/002_takeover_public_masters.sql`)가 now.department_client 저장 시 `department_client_links`를 같은 id로 갱신(없으면 추가)하고, 화주 대표 부서(`clients.department_id`)를 다시 계산한다.
- 해제는 행 삭제가 아니라 `is_active = false`로 반영된다.
- 이 트리거는 `client_assignments`를 건드리지 않는다. 연결이 해제돼도 같은 부서·화주 배정 데이터는 활성으로 남는다(대표님 결정: 데이터 유지).
- 대신 배정 기반 목록은 활성 연결이 있는 것만 보여 준다: 부서마스터 담당자 목록, 헤더 화주 목록(`/api/header-filters`의 `assignedClientIds`), 화주자료 화주 선택(`client-reports`), 모바일 화주 목록. 공통 함수는 `keepLinkedClientIds`(`src/lib/auth/client-scope.ts`). 화주자료 쓰기는 DB의 `is_department_client`(활성 연결 필요)로도 막힌다.
- 주간자료는 별도 동기화를 하지 않는다.

### 화주담당자 지정

- 해당 부서의 활성 `client_owner`만 후보가 된다.
- 한 화주에 여러 담당자를 지정할 수 있고 한 명을 대표 담당자로 정한다.
- 대표 담당자는 선택된 담당자 중 하나여야 한다. 지정하지 않으면 첫 담당자를 대표로 처리한다.
- 저장 전 해당 화주가 이 부서에 활성 등록되어 있는지 다시 확인한다.
- 기존 배정을 모두 비활성화한 뒤 선택 배정을 `(department_id, client_id, user_id)`로 upsert한다.

## 5. 서버 액션과 데이터

| 기능 | 서버 액션 |
| --- | --- |
| 부서장 지정 | `saveDepartmentHeadAction` |
| 담당자 저장 | `saveDepartmentClientAssignmentsAction` |

주요 테이블:

- `departments`
- `clients`
- `department_client_links`
- `profiles`
- `client_assignments`

주요 파일:

- `src/app/(protected)/admin/departments/page.tsx`
- `src/components/masters/MasterForms.tsx`
- `src/actions/masters.ts`
- `src/lib/auth/permissions.ts`
- `src/components/masters/NowMasterViews.tsx` (`NowSourceNotice`)
- `020_department_client_links.sql`, `029_simplify_permission_helpers.sql`

## 6. 관계 불변 조건

- 운영상의 부서-화주 관계는 `department_client_links`가 기준이고, 그 원본은 현황관리 `now.department_client`다. `clients.department_id`는 레거시 호환 필드다(현황관리 트리거가 대표 부서로 갱신).
- 담당자 배정에는 반드시 `department_id`가 포함되어야 하며 연결 부서와 같아야 한다.
- 비활성 부서, 화주, 사용자로 새 관계를 만들지 않는다.
- 화주 연결을 해제할 때 남은 활성 담당자 배정이 없어야 한다.
- 부서 등록·수정·미사용은 현황관리에서만 하며 사본 트리거가 `departments`에 반영한다.
- 마스터 변경 후 `header-filter-options` cache tag와 `/admin/departments`를 revalidate한다.
- 서비스 역할 키는 관계 관리 server action에서만 사용하고 브라우저로 보내지 않는다.

## 7. 교차 메뉴 영향

- 부서 활성상태와 정렬순서는 사이드바가 아니라 헤더 부서 필터와 기본 부서 선택에 영향을 준다.
- 화주 연결은 화주자료 편집 대상, 부서자료 작성현황 분모, 회의자료 완료율에 영향을 준다.
- 담당자 배정은 `client_owner`의 화주자료 접근과 확정·취소 권한에 영향을 준다.
- 사용자 역할·부서를 바꾸는 부서장 지정은 사용자관리와 권한 테스트를 함께 확인한다.

## 8. 검증 시나리오

- 관리자 전체 목록과 부서장·매니저 소속 부서 제한
- 부서 등록·수정·삭제 UI 미노출, 관리자 부서장 지정 후 화면 갱신
- 현황관리에서 화주 연결 추가·해제 → 새로고침 시 헤더 필터와 화주자료 반영
- 연결 해제된 화주가 담당자 목록·헤더·화주자료 선택에서 숨겨지고 배정 데이터는 유지
- 부서장·매니저는 소속 부서 담당자 지정만 가능
- 다른 부서 사용자 또는 비활성 사용자의 담당자 지정 차단
- 다중 담당자와 대표 담당자 저장
- 비관리자의 다른 부서 ID 위조 요청 차단
- 서비스 역할 환경변수 누락 시 명확한 오류 표시
