# 센터마스터 메뉴 지침

## 1. 목적

`/admin/centers`는 현황관리(now) 시스템의 센터마스터(`now.center`)를 조회하는 메뉴다. 내부 센터 ID는 부서자료 공실 현황의 센터 기준으로 사용된다.

### 결정 변경 기록 (2026-11-01 대표님 결정)

- now 가 원본이다. 센터 등록·수정·삭제는 현황관리에서만 한다.
- 기존 노임마감시스템 수동 불러오기(`importLaborCentersAction`, `src/lib/supabase/labor.ts`, `LABOR_SUPABASE_*` 환경변수)는 삭제했다.
- now → `center_masters` 사본은 현황관리 트리거가 실시간 반영한다. 주간자료는 조회만 한다.

## 2. 접근과 권한

| 기능 | 권한 |
| --- | --- |
| now 센터 조회 | `admin`, `department_head`, `manager` |

페이지는 `canViewDepartmentMaster`로 진입을 제한하고, 그 확인 뒤에만 서버에서 서비스키 관리자 클라이언트로 `now.center`를 조회한다.

## 3. 화면

- 상단 안내: "now(현황관리) 시스템이 원본이며 변경은 즉시 반영됩니다. 등록·수정은 현황관리에서 하세요."
- 모든 허용 역할이 조회만 한다.
- 목록 칸: 센터명, 임대유형(`lease_type`), 건물유형(`building_type`: 평지붕·박공지붕·램프업 복층), 주소, 사용여부, 비고.
- 화면 안 즉시 검색(센터명·주소)과 "미사용 포함" 선택. 기본은 사용 센터만. 정렬은 사용 → `sort_order` → 센터명. 최대 1,000건.

## 4. 사본 반영 규칙 (현황관리 소유)

- 현황관리 `now.tg_sync_center`(트리거 `trg_sync_public`)가 now.center 저장 시 `center_masters`를 같은 id로 갱신(없으면 추가)한다.
- 복사 열: `center_name`, `address`, `latitude`, `longitude`, `note → notes`, `is_active`, `source_center_id`(없으면 기존 값, 신규는 `source_center_id → labor_id → id`), `source_status`(`active`/`inactive`), `last_synced_at`.
- 삭제는 반영하지 않고 `is_active`로 처리하므로 공실 기록의 센터 FK 는 유지된다. `now_use`는 복사하지 않는다.

## 5. 데이터와 주요 코드

| 구분 | 위치 |
| --- | --- |
| 서버 페이지 | `src/app/(protected)/admin/centers/page.tsx` |
| 화면 | `NowSourceNotice`, `NowCenterMasterTable` in `src/components/masters/NowMasterViews.tsx` |
| 순수 함수 | `toCenterMasterViewRow`, `buildingTypeLabel` in `src/lib/masters/now-master.ts` |
| 원본 테이블 | `now.center` (읽기 전용) |
| 내부 테이블 | `center_masters` |
| 하위 사용 테이블 | `department_vacancy_records` |
| migration | `030_center_masters.sql`, `031_department_vacancy_records.sql` (사본 반영·가드: 현황관리 저장소 `sql/002_takeover_public_masters.sql`) |

RLS 는 활성 센터 조회를 관리자·부서장·매니저에게 허용한다. 쓰기는 현황관리 가드 트리거가 막고, 현황관리 사본 반영 트리거만 통과한다.

## 6. 변경 불변 조건

- 서비스키를 `NEXT_PUBLIC_*`로 만들지 않는다.
- `source_center_id`의 unique 계약을 유지한다.
- 과거 공실 기록이 참조하는 `center_masters.id`를 재생성하거나 삭제하지 않는다.
- now 스키마에 쓰지 않는다.

## 7. 검증 시나리오

- 세 허용 역할의 조회와 `client_owner` 접근 차단
- 현황관리에서 센터 주소·사용여부 변경 후 새로고침 시 반영
- 부서자료 공실 센터 선택 반영, 기존 공실 기록의 센터 참조 보존
- 서비스키 누락·now 조회 실패 시 경고
