# 부서별화주등록 메뉴 지침

## 1. 목적

`/client-registrations`는 부서별로 실제 운영 중인 화주(운영 화주)와 화주별 담당자를 등록하고, 현황관리 인원상세의 화주별 비중으로 '현황 담당자' 참고 명단을 가져오는 메뉴다. 사이드바 `화주자료` 바로 아래에 있다.

### 결정 기록 (2026-11-02 대표님 결정)

- 운영 화주는 주간자료 전용 표 `department_operating_clients`에 저장한다. 후보는 현황관리(now)의 부서-화주 연결(`now.department_client` → 실시간 사본 `department_client_links`)뿐이며, now와 `department_client_links`는 건드리지 않는다(현황관리 소유·가드 표, 트리거 추가 금지).
- 현황관리에서 연결이 해제(`department_client_links.is_active = false` 또는 행 없음)되면 운영 화주에서도 빠진 것으로 취급한다. 운영 표 행은 그대로 두고, 조회할 때 활성 연결과 교집합으로 계산한다. 다시 연결되면 이전 운영 여부가 살아난다.
- 마이그레이션 적용 시점의 활성 연결 쌍 전부를 운영 화주 초기값으로 넣었다. 이후 현황관리에서 새로 연결된 화주는 이 메뉴에서 운영 체크·저장해야 작성 목록에 나타난다.
- 담당자(`client_assignments`)는 해당 부서 소속 활성 사용자 전체(역할 무관) 중 여러 명, 대표 1명. 기존 부서마스터의 담당자 지정(화주담당자 역할만 후보)을 대체한다.

### 결정 기록 (2026-11-05 대표님 결정) — 현황 담당자

- `현황에서 가져오기` 버튼으로 현황관리(now) 인원상세(`now.employee_status`)와 센터·화주별 비중(`now.employee_alloc.ratio`, % 단위)을 읽어 화주별 '현황 담당자'를 만든다. now는 읽기만 한다.
- 현황 담당자는 `department_client_staff`에 담당자 배정(`client_assignments`, 로그인 계정·화주담당자 권한용)과 **별도로** 저장한다. 계정 유무와 무관한 참고 명단이며 권한·작성 목록에 영향이 없다.
- 기준 월: 그 부서에서 비중이 있는 가장 최근 `base_month`를 자동 선택하고 화면에 표시한다.
- 포함 기준: 화주명(앞뒤 공백 제거) 기준으로 직원별 비중을 합산해 1% 이상. 같은 화주를 여러 센터로 나눠 맡거나 같은 이름의 화주 ID가 여러 개여도 이름으로 묶어 합산한다. 부서장(`duty = '팀장'`)은 제외한다.
- 합산 결과는 이 부서에 활성 연결된 사용 중 화주 중 이름이 같은 화주 전부의 행에 붙인다. 같은 이름의 연결 화주가 없으면 비중이 잡힌 화주 ID에 저장하되 화면 행이 없어 건수로만 안내한다.
- 직원 키는 사번(`emp_no`), 사번이 비면 `now#<employee_status.id>`.
- 다시 가져오면 그 부서의 현황 담당자 명단 전체를 교체한다. 비중 자료가 하나도 없으면 기존 명단을 지우지 않는다.

## 2. 접근과 권한

| 기능 | `admin` | `department_head` | `manager` | `client_owner` |
| --- | --- | --- | --- | --- |
| 메뉴 노출·화면 접근 | 가능 | 가능 | 가능 | 숨김·차단 |
| 조회 부서 | 헤더에서 고른 부서 | 소속 부서 고정 | 소속 부서 고정 | - |
| 운영 화주 저장 | 모든 부서 | 소속 부서 | 소속 부서 | 불가 |
| 담당자 지정 | 모든 부서 | 소속 부서 | 소속 부서 | 불가 |
| 현황에서 가져오기 | 모든 부서 | 소속 부서 | 소속 부서 | 불가 |

- 메뉴·페이지 진입: `canRegisterDepartmentClients`(사이드바, page redirect).
- 저장 권한: `canManageDepartmentClients(profile, departmentId)`(서버 액션)과 RPC 내부 검사가 같은 규칙이다. RPC는 `auth.uid()`의 활성 프로필 역할을 다시 읽고, 역할 NULL·비활성·화주담당자·타 부서를 거부한다.
- 서버 액션은 `requireActiveProfile` 후 사용자 세션 클라이언트(`createSupabaseServerClient`)로 RPC를 호출한다(서비스키 아님).

## 3. URL과 헤더 조건

- `department_id`: 관리자 조회 부서. 없거나 사용 부서가 아니면 기본 부서(`pickDefaultDepartmentId`, TPL전략팀 우선).
- 헤더 조건은 부서만 적용(`departmentScopeRoutes`)하며 부서 선택이 필수다(헤더가 기본 부서를 URL에 채움). 부서장·매니저는 헤더에 소속 부서만 표시되고 서버도 소속 부서로 강제한다(`resolveRegistrationDepartmentId`).
- 화주담당자는 헤더 조건 미적용으로 취급한다.

## 4. 조회 구조

진입 권한 확인 뒤 서비스키 관리자 클라이언트로 읽는다.

1. 사용 중 부서 목록(비관리자는 소속 부서만) → 화면 부서 결정
2. 병렬 조회(각 최대 1,000건): 활성 연결 + 화주(`department_client_links` → `clients(id, client_code, client_name, is_active)`), 운영 표 활성 행, 부서 소속 활성 사용자(역할 지정됨), 활성 담당자 배정, 현황 담당자(`loadDepartmentNowStaff`, 1,000건씩 끝까지)
3. `buildClientRegistrationRows`: 사용 중 연결 화주마다 운영 여부와 담당자(대표 먼저, 지금 부서 소속 활성 사용자만)를 붙여 화주명 순으로 정렬
4. `buildDepartmentNowStaff`: 현황 담당자를 화주별로 묶어 비중 내림차순(같으면 이름순) 정렬, 가장 최근 가져온 시각과 그 기준 월

운영 표 또는 현황 담당자 조회 실패 시 "DB 마이그레이션 적용 여부를 확인하세요." 경고를 표시한다. 현황 담당자 조회 실패는 나머지 화면을 막지 않는다.

## 5. 화면 기능 (`ClientRegistrationWorkspace`)

- 안내: 부서-화주 연결은 현황관리 원본, 여기서는 연결된 화주 중 운영 화주와 담당자만 등록, 운영 화주만 작성 목록에 나타남.
- 목록 칸: 운영(체크), 화주코드, 화주명, 담당자(대표 표시), 현황 담당자, 담당자 지정 버튼. 모바일 폭에서는 카드형 배치(현황 담당자는 `현황` 표시와 함께 별도 줄).
- 현황 담당자 칸(사번은 클라이언트로 보내지 않음, 화면 key는 화주ID+순번): `이름(직급·비중%)`(직급 없으면 `이름(비중%)`, 비중은 소수 첫째 자리)을 비중 내림차순으로 표시. 운영 여부와 무관하게 해당 화주 행에 표시하며 "운영 화주만" 필터는 행 단위로 그대로 적용된다.
- 버튼 줄 아래 안내: `현황 기준 YYYY-MM · 가져온 시각`(미가져옴이면 그 안내), 참고 명단·로그인 담당자와 별개라는 설명, 연결 목록에 없는 화주의 현황 담당자가 있으면 그 화주 수.
- `현황에서 가져오기`(관리 권한자에게만, 운영 화주 저장 버튼과 같은 조건): 확인창("기준 월 최신 자료로 이 부서의 현황 담당자를 모두 바꿉니다") → 실행 중 버튼 비활성·"가져오는 중…" → 결과 메시지(기준 월, 인원 수, 화주 수). 가져오는 동안 운영 화주 저장도 비활성. 성공 시 액션이 돌려준 명단으로 로컬 상태를 바꾼다.
- 검색(화주명·화주코드·담당자명·현황 담당자명), "운영 화주만" 선택, 운영/전체/표시 건수.
- 운영 체크를 바꾸면 행에 `변경` 표시. `운영 화주 저장`은 변경이 있을 때만 활성. 헤더 체크박스는 표시된 행 전체 선택·해제.
- 담당자 지정 버튼은 저장된 운영 화주이면서 미저장 변경이 없을 때만 활성. 팝업에서 이름·역할 검색, 여러 명 체크, 대표 라디오(체크한 사람만). 대표가 빠지면 남은 첫 담당자로 옮긴다(`nextPrimaryUserId`). 빈 목록 저장 = 담당자 전체 해제.
- 저장 성공 시 로컬 상태만 갱신한다(전체 새로고침 없음).

## 6. 서버 액션과 RPC

| 기능 | 서버 액션 (`src/actions/client-registrations.ts`) | RPC |
| --- | --- | --- |
| 운영 화주 저장 | `saveDepartmentOperatingClientsAction` | `save_department_operating_clients(p_department_id, p_client_ids)` |
| 담당자 저장 | `saveDepartmentClientAssignmentsAction` | `save_department_client_assignments(p_department_id, p_client_id, p_user_ids, p_primary_user_id)` |
| 현황에서 가져오기 | `importStaffFromNowAction(departmentId)` | `import_department_client_staff_from_now(p_department_id)` |

공통: `security definer`, `search_path = ''`, 스키마 한정, 실행권 `authenticated`만(public·anon 회수). 예외는 P0001 한국어 문구(160자 이하)로 `safeErrorMessage(message, code)`가 그대로 보여 준다.

`save_department_operating_clients`

- `p_client_ids`가 이 부서의 운영 화주 전체 목록이다(중복·NULL 제거, 최대 1,000건).
- 모든 화주는 이 부서의 활성 연결이면서 사용 중 화주여야 한다. 아니면 전체 거부.
- 목록에 없는 기존 운영 행은 `is_active = false`로 바꾸되, 현재 활성 연결이 있는 화주만 바꾼다(연결 해제로 안 보이는 행은 유지).
- 목록의 화주는 `(department_id, client_id)` upsert로 `is_active = true`.
- 부서 단위 advisory lock으로 동시 저장을 직렬화한다.

`save_department_client_assignments`

- 화주는 이 부서의 운영 화주(운영 표 활성 ∩ 활성 연결 ∩ 사용 중 화주·부서)여야 한다.
- 담당자는 이 부서 소속 활성 사용자(역할 지정됨), 최대 100명. 중복은 처음 순서를 지켜 제거한다.
- 대표는 목록 중 하나여야 하고, 비우면 첫 사용자.
- 기존 활성 배정을 모두 비활성화한 뒤 `(department_id, client_id, user_id)` upsert. (부서, 화주) 단위 advisory lock.

`import_department_client_staff_from_now`

- 권한 검사는 운영 화주 저장과 같다(관리자 전체, 부서장·매니저는 소속 부서만, NULL 안전 판정, 사용 중 부서만).
- 부서 단위 advisory lock 후, 그 부서(`now.employee_status.dept_id`)에서 비중(`ratio > 0`)이 있는 최신 `base_month`를 고른다. 없으면 기존 명단을 지우지 않고 `base_month: null`, 0건을 돌려준다(액션은 "비중 자료가 없어 기존 현황 담당자를 그대로 두었습니다" 안내).
- 그 월의 직원 중 `duty = '팀장'`인 사번을 빼고, 직원·화주명별 비중 합계 1% 이상을 그 부서 행 전체 삭제 후 넣는다.
- 반환: `{ base_month, staff_count, client_count, row_count }`. 액션은 가져온 뒤 사용자 세션으로 명단을 다시 읽어 화면에 돌려준다.

### 운영 해제·재등록·사용 중지 시 동작

- 운영 체크를 해제해도 그 화주의 담당자 배정(`client_assignments`)은 지우지 않는다. 배정 데이터는 남고, 헤더·화주자료·모바일의 작성·선택 목록에서만 숨는다(이 화면 목록에는 담당자 표시가 남는다). 다시 운영 체크·저장하면 기존 배정이 그대로 되살아난다.
- 현황관리에서 화주를 사용 중지(`clients.is_active = false`)하면 이 화면 목록에서 빠지고, 그 뒤 부서 운영 화주를 저장하면 해당 운영 행은 `is_active = false`로 해제된다(활성 연결이 남아 있는 경우). 연결 자체가 해제된 화주의 운영 행은 저장해도 건드리지 않는다.
- 운영 해제된 화주의 과거 화주자료·부서자료·회의자료는 그대로 조회되지만, 작성·선택 목록(헤더 화주, 화주자료 편집, 모바일, 공휴일근무)에는 나타나지 않는다.
- 담당자 배정 쓰기는 RPC로 일원화했다. 이 마이그레이션에서 부서장·매니저의 `client_assignments` 직접 insert/update 정책(008의 `client_assignments_department_leads_insert`·`_update`)을 제거했다. 관리자 정책(004)과 조회 정책은 남아 있다.

## 7. 데이터

| 표 | 용도 |
| --- | --- |
| `department_operating_clients` | 운영 화주(주간자료 전용). RLS select: 역할 지정 사용자 + `can_access_department`. insert/update/delete 정책 없음(RPC 전용), anon 권한 없음 |
| `department_client_links` | 후보(현황관리 사본, 읽기만) |
| `client_assignments` | 화주 담당자 |
| `department_client_staff` | 현황 담당자(now 비중 기준 참고 명단). unique(부서, 화주, 사번). RLS select: 가져오기 RPC와 같은 규칙(관리자 전체, 부서장·매니저 소속 부서만, NULL 안전 판정). 화주담당자는 조회 불가. 별도 인덱스 없이 unique(부서 선두)로 조회. 쓰기 정책 없음(RPC 전용), anon 권한 없음 |
| `now.employee_status`, `now.employee_alloc` | 현황 담당자 원천(읽기만, 가져오기 RPC 안에서) |
| `profiles`, `departments`, `clients` | 후보 사용자·부서·화주 |

마이그레이션: `supabase/migrations/20261102100000_department_operating_clients.sql`, `supabase/migrations/20261105100000_department_client_staff.sql`(각 상단에 되돌리기 SQL).

## 8. 운영 화주 사용처

운영 화주 = 운영 표 활성 ∩ 활성 연결. 공통 함수 `loadOperatingClientKeys` + `keepOperatingLinks`(`src/lib/masters/operating-clients.ts`). 운영 표는 1,000건씩 나눠 끝까지 읽는다(`selectAllPages`, `src/lib/supabase/paged-select.ts`, 상한 20,000건 도달 시 서버 경고). 운영 표를 읽지 못하면(마이그레이션 미적용 등) 조회 화면은 연결 기준 목록을 그대로 쓰고 서버 로그에 경고를 남긴다. 쓰기 경로인 부서 확정 자동 확정은 건너뛰고(fail-closed) 확정 메시지로 안내한다.

| 사용처 | 적용 |
| --- | --- |
| 헤더 화주 목록 `/api/header-filters`(RPC·호환 쿼리 모두) | 운영 화주만, 화주담당자 배정도 그 안에서만 |
| 화주자료 편집 화주 목록·기본 화주·화주담당자 배정 화주 | 운영 화주만 |
| 모바일 작성 화주 목록(부서 물동량·확정 현황 보드 포함) | 운영 화주만 |
| 부서자료 작성 현황 분모, 공휴일근무 화주 선택 | 운영 화주만 |
| 부서 확정 시 미작성 화주 자동 '특이사항 없음' 확정 | 운영 화주만 |
| 회의자료 취합현황 작성 대상(분모, 페이지·탭 API) | 운영 화주만 |
| 과거 화주자료·부서자료·회의자료 보고서 조회, 물동량 이력, 작성 완료 수(분자) | 제한 없음(이력 유지) |
| 화주자료 쓰기 DB 검사(`is_department_client`) | 변경 없음(활성 연결 기준) |

## 9. 검증 시나리오

- 관리자: 헤더 부서 변경 시 목록 전환, 타 부서 저장 가능
- 부서장·매니저: 소속 부서만 표시, URL `department_id` 위조 무시, 저장 가능
- 화주담당자: 메뉴 숨김, URL 직접 접근 시 `/notices?error=forbidden`, 서버 액션·RPC 거부
- 연결 없는 화주 ID로 운영 저장 → 거부, 운영 해제 화주 담당자 지정 → 거부
- 타 부서 사용자·비활성 사용자 담당자 지정 → 거부, 대표 미지정 시 첫 사용자 대표
- 운영 해제 후 화주자료·헤더·모바일 작성 목록에서 사라지고 과거 자료는 그대로 조회
- 현황관리에서 연결 해제 → 목록에서 사라짐, 재연결 → 이전 운영 여부 복원
- 모바일 폭에서 목록·팝업 겹침 없음
- 현황에서 가져오기: 확인창 취소 시 아무 변화 없음, 실행 후 기준 월·가져온 시각·화주별 현황 담당자 표시, 부서장(팀장) 미포함, 비중 1% 미만 미포함
- 다시 가져오기 → 그 부서 명단 전체 교체, 비중 자료 없는 부서 → 기존 명단 유지 안내
- 화주담당자·타 부서 부서장·매니저의 가져오기 → 서버 액션·RPC 거부
