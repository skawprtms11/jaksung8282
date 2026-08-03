# 회의자료 메뉴 지침

## 1. 목적

`/meeting-materials`는 화주자료와 부서자료를 회의용으로 집계해 취합 진척, 주요 이슈, 업무 항목, 물동량 추이, 공휴일근무, 시설공사를 조회하고 사업부 요청사항을 관리하는 메뉴다. 원천 데이터를 새로 입력하는 화면이 아니라 검토·비교·요청·최종 승인 관점의 화면이다.

## 2. 접근과 범위

- 접근 역할: `admin`, `department_head`, `manager`
- `client_owner`는 접근할 수 없다.
- 관리자는 선택한 부서 또는 가능한 탭의 전체 범위를 조회한다.
- 부서장·매니저는 자신의 `profile.department_id`만 조회한다.
- `materials` 탭에서 관리자에게 부서·화주가 없으면 무거운 전체 상세 조회를 피하기 위해 기본 부서를 선택한다.
- RPC와 fallback 쿼리 모두 같은 역할·부서·화주 범위를 적용해야 한다.

## 3. URL 계약과 탭 전환

- `tab`: `collection | materials | volumes | holiday | facility`, 기본 `collection`
- `report_year`, `report_month`, `week_of_month`, `week_start_date`
- `department_id`, `client_id`
- 회의자료 검색: `q`, `search_data`, `work_category_id`, `importance`, `date_from`, `date_to`와 parser 호환 params

탭 링크는 선택 주차와 범위 params를 보존한다. 주차는 `week_start_date`가 유효하면 우선하고, 그렇지 않으면 연·월·주차 조합을 해석하며 실패하면 현재 주차로 돌아간다.

최초 진입과 직접 URL 접근은 기존 Server Component 경로를 사용한다. 화면이 열린 뒤의 탭 전환은 `MeetingMaterialsWorkspace`가 URL history를 보존하면서 `/api/meeting-materials/tab`에서 활성 탭 payload만 받아 본문을 교체한다. API 실패 시 해당 탭의 기존 서버 URL로 이동해 legacy fallback을 그대로 사용할 수 있어야 한다.

탭 payload는 60초 동안 범위별로 캐시하고, 초기 화면이 안정된 뒤 다른 탭을 순차 준비한다. 동시에 여러 탭 RPC를 실행하지 않으며 새 탭 선택 시 진행 중인 사용자 요청만 취소한다. 뒤로가기·앞으로가기는 history의 탭과 캐시를 복원한다.

관리자에게 선택 부서가 없는 경우 탭 네비게이션을 만들기 위한 부서 선행 조회를 실행하지 않는다. `materials`의 기본 부서 결정은 RPC 또는 fallback 콘텐츠 조회 안에서 처리해 상단 탭과 loading 경계가 먼저 응답할 수 있어야 한다.

## 4. 데이터 로딩 구조

### 기본 RPC 경로

`get_meeting_materials_payload` RPC 한 번으로 현재 탭에 필요한 JSON payload를 조회한다.

입력:

- 탭
- 선택 주차와 보고 연월·주차
- 선택 부서와 화주

반환:

- `resolvedDepartmentId`
- `departments`, `clients`
- `reports`, `submissions`
- `openRequests`, `commonMaterialRequests`
- `workCategories`
- `volumeTrendReports`, `previousVolumeTrendReports`

RPC는 `security invoker`이며 활성 프로필, 허용 역할, 범위, 유효한 부서-화주 관계를 내부에서 검사한다. 탭별로 필요 없는 배열은 비워 payload를 줄인다.

### 호환 fallback

- RPC 오류 또는 payload 타입 불일치 시 기존 병렬 쿼리로 전환한다.
- `needsDepartments`, `needsClients`, `needsReports`, `needsSubmissions`로 탭별 조회를 제한한다.
- 독립 쿼리는 `Promise.all`로 실행한다.
- 취합현황 미종결 요청은 migration/관계 select 호환을 위해 관리자 클라이언트 보조 조회가 존재한다.
- fallback은 임시 오류 대응 경로이므로 기능을 추가할 때 RPC만 수정하지 않는다.

현재 보고서와 요청 조회 상한은 500건이다.

## 5. 탭별 기능

### 취합현황

입력 데이터:

- 활성 부서
- 부서별 등록 화주 연결
- 선택 주차 화주 보고서
- 선택 주차 부서 제출
- 중요도 `very_high`, `high` 업무 항목
- 모든 주차의 미종결 요청

화면:

1. 주요 이슈와 미종결 요청 패널
2. 부서별 작성 모니터링 표
3. 전체 화주 수, 작성 화주 수, 완료율
4. 부서별 화주 수, 완료율, 제출 상태, 확정일

작성 화주 수는 선택 주차에 보고서가 존재하는 서로 다른 화주 기준이다. 부서 상태는 제출 데이터의 상태를 작성 중, 검토, 승인, 반려 등으로 표시한다.

### 회의자료

- 선택 주차의 화주 보고서 항목과 부서 공통사항을 같은 표 모델로 합친다.
- 부서 공통사항은 `makeCommonMeetingRows`로 가상 보고서 행을 만들고 원래 submission과 item 위치를 request target에 보존한다.
- 검색은 두 원천 모두 대상으로 하며 일치한 개별 항목만 남긴다.
- 표는 부서, 화주 또는 공통 구분, 금주, 차주를 보여준다.
- 항목 제목 선택 시 `MeetingItemDetailDialog`를 열어 원문과 요청 이력을 표시한다.
- 요청 대상은 실제 화주 item ID 또는 부서 submission+period+sort order다.

### 물동량

- 선택 월의 1주차부터 현재 선택 주차까지 화주 `weekly_volumes`를 집계한다.
- 전월 비교용으로 이전 보고 연월의 같은 주차 범위를 별도 조회한다.
- `VolumeComparisonChart`는 입고, 출고, 합계 선택에 따라 완만한 꺾은선 추이를 표시한다.
- 주차별 요약 표는 1~5주차와 합계 행으로 입고, 출고, 합계를 표시한다.
- 부서별 현황은 부서, 1~5주차, 합계를 표시하고 선택한 입고·출고·합계 지표만 사용한다.
- 전월 대비 증감은 현재 합계에서 전월 합계를 뺀 값이며 증감률은 전월 값이 0인 경우의 표시 규칙을 기존 컴포넌트와 맞춘다.
- 합계는 저장 타입이 아니라 `inbound + outbound` 계산값이다.

### 공휴일근무

- 선택 주차 부서 제출의 `holiday_work` section을 읽는다.
- `department-holiday-work/v1` payload를 파싱해 부서별 근무일, 화주, 근무자, 계약직 인원, 사유, 청구 여부, 비고를 표시한다.
- malformed 또는 빈 payload가 전체 탭을 깨뜨리지 않도록 parser 호환을 유지한다.

### 시설공사

- 선택 주차 부서 제출의 `facility` section을 읽는다.
- `department-facility-constructions/v1` payload를 파싱해 부서별 공사기간, 공사명·내용, 업체, 금액, 상태, 비고를 표시한다.
- 상태 label과 빈 데이터 처리를 부서자료와 일치시킨다.

## 6. 요청사항 수명주기

```text
요청 등록 -> 요청 수정/삭제 -> 처리결과 등록/삭제 -> 종결
```

- 테이블: `weekly_report_item_requests`
- 대상: `client_item | department_common`
- 요청 등록자는 모든 상세 팝업에서 snapshot 이름·부서와 함께 기록된다.
- 본인 요청 또는 관리자는 종결 전 요청을 수정·삭제한다.
- 접근 가능한 담당자는 처리결과를 등록한다. 본인 결과 또는 관리자가 결과를 삭제한다.
- 처리결과가 있어야 종결할 수 있다.
- 관리자, 요청 등록자, 결과 등록자가 종결할 수 있다.
- `closed_at`이 기록된 요청은 취합현황과 부서자료 사업부 요청사항에서 제외된다.

공통 server action은 `src/actions/reports.ts`에 있다. 관리자 클라이언트를 사용하지만 먼저 `canAccessReportItemRequestTarget`으로 대상 부서 접근을 검사한다.

## 7. 최종 승인과 원천 데이터

- 화주자료 검토 상태는 `weekly_client_reports` 상태와 `transition_client_report_status`가 기준이다.
- 부서 최종 승인·반려는 `department_weekly_submissions`와 `transition_department_submission_status`가 기준이다.
- 사업부 최종 승인·반려는 관리자만 가능하며 반려 사유가 필요하다.
- 위 상태 전이용 server action과 `TransitionForm.tsx`는 구현되어 있지만 현재 회의자료 화면에는 승인·반려 버튼이 연결되어 있지 않다. 현재 회의자료 UI는 상태 조회, 검색, 요청·결과·종결 기능이 중심이다.
- 승인·반려 버튼을 추가하는 것은 기존 기능의 단순 표시가 아니라 새 UI wiring 작업으로 보고 권한, 상태, 이력까지 검증한다.
- 화면용 집계 때문에 원천 보고서 또는 section 내용을 복제 저장하지 않는다.
- 모든 전이는 `approval_history`를 남긴다.

## 8. 주요 코드와 데이터

| 구분 | 위치 |
| --- | --- |
| 탭·RPC·fallback·집계 | `src/app/(protected)/meeting-materials/page.tsx` |
| 탭 전환 shell·API | `MeetingMaterialsWorkspace.tsx`, `src/app/api/meeting-materials/tab/route.ts` |
| 탭 payload 모델 | `src/lib/reports/meeting-materials-tab-data.ts` |
| 탭 네비게이션·화면 | `MeetingMaterialsTabNav.tsx`, `MeetingMaterialsTabContent.tsx`, `MeetingMaterialsWeekFilter.tsx` |
| 회의자료 표·상세 | `MeetingMaterialsTable.tsx` |
| 취합 주요 이슈 | `MeetingPriorityPanel.tsx` |
| 물동량 차트 | `src/components/charts/VolumeComparisonChart.tsx` |
| 부서별 물동량 | `MeetingDepartmentVolumeBoard.tsx` |
| 공휴일·시설 | `MeetingHolidayWorkBoard.tsx`, `MeetingFacilityConstructionBoard.tsx` |
| 검색 | `DepartmentCommonSearchToolbar.tsx`, `client-report-search.ts` |
| 요청·상태 server action | `src/actions/reports.ts` |
| RPC migration | `20260801024419_meeting_materials_rpc.sql` |
| 성능 인덱스 | `027_performance_rpc_indexes.sql`, `032_open_request_performance_indexes.sql` |

## 9. 성능 불변 조건

- 활성 탭 외의 보고서, 제출, 차트 데이터를 조회하지 않는다.
- RPC 응답에 무관한 자식 관계를 추가하지 않는다.
- 관리자 전체 상세 회의자료를 기본으로 한 번에 500건 읽지 않도록 기본 부서 제한을 유지한다.
- dynamic import와 Suspense 경계를 유지한다.
- 탭 전환 시 공통 header filters를 매번 새로 조회하지 않는다.
- 최초 화면은 서버에서 활성 탭만 조회하고, 나머지 탭 API prefetch는 초기 렌더 후 순차 실행한다.
- 로컬 탭 전환 API도 `getCurrentUserProfile`과 `canViewMeetingMaterials`를 다시 검사하고 RPC의 RLS 범위를 우회하지 않는다.
- 로컬 탭 전환 실패 시 서버 URL fallback, 직접 URL 접근, 새로고침 경로를 유지한다.
- 요청 등록·수정·삭제 뒤 `materials`와 `collection` 캐시를 무효화한다.
- 관계별 후속 N+1 쿼리를 추가하지 않는다.
- RPC 변경 시 타입 가드와 fallback 결과가 같은 화면 모델을 생성하는지 비교한다.

## 10. 검증 시나리오

- 네 역할의 접근 허용·차단과 부서 범위
- 5개 탭의 주차·부서·화주 param 보존
- RPC 성공과 강제 fallback의 화면 결과 일치
- 취합현황 완료율, 중요도 필터, 모든 주차 미종결 요청
- 회의자료 공통·화주 통합검색과 초기화
- 화주 항목·부서 공통 항목 요청 등록, 결과, 종결
- 물동량 1~5주차·합계·부서별·전월 비교 계산
- 공휴일근무와 시설공사의 JSON 파싱 및 빈 데이터
- 메뉴 진입, 탭 전환, 검색, 저장 동작의 변경 전후 시간과 요청 수
