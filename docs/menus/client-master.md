# 화주마스터 메뉴 지침

## 1. 목적

`/admin/clients`는 현황관리(now) 시스템의 화주마스터(`now.client`)를 조회하는 관리자 전용 조회 메뉴다.

### 결정 변경 기록 (2026-11-01 대표님 결정)

- now 가 원본이다. 화주의 등록·수정·일괄등록·삭제(미사용)는 현황관리에서만 한다.
- 주간자료는 조회만 한다. now → `public.clients` 사본은 현황관리 트리거가 실시간 반영한다. 기존 단건 등록·수정, 일괄 등록(`bulk_import_clients_atomic`), 다건 삭제 UI와 서버 액션(`saveClientAction`, `saveClientsBulkImportAction`, `deleteClientsAction`)은 삭제했다.
- `bulk_import_clients_atomic` RPC 와 `clientSchema` 는 DB·테스트 호환을 위해 남아 있으나 앱에서 호출하지 않는다.
- 현황관리 sql/002 의 가드 트리거가 `public.clients` 직접 쓰기를 이미 막고 있다(`now.sync = 'on'` 일 때만 통과).

## 2. 접근과 범위

- `admin`만 접근한다.
- 관리자 확인 뒤에만 서버에서 서비스키 관리자 클라이언트로 `now.client`를 조회한다(`schema("now")`, 최대 2,000건). 브라우저에 서비스키를 보내지 않는다.

## 3. 화면 기능

- 상단 안내: "now(현황관리) 시스템이 원본이며 변경은 즉시 반영됩니다. 등록·수정은 현황관리에서 하세요."
- 목록 칸: 화주코드, 화주명, ERP코드, 노임코드, 손익코드, 대표화주(코드+이름), 사용여부, 비고.
- 화면 안 즉시 검색(화주명·코드·ERP·노임·손익·대표화주)과 "미사용 포함" 선택. 기본은 사용 화주만.
- 정렬: 사용 → `sort_order` → 화주명.
- 등록·수정·삭제 버튼은 없다.

## 4. 사본 반영 규칙 (현황관리 소유)

- 현황관리 `now.tg_sync_client`(트리거 `trg_sync_public`)가 now.client 저장 시 같은 트랜잭션에서 `public.clients`를 같은 id로 갱신(없으면 추가)한다. 감시·복사 열: `client_code`, `client_name`, `is_active`, `sort_order`, `note → notes`, 대표 부서 → `department_id`.
- 삭제는 반영하지 않고 `is_active`로 처리한다. `now_use`(현황관리 화면 전용 숨김)는 복사하지 않는다.
- 주간자료는 이 트리거·함수를 소유하지 않으며 별도 동기화를 하지 않는다.

## 5. 관계 책임 분리

- 화주 기본정보: 현황관리 화주마스터 → 실시간 사본
- 부서-화주 연결: 현황관리 부서마스터 → 실시간 사본
- 부서별 화주담당자: 주간자료 부서마스터의 `client_assignments`
- `saveClientAssignmentsAction`은 현재 사용하지 않으며 부서마스터에서 처리하라는 오류를 반환한다.

## 6. 데이터와 주요 코드

| 구분 | 위치 |
| --- | --- |
| 서버 페이지 | `src/app/(protected)/admin/clients/page.tsx` |
| 화면 | `NowSourceNotice`, `NowClientMasterTable` in `src/components/masters/NowMasterViews.tsx` |
| 순수 함수 | `src/lib/masters/now-master.ts` (`toClientMasterViewRow` 등), `tests/now-master.test.ts` |
| 서버 액션 | 없음(조회 전용) |
| 원본 테이블 | `now.client` (읽기 전용) |
| 주간자료 테이블 | `clients` |
| 사본 반영·가드 | 현황관리 저장소 `sql/002_takeover_public_masters.sql` |

## 7. 변경 불변 조건

- now 스키마에 쓰지 않는다(트리거·함수·데이터 변경 금지).
- `clients.id`를 재생성하지 않는다. hard delete 하지 않는다.
- `clients.department_id`를 유일한 부서 관계로 취급하지 않는다.
- 화주 미사용 처리가 과거 보고서, 물동량, 승인 이력을 삭제하지 않아야 한다.
- 화주명 변경(현황관리) 후 부서마스터, 헤더 필터, 보고서 관계 조회가 새 이름을 표시해야 한다.

## 8. 검증 시나리오

- 비관리자 route 접근 차단
- 현황관리에서 화주명·사용여부 변경 → 새로고침 시 목록과 주간자료 화면 반영
- 서비스키 누락·now 조회 실패 시 경고 문구
