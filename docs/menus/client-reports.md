# 화주자료 메뉴 지침

## 1. 목적

`/client-reports`는 화주별 주간 업무자료의 최초 입력 지점이다. 사용자는 금주 실시사항, 차주 예정사항, 물동량을 작성하고 확정하며, 이후 부서자료와 회의자료는 이 데이터를 검토·집계한다.

## 2. 접근과 범위

| 역할 | 조회·작성 범위 |
| --- | --- |
| `admin` | 선택한 모든 부서·화주 |
| `department_head` | 소속 부서의 등록 화주 |
| `manager` | 소속 부서의 등록 화주 |
| `client_owner` | 소속 부서이면서 자신에게 활성 배정된 화주 |

- 부서-화주 관계는 `department_client_links`가 기준이다.
- 화주담당자 제한은 `client_assignments(user_id, department_id, client_id, is_active)`까지 확인한다.
- 관리자가 부서를 선택하지 않으면 `pickDefaultDepartmentId`로 기본 부서를 정한다.
- 화주가 선택되지 않으면 역할 범위에서 `pickDefaultClientId`로 기본 화주를 정한다.
- 화면 필터로 범위가 제한되어도 server action과 RPC가 권한을 다시 검사해야 한다.

## 3. URL 상태

주차와 범위:

- `report_year`, `report_month`, `week_of_month`, `week_start_date`
- `department_id`, `client_id`
- `status`: `draft | submitted | approved | rejected`

검색:

- `q`: 금주·차주 항목의 제목 빠른 검색
- `search_data`: 제목과 내용 통합 상세검색
- `work_category_id`, `importance`
- `date_from`, `date_to`
- 이전 호환용 `title`, `current_content`, `next_content`도 parser가 이해하지만 현재 상세검색 UI는 입력칸 하나인 `search_data`를 사용한다.

주차 변경은 URL을 갱신하고 선택 주차의 보고서를 다시 조회한다. 상세검색을 열면 좌측 주차 선택 대신 기간 시작·종료가 표시된다. 초기화는 검색 params만 제거하고 부서, 화주, 주차는 유지한다.

## 4. 화면 구조

1. `ClientReportsToolbar`: 주차 선택, 빠른 제목 검색, 초기화, 상세검색
2. `ClientReportEditor`: 선택 화주/주차의 금주·차주 항목과 물동량 작성
3. `ClientReportsTable`: 조회 보고서, 상태, 담당자, 업무 항목, 물동량, 일괄 동작
4. 항목 작성 팝업: 업무구분, 중요도, 제목, 내용
5. 물동량 팝업: 유형, 수량, 단위, 사용자 단위, 비고

선택 화주·주차에 수정 가능한 기존 보고서가 있으면 이어서 작성한다. 검색 중에는 일치한 항목만 표에 표시하고 물동량은 검색 결과에서 숨긴다. 편집 원본은 필터링되지 않은 보고서를 유지해야 한다.

## 5. 조회 흐름

1. 선택 주차를 `week.ts`로 해석한다.
2. 사용자 프로필과 역할에 따라 부서·화주 기본 범위를 결정한다.
3. 부서, 업무구분, 부서-화주 연결, 담당자 배정, 작성자명, 보고서를 독립 쿼리로 병렬 조회한다.
4. 기간 검색이 없으면 `week_start_date`가 선택 주차와 같은 보고서만 조회한다.
5. 기간 검색이 있으면 입력 기간과 선택 주차를 모두 포함하도록 조회 경계를 확장한다.
6. `filterClientReportSearchItems`로 일치한 개별 항목만 남긴다.
7. 최대 목록 조회는 현재 300건이며 불필요하게 늘리지 않는다.

## 6. 입력 데이터 계약

### 업무 항목

- `item_period`: `current | next`
- `importance`: `very_high | high | medium | low`
- `work_category_id`
- `title`: 필수, 최대 120자
- `content`: 필수
- `sort_order`

### 물동량

- `volume_type`: 핵심 화면은 `inbound`, `outbound`를 사용하며 enum의 다른 타입도 DB 호환상 존재한다.
- `quantity`: 0 이상
- `unit`: `EA`, `BOX`, `CASE`, `PLT`, `case_count`, `TON`, `CBM`, `etc`
- `custom_unit`, `note`, `sort_order`

### 보고서

- 한 화주와 한 `week_start_date`에는 활성 보고서가 하나만 존재한다.
- `no_special_issue = false`로 확정할 때 업무 항목이 최소 1개 필요하다.
- 화면 저장 상태는 `draft` 또는 `submitted`만 허용한다.

## 7. 저장과 상태 흐름

```text
draft -> submitted -> approved
                   -> rejected -> draft | submitted
approved -> submitted | draft   (권한 있는 재오픈)
submitted -> draft              (확정 후 3일 이내)
```

### 저장·확정

- `saveClientReportAction`이 `clientReportSchema`로 전체 payload를 검증한다.
- `save_client_report_atomic` RPC가 부모 보고서 저장, 기존 자식 항목·물동량 교체, 새 자식 저장, 필요 시 승인 이력 기록을 한 트랜잭션으로 수행한다.
- advisory transaction lock으로 같은 화주·주차의 동시 중복 생성을 막는다.
- 저장 결과 전체 행을 다시 읽어 로컬 목록에 upsert하고 편집 모드를 닫는다.

### 일괄 확정·취소·삭제

- 확정: `submit_client_reports_atomic`
- 확정취소: `cancel_client_reports_submission_atomic`
- 삭제: `soft_delete_client_reports_atomic`
- 확정취소는 `submitted` 상태이며 `submitted_at`부터 3일 이내여야 한다.
- 화주담당자는 배정된 본인 범위만 처리한다.
- 삭제는 `deleted_at`, `deleted_by`를 기록한다.

### 검토 상태

- 관리자, 부서장, 매니저가 `transition_client_report_status` RPC로 승인·반려한다.
- 반려에는 사유가 필요하다.
- 상태 전이는 `approval_history`에 기록한다.
- `approved` 보고서는 일반 편집으로 수정하지 않는다.
- 현재 route에 표시되는 `ClientReportsTable`은 편집, 확정, 확정취소, 삭제를 제공한다. 승인·반려용 `TransitionForm.tsx`와 server action은 존재하지만 현재 화면에는 연결되어 있지 않다.
- 승인·반려 UI가 이미 제공된다고 가정하지 않는다. 이를 노출하는 변경은 별도 기능 변경으로 다루고 역할·상태별 검증을 추가한다.

## 8. 주요 코드와 데이터

| 구분 | 위치 |
| --- | --- |
| 서버 페이지 | `src/app/(protected)/client-reports/page.tsx` |
| 화면 조합 | `src/components/reports/ClientReportsWorkspace.tsx` |
| 검색 UI | `src/components/reports/ClientReportsToolbar.tsx` |
| 편집기 | `src/components/reports/ClientReportEditor.tsx` |
| 목록·일괄 동작 | `src/components/reports/ClientReportsTable.tsx` |
| 서버 액션 | `src/actions/reports.ts` |
| 검색 의미 | `src/lib/reports/client-report-search.ts` |
| 입력 검증 | `clientReportSchema`, `reportItemSchema`, `volumeSchema` |
| 테이블 | `weekly_client_reports`, `weekly_client_report_items`, `weekly_volumes` |
| 범위 테이블 | `department_client_links`, `client_assignments`, `work_categories` |
| 관련 migration | `018_atomic_report_saves_and_indexes.sql`, `025_confirmation_cancel_window_three_days.sql`, `029_simplify_permission_helpers.sql` |

## 9. 교차 메뉴 영향

- 업무 항목 구조 변경은 부서자료 검토, 회의자료 표, 검색, 요청사항 target에 영향을 준다.
- 물동량 변경은 부서자료 물동량 탭과 회의자료 물동량 탭의 집계에 영향을 준다.
- 상태 변경은 부서자료 작성현황과 회의자료 취합현황에 영향을 준다.
- 검색 변경은 `department-reports.md`와 `meeting-materials.md`를 함께 확인한다.

## 10. 변경 불변 조건과 검증

- 사이드바 진입은 배포 환경의 전체 route 프리페치와 Next.js 기본 링크 전환을 유지한다.
- 주차를 바꾸면 편집 대상과 목록이 모두 같은 주차로 바뀌어야 한다.
- 화주담당자에게 배정되지 않은 화주가 헤더, 편집기, server action 어느 경로에서도 허용되지 않아야 한다.
- 검색 결과는 일치한 항목만 보이고 초기화하면 원래 선택 주차 데이터가 돌아와야 한다.
- 저장 중 중복 클릭, 동일 화주·주차 중복 생성, 자식만 부분 저장되는 상황을 막아야 한다.
- `draft`, 확정, 확정취소, 승인, 반려, 재편집 흐름을 역할별로 검증한다.
- 확정 3일 경계는 UI와 DB 모두 확인하되 DB 결과를 최종 기준으로 한다.
- 저장 후 부서자료의 화주별 검토 표와 물동량 합계에 즉시 같은 데이터가 나타나는지 확인한다.
