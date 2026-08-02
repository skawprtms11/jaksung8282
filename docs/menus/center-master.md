# 센터마스터 메뉴 지침

## 1. 목적

`/admin/centers`는 외부 노임마감시스템의 활성 센터를 내부 `center_masters`로 수동 동기화하고 조회하는 메뉴다. 내부 센터 ID는 부서자료 공실 현황의 센터 기준으로 사용된다.

## 2. 현재 연동 범위

현재 구현은 Firestore 연동이 아니다.

- 외부: 별도 Supabase 프로젝트의 `public.centers`
- 외부 환경변수: `LABOR_SUPABASE_URL`, `LABOR_SUPABASE_SERVICE_ROLE_KEY`
- 내부: 현재 앱 Supabase의 `center_masters`
- 실행 방식: 관리자 버튼을 통한 수동 전체 불러오기

Firestore 또는 `lease_area` 연동을 추가하려면 별도 요구사항으로 설계하며 현재 동기화가 이미 구현된 것으로 가정하지 않는다.

## 3. 접근과 권한

| 기능 | 권한 |
| --- | --- |
| 활성 센터 조회 | `admin`, `department_head`, `manager` |
| 외부 센터 불러오기 | `admin` |

페이지는 `canViewDepartmentMaster`로 진입을 제한하고, import action은 `requireAdmin()`으로 다시 검사한다.

## 4. 화면과 조회

- 활성 내부 센터를 센터명 순으로 최대 300건 조회한다.
- 현재 표 표시 필드: 센터명, 주소, 비고
- 외부 센터 ID와 마지막 갱신일은 DB에 저장되지만 현재 표에는 표시하지 않는다.
- 관리자는 `노임마감 센터 불러오기` 동작을 사용할 수 있다.
- 부서장·매니저는 읽기 전용이다.

## 5. 동기화 흐름

1. 활성 관리자 프로필을 확인한다.
2. `createLaborSupabaseClient()`로 외부 service-role 클라이언트를 만든다.
3. 외부 `centers`에서 `status = active`인 행을 이름순으로 조회한다.
4. ID와 이름이 유효한 행만 내부 payload로 변환한다.
5. 현재 앱의 관리자 클라이언트로 `source_center_id` 충돌 기준 upsert한다.
6. `/admin/centers`와 헤더 관련 마스터 cache를 revalidate한다.

필드 매핑:

| 외부 `centers` | 내부 `center_masters` |
| --- | --- |
| `id` | `source_center_id` |
| `name` | `center_name` |
| `address` | `address` |
| `memo` | `notes` |
| `status` | `source_status`, `is_active` |
| `latitude` | `latitude` |
| `longitude` | `longitude` |
| 동기화 시각 | `last_synced_at` |

현재 import는 외부에서 사라졌거나 비활성화된 기존 내부 센터를 자동 비활성화하지 않는다. 이 동작을 바꾸려면 공실 기록의 FK와 과거 조회 영향을 먼저 검토한다.

## 6. 데이터와 주요 코드

| 구분 | 위치 |
| --- | --- |
| 서버 페이지 | `src/app/(protected)/admin/centers/page.tsx` |
| 화면 | `CenterMasterControls` in `MasterForms.tsx` |
| import action | `importLaborCentersAction` in `src/actions/masters.ts` |
| 외부 client | `src/lib/supabase/labor.ts` |
| 내부 테이블 | `center_masters` |
| 하위 사용 테이블 | `department_vacancy_records` |
| migration | `030_center_masters.sql`, `031_department_vacancy_records.sql` |

RLS는 활성 센터 조회를 관리자·부서장·매니저에게 허용하고 insert/update는 관리자에게만 허용한다. 실제 import는 내부 관리자 클라이언트를 사용한다.

## 7. 변경 불변 조건

- 외부와 내부 service-role 키를 `NEXT_PUBLIC_*`로 만들지 않는다.
- `source_center_id`의 unique 계약을 유지해 재동기화 중복을 막는다.
- 과거 공실 기록이 참조하는 내부 `center_masters.id`를 재생성하지 않는다.
- 외부 오류가 내부 기존 센터 데이터를 삭제하거나 비활성화하지 않아야 한다.
- 빈 외부 결과를 성공으로 처리해 기존 데이터를 덮어쓰지 않는다.
- 동기화 필드 확장 시 외부 타입, 내부 migration, `src/types/database.ts`, 페이지 표시 타입을 함께 수정한다.

## 8. 검증 시나리오

- 세 허용 역할의 조회와 `client_owner` 접근 차단
- 관리자 import 버튼 노출과 비관리자 미노출
- 환경변수 누락, 외부 조회 오류, 내부 upsert 오류 메시지
- 같은 외부 ID 재동기화 시 중복 없이 갱신
- 공백 이름 행 제외와 활성 상태 필터
- 동기화 후 부서자료 공실 센터 선택에 즉시 표시
- 기존 공실 기록의 센터 참조 보존
