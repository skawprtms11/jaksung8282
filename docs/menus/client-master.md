# 화주마스터 메뉴 지침

## 1. 목적

`/admin/clients`는 사업부에서 사용할 화주 기본정보를 등록·수정·일괄 등록하고 사용 여부를 관리하는 관리자 메뉴다. 화주를 특정 부서에 연결하고 담당자를 지정하는 운영 기능은 부서마스터가 소유한다.

## 2. 접근과 범위

- `admin`만 접근한다.
- 페이지 진입과 모든 server action에서 관리자 여부를 다시 검사한다.
- 활성 화주만 조회하며 기본 최대 200건이다.

URL filters:

- `q`: 화주코드 또는 화주명 부분 검색
- `department_id`: 레거시 `clients.department_id` 기준 필터

운영 관계의 기준은 `department_client_links`이므로 `department_id` 필터를 새로운 관계 로직에 재사용하기 전에 목적을 확인한다.

## 3. 화면 기능

### 목록

- 화주코드, 화주명, 비고
- 선택, 전체 선택
- 신규 등록, 일괄 등록, 단건 수정, 다건 삭제
- 사용 중인 활성 화주만 표시

### 단건 등록·수정

입력:

- 화주코드: 필수, 최대 30자
- 화주명: 필수, 최대 100자
- 비고
- 선택적 레거시 부서 ID
- 사용 여부, 정렬순서

`saveClientAction`은 `clientSchema`로 검증하고 신규면 `created_by`, 수정이면 `updated_by`를 기록한다. 과거 DB에 `notes` 또는 nullable `department_id` migration이 없는 환경을 위한 오류 메시지와 제한적 호환 retry가 존재한다.

### 일괄 등록

- 입력 컬럼: 화주코드, 화주명, 비고
- 표 직접 입력 또는 Excel/스프레드시트의 탭 구분 데이터 붙여넣기
- 첫 행이 `화주코드`, `화주명`이면 header로 인식해 제외
- 미완성 행은 저장을 차단
- 한 번에 최대 2,000건
- `bulk_import_clients_atomic` RPC로 한 트랜잭션 처리
- 동일 화주코드가 payload에 반복되면 마지막 값이 반영되고 결과 메시지에 중복 건수를 표시
- 결과는 전체, 신규, 업데이트, 중복 count를 반환

### 삭제

- `deleteClientsAction`은 선택 ID를 검증한 뒤 `clients.is_active = false`로 바꾼다.
- hard delete하지 않는다.
- 이 동작이 기존 `department_client_links`와 보고서 이력을 삭제하지는 않는다.

## 4. 관계 책임 분리

- 화주 기본정보: 화주마스터
- 부서에 화주 등록: 부서마스터의 `department_client_links`
- 부서별 화주담당자: 부서마스터의 `client_assignments`
- `saveClientAssignmentsAction`은 현재 사용하지 않으며 부서마스터에서 처리하라는 오류를 반환한다.

이 책임을 다시 화주마스터에 중복 구현하지 않는다. 여러 부서가 같은 화주를 연결할 수 있는 현재 관계 모델을 유지한다.

## 5. 데이터와 주요 코드

| 구분 | 위치 |
| --- | --- |
| 서버 페이지 | `src/app/(protected)/admin/clients/page.tsx` |
| 화면·일괄입력 | `ClientMasterControls`, `ClientBulkRegisterDialog` in `MasterForms.tsx` |
| 서버 액션 | `saveClientAction`, `saveClientsBulkImportAction`, `deleteClientsAction` |
| 검증 | `clientSchema`, `bulkClientImportRowSchema` |
| 테이블 | `clients` |
| 관계 테이블 | `department_client_links`, `client_assignments` |
| RPC | `bulk_import_clients_atomic` |
| migration | `007`, `009`, `019`, `020` migration |

모든 성공 동작은 `/admin/clients`와 `header-filter-options` cache를 갱신한다.

## 6. 변경 불변 조건

- 화주코드는 중복 의미를 갖지 않도록 기존 DB/RPC unique 계약을 확인한다.
- 일괄 등록은 부분 성공하지 않아야 한다.
- `clients.department_id`를 유일한 부서 관계로 취급하지 않는다.
- 화주 미사용 처리가 과거 보고서, 물동량, 승인 이력을 삭제하지 않아야 한다.
- 화주명 변경 후 부서마스터, 헤더 필터, 보고서 관계 조회가 새 이름을 표시해야 한다.
- 목록 제한을 넘는 운영 규모가 예상되면 무작정 limit를 늘리지 말고 pagination을 추가한다.

## 7. 교차 메뉴 영향과 검증

- 화주 기본정보 변경은 부서마스터, 헤더 필터, 화주자료, 부서자료, 회의자료에 영향을 준다.
- 미사용 처리는 신규 선택 대상에서 제외되지만 과거 보고서 표시 이름 관계가 유지되는지 확인한다.

필수 시나리오:

- 비관리자 route 접근 차단
- 코드·이름 검색과 레거시 부서 필터
- 단건 신규·수정과 notes migration 호환 오류
- Excel header 포함/미포함 붙여넣기
- 미완성 행, 2,000건 초과, payload 내 중복
- 일괄 RPC 전체 rollback과 결과 count
- 다건 미사용 후 헤더·부서마스터 선택 대상 제거
