# 부서자료 메뉴 지침

> `/mobile`의 부서자료 화면은 공통사항, 공휴일근무, 시설공사만 제공하며 이 메뉴의 데이터, 권한, 저장 액션을 공유한다. 모바일 전용 레이아웃 계약은 [mobile-app.md](./mobile-app.md)를 함께 확인한다.

## 1. 목적

`/department-reports`는 한 부서의 화주자료를 검토하고 부서 공통자료, 시설공사, 공실, 공휴일근무를 작성한 뒤 사업부로 확정 제출하는 메뉴다. 화주자료와 회의자료 사이의 검토·취합 계층이다.

## 2. 접근과 권한

| 역할 | 범위와 기능 |
| --- | --- |
| `admin` | 모든 부서 조회·작성, 확정 제출, 허용 상태 재오픈 |
| `department_head` | 소속 부서 조회·작성, 확정 제출·취소 |
| `manager` | 소속 부서 조회·초안 작성, 확정 제출 불가 |
| `client_owner` | 소속 부서와 화주자료 조회, 부서자료 편집·제출 불가 |

- 비관리자는 `profile.department_id`가 최종 범위다.
- 관리자도 실제 작성·확정을 하려면 특정 부서를 선택해야 한다.
- 헤더에서 부서와 화주를 선택한다. 화주 필터 기본값은 `전체 화주`이며, 화주 미선택 시 해당 부서에 활성 연결된 모든 화주의 자료를 조회한다. 특정 화주를 선택한 경우에만 해당 화주로 범위를 좁힌다.
- 화면의 disabled 상태와 `save_department_submission_atomic`, 공실 server action의 권한 검사를 함께 유지한다.

## 3. URL과 로컬 상태

URL 범위:

- `department_id`, `client_id`
- `report_year`, `report_month`, `week_of_month`, `week_start_date`
- `tab`
- 공통 검색: `q`, `search_data`, `work_category_id`, `importance`, `date_from`, `date_to`와 이전 호환 params

탭 값은 다음과 같다.

- `common`: 공통사항
- `volume`: 물동량
- `facility`: 시설공사
- `vacancy`: 공실
- `holiday_work`: 공휴일근무

`/department-reports`의 탭은 URL `tab` 파라미터다. 서버가 값을 검증해 `DepartmentSubmissionEditor`의 초기 탭으로 내려주고, 탭 전환은 다른 파라미터를 보존한 채 `tab`만 `router.replace`로 갱신한다. 값이 없거나 유효하지 않으면 첫 탭을 쓴다. `/mobile`은 탭을 URL에 쓰지 않고 로컬 상태로만 유지한다.

주차 전환 경로는 화면별로 다르다.

- `/department-reports`: 주차 파라미터를 URL에 반영하면 `key`가 바뀌어 에디터가 리마운트되고 서버 조회 결과로 다시 채워진다. 클라이언트 재조회는 하지 않는다. `tab`이 URL에 있으므로 주차를 바꿔도 활성 탭이 유지된다.
- `/mobile`: 에디터 `key`에 주차가 없어 리마운트가 없으므로 `loadDepartmentSubmissionAction`으로 같은 컴포넌트 안에서 부서 제출자료를 다시 읽는다.

공실 탭은 두 화면 모두 별도 `loadDepartmentVacancyDataAction`으로 갱신한다. URL 초기값과 클라이언트 선택 주차가 어긋나지 않게 유지한다.

## 4. 최초 조회 흐름

1. URL 주차가 있으면 그 주차를, 없으면 오늘 주차를 선택 주차로 삼고 역할별 기본 부서를 결정한다. URL에 `client_id`가 있을 때만 특정 화주 필터를 적용한다.
2. 서버 세션 클라이언트를 우선 사용하고, 명시적 범위 검증이 있는 전체 조회는 서버 관리자 클라이언트를 제한적으로 사용한다.
3. 부서, 업무구분, 화주 보고서, 등록 화주 수, 선택 주차 부서 제출, 공휴일 화주 옵션, 근무자 옵션, 센터, 월 물동량, 관리자 ID, 미종결 요청, 요약 카드용 선택 주차 보고서를 병렬 조회한다.
4. 화주 검토 목록은 기간 검색이 없으면 선택 주차, 기간 검색이 있으면 입력한 기간으로 조회한다. 선택 주차를 기간에 강제로 포함시키지 않는다.
5. 검색 중에는 화주 보고서와 부서 공통사항 모두에서 일치한 개별 항목만 남긴다.
6. 요약 카드는 검색 조건과 무관하게 항상 선택 주차만 집계한다. 목록 조회와 데이터 소스를 분리한다.

현재 제한:

- 화주 검토 목록 최대 300건
- 미종결 요청 최대 200건
- soft delete 보고서와 제출은 제외

## 5. 상단 공통사항 구조

공통사항 탭에는 다음 영역이 함께 나타난다.

1. 작성현황: 부서 등록 화주 수 대비 선택 주차 작성 보고서 수
2. 내용건수: 선택 주차 화주 항목을 중요도별 집계
3. 물동량: 선택 주차 입고·출고 합계
4. 사업부 요청사항: 관리자 작성 요청 중 `closed_at is null`인 항목
5. 부서 공통사항: 금주·차주 다건 항목
6. 화주별 자료 검토: 화주명, 담당자, 금주·차주 항목, 상태, 수정일

일반·상세검색은 부서 공통사항과 화주별 자료를 한 검색 범위로 취급한다. 결과가 없는 영역은 원본 데이터를 섞어 보여주지 않는다. 초기화는 범위와 주차를 유지하고 검색조건만 제거한다.

요약 카드 3종(작성현황·내용건수·물동량)은 검색 조건과 무관하게 항상 선택 주차를 집계한다. 검색 조건을 따르는 것은 화주별 자료 검토 목록뿐이다. 따라서 기간 검색으로 다른 주차를 조회하면 목록 건수와 카드 수치가 서로 다를 수 있으며 이는 정상 동작이다.

- 카드 전용 쿼리는 부서·화주 필터만 동일하게 적용하고 주차는 항상 선택 주차로 고정한다. `q`, `date_from`, `date_to` 등 검색 파라미터는 적용하지 않는다.
- 기간 검색(`date_from`/`date_to`)이 없으면 목록 조회와 범위가 같으므로 카드 전용 쿼리를 실행하지 않고 목록 결과를 재사용한다.
- 등록 화주 수는 원래 주차와 무관한 집계이므로 두 경로 모두 같은 값을 쓴다.

## 6. 탭별 데이터 계약

### 공통사항

`department_weekly_contents.section_type = common`에 금주·차주 문자열을 저장한다. 다건 입력은 `department-common-items/v1` JSON payload다.

각 항목:

- 중요도
- 업무구분 ID
- 제목
- 내용
- 정렬순서

기존 평문은 단일 항목으로 변환해 표시·검색한다.

### 물동량

- 입력 화면이 아니라 화주자료 `weekly_volumes`의 월/주차별 집계 화면이다.
- 입고는 `inbound`, 출고는 `outbound`, 합계는 둘의 합으로 계산한다.
- 우측 상단 선택값에 따라 한 지표만 행 데이터로 표시한다.
- 화주별 등록현황과 단위를 함께 고려하며 별도 합계 row를 저장하지 않는다.

### 시설공사

`department_weekly_contents.section_type = facility`의 current content에 `department-facility-constructions/v1` JSON을 저장한다.

항목 필드:

- 착공일, 완공예정일
- 공사명, 공사내용
- 시공업체, 공사금액
- 상태: `planned | in_progress | completed`
- 비고

화면에서 상태·키워드 검색, 등록, 수정, 다건 삭제를 제공한다. next content는 사용하지 않는다.

### 공실

공실은 `department_weekly_contents`가 아니라 `department_vacancy_records`에 센터·주차별 한 행으로 저장한다.

필드:

- 운영면적, 단순보관면적, 공실면적, 전체면적
- 단순보관 비고, 공실 비고
- 센터, 부서, 보고 연월·주차

표는 1~5주차와 데이터가 있는 주차 평균을 표시한다. 공실률은 `공실면적 / 전체면적 * 100`이다. 추이 차트는 선택 센터들의 월별 주차 평균 단순보관면적과 공실면적을 합산·평균해 표시한다.

### 공휴일근무

`department_weekly_contents.section_type = holiday_work`의 current content에 `department-holiday-work/v1` JSON을 저장한다.

항목 필드:

- 근무일
- 화주명
- 근무자명 목록
- 계약직 인원
- 근무사유
- 청구 여부
- 비고

화주 옵션은 부서 등록 화주, 근무자 옵션은 부서 프로필에서 가져온다. next content는 사용하지 않는다.

## 7. 부서 제출 저장과 상태

저장 payload는 항상 네 section인 `common`, `facility`, `vacancy`, `holiday_work`를 포함한다. 공실의 실제 상세는 별도 테이블이지만 section 행은 제출 구조 호환을 위해 유지한다.

```text
draft -> submitted_to_division -> division_approved
                               -> division_rejected -> draft | submitted_to_division
division_approved -> draft      (관리자)
submitted_to_division -> draft  (관리자·부서장, 확정 후 3일 이내)
```

- `saveDepartmentSubmissionAction`은 `departmentSubmissionSchema`를 검증하고 `save_department_submission_atomic` RPC를 호출한다.
- RPC는 부서/주차 중복을 잠그고 제출 행과 section 내용을 한 트랜잭션으로 upsert한다.
- 확정 제출은 관리자·부서장만 가능하며 `finalized_by`, `finalized_at`과 승인 이력을 기록한다.
- 확정취소는 `cancel_department_submission_atomic`을 사용하고 3일 제한을 DB에서 최종 검사한다.
- 최종 승인·반려는 관리자만 `transition_department_submission_status`로 처리한다. 반려 사유는 필수다.
- 확정 또는 승인 상태에서는 일반 내용과 공실을 수정하지 않는다.
- 최종 승인·반려용 server action과 `TransitionForm.tsx`는 존재하지만 현재 부서자료·회의자료 화면에는 연결되어 있지 않다. 현재 화면에서 가능한 동작과 도메인 상태 전이 능력을 구분한다.

## 8. 사업부 요청사항

- 원본은 `weekly_report_item_requests`다.
- 화주 항목 요청과 부서 공통 항목 요청을 모두 조회한다.
- 이 화면에서는 관리자 프로필 ID로 생성된 미종결 요청만 `사업부 요청사항`으로 구성한다.
- 선택 주차와 무관하게 같은 부서의 모든 미종결 요청을 표시한다.
- 제목을 선택하면 회의자료와 같은 `MeetingItemDetailDialog` 계약으로 원문, 요청, 결과, 종결 상태를 표시한다.
- 결과 등록·삭제와 종결 권한은 `reports.ts`의 공통 server action을 따른다.

## 9. 주요 코드와 데이터

| 구분 | 위치 |
| --- | --- |
| 서버 페이지·초기 집계 | `src/app/(protected)/department-reports/page.tsx` |
| 탭·편집·시설·공실·공휴일 | `src/components/reports/DepartmentSubmissionEditor.tsx` |
| 물동량 표 | `src/components/reports/DepartmentVolumeBoard.tsx` |
| 검색 | `DepartmentCommonSearchToolbar.tsx`, `src/lib/reports/client-report-search.ts` |
| 요청사항 | `DepartmentOpenRequestBoard.tsx`, `MeetingMaterialsTable.tsx` |
| 서버 액션 | `src/actions/reports.ts` |
| 테이블 | `department_weekly_submissions`, `department_weekly_contents`, `department_vacancy_records` |
| 입력 원본 | `weekly_client_reports`, `weekly_client_report_items`, `weekly_volumes` |
| 관계 | `department_client_links`, `profiles`, `center_masters` |
| 관련 migration | `018`, `023`, `025`, `026`, `031`, `032` migration |

## 10. 교차 메뉴 영향과 검증

- 사이드바 진입은 배포 환경의 전체 route 프리페치와 Next.js 기본 링크 전환을 유지한다. 화면 내부 탭 파라미터와는 별개다.
- 부서 공통 payload 변경은 회의자료의 공통행·검색·요청 target을 함께 바꾼다.
- 시설공사와 공휴일근무 payload 변경은 회의자료 해당 탭 parser를 함께 수정한다.
- 물동량 계산 변경은 화주자료 저장 타입과 회의자료 집계를 함께 검증한다.
- 요청사항 변경은 회의자료 상세 팝업과 취합현황을 함께 검증한다.

필수 시나리오:

- 관리자 전체 범위 안내와 특정 부서 선택 후 편집
- 역할별 편집·제출·취소 버튼 권한
- 주차 변경 후 모든 탭의 데이터 동기화와 활성 탭 유지(`tab` 파라미터)
- 공통·화주 통합검색, 일치 항목만 표시, 초기화
- 시설공사 등록·검색·수정·삭제와 JSON 재로드
- 공실 센터/주차 중복, 계산, 추이, 확정 후 편집 차단
- 공휴일근무 등록·수정·삭제와 회의자료 반영
- 확정, 3일 내 취소, 최종 승인·반려, 승인 이력
- 미종결 사업부 요청의 주차 독립 노출과 종결 후 제거
