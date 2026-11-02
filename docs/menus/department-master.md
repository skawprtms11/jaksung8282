# 부서마스터 메뉴 지침

## 1. 목적

`/admin/departments`는 현황관리(now) 시스템의 부서마스터(`now.department`)를 조회하고, 관리자가 부서장을 지정하는 메뉴다. 부서-화주 연결은 현황관리가 원본이며, 부서별 운영 화주와 화주담당자 지정은 `부서별화주등록`(`/client-registrations`, [client-registrations.md](./client-registrations.md))에서 한다.

### 결정 변경 기록

- (2026-11-01) 부서-화주 연결(`department_client_links`)은 현황관리(now) `now.department_client`가 원본이다. 주간자료에서 화주 등록·해제를 하지 않는다. 삭제한 UI·액션: 화주 등록 팝업의 화주목록·등록·삭제·저장, `saveDepartmentClientSelectionAction`, `saveDepartmentClientLinksAction`, `removeDepartmentClientLinksAction`, `saveDepartmentClientAction`·`DepartmentClientRegistration`.
- (2026-11-02) 부서 자체(`public.departments`)도 조회 전용이다. `public.departments`는 현황관리 가드 트리거로 직접 쓰기가 막혀 있어 `saveDepartmentAction`, `deleteDepartmentsAction`, `DepartmentForm`·`DepartmentCreateButton`·`DepartmentEditDialog`를 삭제했다. 부서장 지정은 `profiles`만 바꾸므로 `saveDepartmentHeadAction`으로 유지한다.
- (2026-11-02 대표님 결정) 부서 목록을 `now.department`에서 직접 읽는다(화주마스터·센터마스터와 같은 `NowMasterViews` 패턴). 부서 행의 `등록 화주`(담당자 배정) 버튼·팝업(`DepartmentMasterTable`, `DepartmentClientManager`, `DepartmentClientAssignmentDialog`)과 `ClientAssignmentForm`, 서버 액션 `saveDepartmentClientAssignmentsAction`(masters.ts)·`saveClientAssignmentsAction`을 삭제했다. 운영 화주·담당자 지정은 `부서별화주등록` 메뉴로 옮겼다.

## 2. 접근과 권한

| 기능 | `admin` | `department_head` | `manager` |
| --- | --- | --- | --- |
| 부서 조회 | 전체 | 소속 부서 | 소속 부서 |
| 부서 생성·수정·미사용 | 현황관리에서만 | 현황관리에서만 | 현황관리에서만 |
| 부서장 지정 | 가능 | 불가 | 불가 |
| 부서 화주 연결·해제 | 현황관리에서만 | 현황관리에서만 | 현황관리에서만 |
| 운영 화주·화주담당자 지정 | 부서별화주등록 | 부서별화주등록(소속 부서) | 부서별화주등록(소속 부서) |

`client_owner`는 접근할 수 없다. 페이지 진입은 `canViewDepartmentMaster`, 부서장 지정은 `saveDepartmentHeadAction`의 관리자 확인으로 다시 검사한다.

## 3. 조회 구조

- 진입 권한 확인 뒤 서버에서 서비스키 관리자 클라이언트로 `now.department`(`id, dept_code, dept_name, is_active, sort_order, note`, 최대 500건)를 조회한다. 비관리자는 `id = 소속 부서`로 좁힌다. 브라우저에 서비스키를 보내지 않는다.
- `now.department.id`는 현황관리 사본 트리거가 같은 id로 반영하므로 `public.departments.id`와 같다.
- 같은 요청에서 `public.departments`의 사용 중 부서 id(부서장 지정 가능 여부)와 활성 부서장·매니저 프로필(최대 500건)을 병렬 조회한다.
- 정렬: 사용 → `sort_order` → 부서명(`sortNowMasterRows`). 변환은 `toDepartmentMasterViewRow`(`src/lib/masters/now-master.ts`).
- 상단에 "now(현황관리) 시스템이 원본이며 변경은 즉시 반영됩니다. 등록·수정은 현황관리에서 하세요." 안내를 표시한다. 서비스키 누락·now 조회 실패 시 경고 문구를 표시한다.

## 4. 화면 기능

### 부서 목록 (조회 전용, `NowDepartmentMasterTable`)

- 칸: 부서코드, 부서명, 부서장, 사용여부, 비고
- 화면 안 즉시 검색(부서명·부서코드·부서장·비고)과 "미사용 포함" 선택. 기본은 사용 부서만.
- 목록 위에 "부서별 운영 화주와 화주담당자 지정은 화주자료 아래 '부서별화주등록' 메뉴에서 합니다." 안내를 표시한다.
- 등록·수정·삭제·화주등록 버튼은 없다.

### 부서장 지정 (관리자)

- 부서장 칸의 버튼으로 `DepartmentHeadDialog`(MasterForms.tsx)를 열어 부서장·매니저 역할의 활성 사용자 중 한 명을 고른다. 주간자료 사본(`public.departments`)이 사용 중인 부서에만 버튼이 보인다.
- `saveDepartmentHeadAction`은 활성 관리자와 사용 중인 부서를 확인한 뒤, 선택 사용자의 `profiles.department_id`와 `app_role = department_head`를 관리자 클라이언트로 갱신한다(`public.departments`에는 쓰지 않는다).

## 5. 서버 액션과 데이터

| 기능 | 서버 액션 |
| --- | --- |
| 부서장 지정 | `saveDepartmentHeadAction` |

주요 테이블: `now.department`(읽기 전용), `departments`, `profiles`

주요 파일:

- `src/app/(protected)/admin/departments/page.tsx`
- `src/components/masters/NowMasterViews.tsx` (`NowSourceNotice`, `NowDepartmentMasterTable`)
- `src/components/masters/MasterForms.tsx` (`DepartmentHeadDialog`)
- `src/actions/masters.ts`
- `src/lib/masters/now-master.ts`, `tests/now-master.test.ts`

## 6. 관계 불변 조건

- now 스키마와 public 마스터 4개 표(`departments`, `clients`, `center_masters`, `department_client_links`)에 쓰지 않는다.
- 운영상의 부서-화주 관계는 `department_client_links`(원본 `now.department_client`)가 기준이다. `clients.department_id`는 레거시 호환 필드다.
- 현황관리 `now.tg_sync_department_client`(트리거 `trg_sync_public`)는 연결 해제를 행 삭제가 아니라 `is_active = false`로 반영하고, `client_assignments`·`department_operating_clients`는 건드리지 않는다.
- 부서장 지정 후 `header-filter-options` cache tag와 `/admin/departments`를 revalidate한다.

## 7. 교차 메뉴 영향

- 부서 활성상태와 정렬순서는 헤더 부서 필터와 기본 부서 선택에 영향을 준다.
- 부서장 지정은 사용자 역할·부서를 바꾸므로 사용자관리, 부서별화주등록(저장 권한), 권한 테스트를 함께 확인한다.

## 8. 검증 시나리오

- 관리자 전체 목록과 부서장·매니저 소속 부서 제한, 화주담당자 접근 차단
- 현황관리에서 부서명·사용여부·비고 변경 → 새로고침 시 반영, 미사용 포함 선택 시 미사용 부서 표시
- 부서 등록·수정·삭제·화주등록 UI 미노출, 관리자 부서장 지정 후 화면 갱신
- 서비스키 누락·now 조회 실패 시 경고 문구
