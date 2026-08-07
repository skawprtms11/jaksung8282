# 부서마스터 메뉴 지침

## 1. 목적

`/admin/departments`는 부서 기본정보를 관리하고, 부서에 화주를 등록하며, 등록 화주마다 화주담당자를 배정하는 조직·업무범위의 중심 메뉴다. 화주자료와 헤더 필터의 접근 범위는 이 메뉴에서 만든 관계를 사용한다.

## 2. 접근과 권한

| 기능 | `admin` | `department_head` | `manager` |
| --- | --- | --- | --- |
| 부서 조회 | 전체 | 소속 부서 | 소속 부서 |
| 부서 생성·수정·미사용 | 가능 | 불가 | 불가 |
| 부서 화주 등록·해제 | 모든 부서 | 소속 부서 | 소속 부서 |
| 화주담당자 지정 | 모든 부서 | 소속 부서 | 소속 부서 |

`client_owner`는 접근할 수 없다. 페이지 진입은 `canViewDepartmentMaster`, 관계 쓰기는 `canRegisterDepartmentClients`와 `resolveWritableDepartmentId`로 다시 검사한다.

## 3. URL과 조회 구조

- `q`: 부서코드 또는 부서명 검색
- 활성 부서만 `sort_order`, 부서명 순으로 최대 200건 조회한다.
- 비관리자는 쿼리에 자신의 부서 ID 조건을 추가한다.
- 관계 편집에 필요한 활성 사용자, 전체 활성 화주, 부서-화주 연결, 화주담당자 배정을 관리자 클라이언트로 병렬 조회한다.
- 사용자와 화주는 최대 200건, 관계·배정 lookup은 최대 500건이다. 상한을 늘릴 때 화면 성능과 누락 가능성을 함께 검토한다.

## 4. 화면 기능

### 부서 목록

- 선택, 전체 선택
- 부서코드, 부서명, 비고, 사용 상태, 정렬순서
- 관리자 전용 등록, 단건 수정, 다건 삭제
- 각 부서의 등록 화주와 담당자 관리 진입

### 부서 등록·수정

입력:

- 부서코드, 부서명
- 비고
- 사용 여부, 정렬순서
- 부서장 사용자

부서코드가 비어 있으면 server action이 `DEPT-<timestamp>` 형식의 임시 코드를 만든다. 부서장을 선택하면 해당 활성 사용자의 `department_id`와 `app_role = department_head`를 관리자 클라이언트로 갱신한다.

### 화주 등록 목록

- 전체 활성 화주 중 이 부서에 연결할 화주를 선택한다.
- 왼쪽 화주목록 상단에서 화주명 또는 화주코드로 입력 즉시 검색하며, 최대 8개의 자동완성 후보를 마우스 또는 방향키와 Enter로 선택할 수 있다.
- 선택한 화주를 목록에 옮기는 등록 버튼은 긴 목록을 스크롤하지 않아도 사용할 수 있도록 팝업 우측 상단의 저장 버튼 왼쪽에 둔다.
- 저장 시 현재 활성 연결과 목표 목록을 비교해 추가·해제를 계산한다.
- 추가는 `department_client_links`를 `(department_id, client_id)` 기준 upsert한다.
- 해제는 연결을 `is_active = false`로 바꾸고 같은 부서·화주의 `client_assignments`도 비활성화한다.
- 화주 자체를 삭제하거나 다른 부서 연결을 변경하지 않는다.

### 화주담당자 지정

- 해당 부서의 활성 `client_owner`만 후보가 된다.
- 한 화주에 여러 담당자를 지정할 수 있고 한 명을 대표 담당자로 정한다.
- 대표 담당자는 선택된 담당자 중 하나여야 한다. 지정하지 않으면 첫 담당자를 대표로 처리한다.
- 저장 전 해당 화주가 이 부서에 활성 등록되어 있는지 다시 확인한다.
- 기존 배정을 모두 비활성화한 뒤 선택 배정을 `(department_id, client_id, user_id)`로 upsert한다.

## 5. 서버 액션과 데이터

| 기능 | 서버 액션 |
| --- | --- |
| 부서 저장 | `saveDepartmentAction` |
| 부서 미사용 | `deleteDepartmentsAction` |
| 화주 개별 등록 | `saveDepartmentClientLinksAction` |
| 화주 개별 해제 | `removeDepartmentClientLinksAction` |
| 화주 목록 전체 저장 | `saveDepartmentClientSelectionAction` |
| 담당자 저장 | `saveDepartmentClientAssignmentsAction` |
| 신규 화주+담당자 동시 등록 호환 | `saveDepartmentClientAction` |

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
- `020_department_client_links.sql`, `029_simplify_permission_helpers.sql`

## 6. 관계 불변 조건

- 운영상의 부서-화주 관계는 `department_client_links`가 기준이다. `clients.department_id`는 레거시 호환 필드다.
- 담당자 배정에는 반드시 `department_id`가 포함되어야 하며 연결 부서와 같아야 한다.
- 비활성 부서, 화주, 사용자로 새 관계를 만들지 않는다.
- 화주 연결을 해제할 때 남은 활성 담당자 배정이 없어야 한다.
- 부서 삭제는 hard delete가 아니라 `departments.is_active = false`다.
- 마스터 변경 후 `header-filter-options` cache tag와 `/admin/departments`를 revalidate한다.
- 서비스 역할 키는 관계 관리 server action에서만 사용하고 브라우저로 보내지 않는다.

## 7. 교차 메뉴 영향

- 부서 활성상태와 정렬순서는 사이드바가 아니라 헤더 부서 필터와 기본 부서 선택에 영향을 준다.
- 화주 연결은 화주자료 편집 대상, 부서자료 작성현황 분모, 회의자료 완료율에 영향을 준다.
- 담당자 배정은 `client_owner`의 화주자료 접근과 확정·취소 권한에 영향을 준다.
- 사용자 역할·부서를 바꾸는 부서장 지정은 사용자관리와 권한 테스트를 함께 확인한다.

## 8. 검증 시나리오

- 관리자 전체 목록과 부서장·매니저 소속 부서 제한
- 부서 등록·수정·미사용 및 자기 화면 갱신
- 화주 연결 추가·해제 후 헤더 필터와 화주자료 반영
- 연결 해제 시 기존 담당자 배정 비활성화
- 다른 부서 사용자 또는 비활성 사용자의 담당자 지정 차단
- 다중 담당자와 대표 담당자 저장
- 비관리자의 다른 부서 ID 위조 요청 차단
- 서비스 역할 환경변수 누락 시 명확한 오류 표시
