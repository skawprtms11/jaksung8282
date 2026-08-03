# TPL Weekly Materials System Guide

이 문서는 이 저장소에서 작업하는 Codex 에이전트가 가장 먼저 읽어야 하는 제품 및 시스템 지침이다. 저장소 전체에 적용한다.

## 1. Instruction Contract

- 이 파일은 제품 목적, 현재 시스템 구조, 업무 흐름, 권한, 데이터 계약, 변경 원칙의 기준 문서다.
- `CLAUDE.md`는 Claude Code의 역할 분담, 팀 호출, 보고 절차를 위한 운영 하네스다. 제품 동작이나 데이터 구조의 기준으로 사용하지 않는다.
- 플랫폼 지침과 사용자의 명시적 요청이 항상 우선한다. 하위 디렉터리에 더 구체적인 `AGENTS.md`가 생기면 해당 범위에서는 그 문서를 함께 따른다.
- 문서와 실행 코드가 충돌하면 추측하지 않는다. 관련 페이지, 서버 액션, 권한 함수, 생성된 DB 타입, 최신 migration을 함께 확인하고 현재 동작을 사용자에게 알린 뒤 문서를 갱신한다.
- 기능이나 업무 규칙을 변경하면 같은 작업에서 이 문서도 갱신한다. 단순 스타일 조정처럼 구조에 영향이 없는 변경은 생략할 수 있다.
- 현재 저장소에는 루트 `AGENTS.md`만 둔다. 메뉴별 규칙이 충분히 커질 때에만 해당 디렉터리에 범위가 좁은 `AGENTS.md`를 추가한다.

### Mandatory Menu References

메뉴 기능을 분석하거나 수정하기 전에는 루트 지침을 읽은 다음 해당 메뉴 문서를 반드시 읽는다. route뿐 아니라 아래 메뉴가 소유하는 component, server action, query, table/RPC를 변경하는 경우에도 동일하다.

| 작업 대상 | 필수 참조 문서 |
| --- | --- |
| 공지사항 `/notices` | `docs/menus/notices.md` |
| 회의자료 `/meeting-materials` | `docs/menus/meeting-materials.md` |
| 부서자료 `/department-reports` | `docs/menus/department-reports.md` |
| 화주자료 `/client-reports` | `docs/menus/client-reports.md` |
| 미니게임 `/mini-game` | `docs/menus/mini-game.md` |
| 부서마스터 `/admin/departments` | `docs/menus/department-master.md` |
| 센터마스터 `/admin/centers` | `docs/menus/center-master.md` |
| 화주마스터 `/admin/clients` | `docs/menus/client-master.md` |
| 사용자관리 `/admin/users` 및 가입·계정 흐름 | `docs/menus/user-management.md` |
| 모바일 앱 `/mobile` | `docs/menus/mobile-app.md`와 화주자료·부서자료 문서 |

공유 코드 변경은 영향받는 문서를 모두 읽는다.

- `src/actions/reports.ts`, 보고서 enum·검색·공유 팝업, 관련 RPC/RLS: 회의자료, 부서자료, 화주자료 문서를 함께 읽는다.
- `src/actions/masters.ts`, `src/components/masters/MasterForms.tsx`: 영향받는 모든 마스터 문서를 함께 읽는다.
- `Header.tsx`, `Sidebar.tsx`, `/api/header-filters`, 역할·기본 범위: 범위 또는 메뉴 노출이 달라지는 모든 메뉴 문서를 읽는다.
- DB table, enum, RLS, RPC처럼 여러 메뉴가 공유하는 계약은 `docs/menus/README.md`의 교차 참조도 확인한다.
- 코드 변경으로 목적, 기능, 권한, URL, 데이터, 상태, 검증 계약이 달라지면 같은 작업에서 해당 메뉴 문서를 갱신한다.

## 2. Product Purpose

이 시스템은 TPL사업부의 주간 운영자료를 화주 단위로 작성하고, 부서 단위로 검토·취합한 뒤, 회의자료로 조회하고 승인하기 위한 내부 업무시스템이다.

핵심 업무 흐름은 다음과 같다.

1. 부서, 화주, 사용자, 담당자 관계를 마스터에서 관리한다.
2. 화주담당자가 금주 실시사항, 차주 예정사항, 물동량을 주차별로 작성하고 확정한다.
3. 부서장 또는 매니저가 화주자료를 검토하고 부서 공통자료를 작성한다.
4. 부서장이 부서자료를 사업부로 확정 제출한다.
5. 관리자가 회의자료에서 전체 취합 현황을 보고 필요한 항목에 요청사항을 등록한다. 최종 승인·반려 도메인 로직은 존재하지만 현재 화면 연결 여부는 메뉴 문서를 확인한다.
6. 요청사항은 처리결과가 등록되고 종결될 때까지 대상 부서 화면에 주차와 관계없이 계속 노출된다.

공지, 자료취합 완료 현황, 센터·공실 데이터, 공휴일근무, 시설공사, 미니게임은 이 핵심 흐름을 보조한다.

## 3. Technology And Runtime

- Next.js App Router, React, TypeScript strict mode
- Tailwind CSS, lucide-react, Recharts
- Supabase Auth, Postgres, RLS, RPC, SSR cookie session
- Zod validation and server actions
- Vitest unit tests
- Netlify SSR deployment, Node.js 22
- Application timezone: `Asia/Seoul`

기본 명령은 다음과 같다.

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

필수 환경변수 이름은 `.env.example`을 기준으로 한다. 실제 값이나 service-role 키를 코드, 로그, 문서, 브라우저 번들에 넣지 않는다.

## 4. Repository Architecture

```text
src/app/(auth)                 로그인, 가입 요청, 비밀번호 재설정
src/app/(protected)            인증된 사용자의 서버 페이지와 공통 보호 레이아웃
src/app/api                    인증이 필요한 경량 조회 API
src/actions                    서버 액션과 쓰기 유스케이스
src/components/layout          사이드바, 헤더, 전역 범위 필터
src/components/mobile          모바일 전용 앱 셸, 화주자료, 설정 UI
src/components/reports         화주자료, 부서자료, 회의자료 UI
src/components/notices         공지 목록, 상세, 댓글, 자료취합 UI
src/components/masters         부서, 센터, 화주, 사용자 관리 UI
src/lib/auth                   현재 사용자, 권한, 기본 조회 범위
src/lib/dates                  서울 시간 기준 주차 계산
src/lib/reports                보고서 검색 및 직렬화 호환 로직
src/lib/supabase               브라우저, 서버 세션, 관리자, 외부 시스템 클라이언트
src/lib/validations            Zod 입력 계약
src/types                      앱 enum과 생성된 Supabase 타입
supabase/migrations            순서가 보존되는 DB 변경 이력
tests                          순수 로직과 권한 계약 단위 테스트
```

### Read Flow

- 보호 페이지는 기본적으로 Server Component다.
- `getCurrentUserProfile()`은 요청 내 React cache를 사용해 인증 프로필 중복 조회를 줄인다.
- 서버 페이지가 필요한 범위만 Supabase에서 조회해 Client Component에 직렬화 가능한 초기값으로 전달한다.
- 사용자가 주차, 부서, 화주, 탭, 검색조건을 바꾸면 URL search params가 조회 상태의 기준이 된다.
- 브라우저 전용 후속 조회가 필요할 때만 API route나 서버 액션을 사용한다.

### Write Flow

- 폼 또는 클라이언트 상태를 server action에 전달한다.
- server action에서 Zod 검증, 활성 사용자 확인, 역할과 대상 범위 확인을 다시 수행한다.
- 여러 테이블을 함께 바꾸는 보고서 저장·확정·취소·삭제는 원자적 Postgres RPC를 사용한다.
- 성공 후 필요한 화면만 갱신하거나 로컬 상태를 반영한다. 무조건적인 전체 새로고침을 추가하지 않는다.

## 5. Authentication, Scope, And Roles

보호 레이아웃은 프로필이 없거나 비활성인 사용자를 로그인 화면으로 보낸다. 브라우저 Supabase 클라이언트는 anon key와 사용자 세션만 사용한다. `SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용한다.

| 역할 | 기본 범위와 책임 |
| --- | --- |
| `admin` | 전체 부서 조회, 마스터 관리, 회의자료 조회, 화주자료 검토, 부서자료 최종 승인·반려 |
| `department_head` | 소속 부서 조회, 화주자료 작성·검토, 부서자료 작성·확정, 회의자료 조회, 소속 부서 가입요청 처리 |
| `manager` | 소속 부서 조회, 화주자료 작성·검토, 부서자료 초안 작성, 회의자료 조회, 소속 부서 가입요청 처리 |
| `client_owner` | 소속 부서 조회, 자신에게 활성 배정된 화주자료 작성, 부서자료 조회 |

권한 판단의 앱 기준은 `src/lib/auth/permissions.ts`다. DB 기준은 RLS helper와 RPC 내부 검증이다. UI에서 버튼을 숨기는 것만으로 권한을 구현하지 않는다.

중요 범위 규칙:

- 관리자는 전체 범위를 선택할 수 있지만, 무제한 쿼리가 무거운 화면은 코드가 정한 기본 부서를 먼저 사용한다.
- 비관리자는 자신의 `profile.department_id` 밖의 부서를 조회하거나 수정할 수 없다.
- 화주담당자는 `client_assignments`의 활성 배정과 부서가 모두 일치해야 한다.
- 부서와 화주의 현재 관계는 `department_client_links`가 기준이다. nullable인 `clients.department_id`만으로 관계를 판단하지 않는다.
- 가입 요청은 비활성 `client_owner` 프로필로 생성된다. 관리자 또는 같은 부서의 부서장·매니저 승인 후 활성화된다.

### Auth And Global Shell

- `/login`은 이메일과 비밀번호로 로그인한 뒤 활성 `profiles` 행을 확인한다. 비활성 계정은 즉시 로그아웃한다.
- 사용자 가입 요청은 관리자 클라이언트로 Auth 사용자와 비활성 `client_owner` 프로필을 만든 뒤 `user_registration_requests`에 `pending` 행을 저장한다. 중간 실패 시 생성한 Auth 사용자를 정리한다.
- `/reset-password`는 `NEXT_PUBLIC_SITE_URL` 기준 복구 링크를 발송하고, 유효한 복구 세션에서 8자 이상의 새 비밀번호를 설정한 뒤 로그아웃한다.
- `src/app/(protected)/layout.tsx`는 환경 설정, 프로필, 활성상태를 확인하고 `ProtectedShell`을 렌더링한다. 이 검사를 개별 화면에서 우회하지 않는다.
- 보호 레이아웃은 인증 쿠키 접근으로 요청 단위 동적 렌더링을 유지한다. 하위 메뉴와 탭의 세션 내 프리페치 결과까지 무효화하는 전역 `force-dynamic` 강제 설정을 다시 추가하지 않는다.
- 헤더의 부서·화주 필터는 회의자료, 부서자료, 화주자료에서만 동작한다. 옵션은 `/api/header-filters`가 역할 범위에 맞게 반환한다.
- 화주자료의 화주담당자 옵션은 활성 `client_assignments`로 제한한다. 부서자료와 화주자료는 유효한 기본 부서·화주를 선택하며, 회의자료의 전체 범위 가능 여부는 탭별로 다르다.
- 사이드바 메뉴 노출은 `permissions.ts`를 사용한다. URL 직접 접근도 각 page와 server action에서 다시 차단한다.

## 6. Reporting Calendar

- 한 주는 월요일부터 일요일까지다.
- 주차의 보고 연월은 해당 주 목요일이 속한 연월이다.
- 월의 주차 번호도 목요일 귀속 월을 기준으로 계산한다.
- 날짜 계산은 반드시 `src/lib/dates/week.ts`의 `getCurrentWeekOption`, `getWeekOptions`, `resolveWeekFromSelection` 등을 재사용한다.
- 서버와 브라우저에서 서로 다른 주차 계산을 새로 구현하지 않는다.

## 7. Menu Contracts

### `/notices` - 공지사항

- 활성 사용자가 사업부 공지와 상세 내용을 조회한다.
- 유형은 일반, 중요, 자료취합, 기타이며 DB 값은 `general`, `important`, `urgent`, `system`이다.
- 새 공지 등록은 관리자만 가능하다. 기존 글 수정·삭제는 현재 서버 액션 기준 관리자 또는 작성자에게 허용된다.
- 삭제는 `deleted_at`과 `deleted_by`를 사용하는 soft delete다.
- 댓글과 답글은 `notice_comments`에 저장하며 작성자 또는 관리자가 수정·삭제한다.
- 자료취합 공지는 본문 안의 구조화 데이터로 부서별 완료 상태를 보존한다. `parseNoticeContent`와 `serializeNoticeContent`를 사용한다.

### `/client-reports` - 화주자료

- 주차, 부서, 화주 범위에서 금주 실시사항, 차주 예정사항, 물동량을 작성한다.
- 한 화주에는 한 주차당 활성 보고서가 하나만 존재해야 한다.
- 업무 항목은 `weekly_client_report_items`, 물동량은 `weekly_volumes`, 상위 상태는 `weekly_client_reports`에 저장한다.
- 화주담당자는 배정된 화주만 작성한다. 관리자, 부서장, 매니저는 허용된 부서 범위에서 작성·검토한다.
- 기본 저장은 `draft`, 확정은 `submitted`다. `approved` 상태는 확정취소 또는 권한 있는 상태 전이 전까지 수정하지 않는다.
- 일반 검색과 상세검색은 일치한 항목만 화면에 남긴다. 공통 검색 구현은 `src/lib/reports/client-report-search.ts`를 재사용한다.
- 검색 기간이 없으면 선택 주차만 조회하고, 기간 검색 시 선택 주차를 포함하도록 조회 범위를 확장한다.
- `/mobile`의 화주자료 화면도 같은 서버 액션, 상태 전이, 화주 배정 범위를 사용한다.

### `/department-reports` - 부서자료

- 탭은 공통사항, 물동량, 시설공사, 공실, 공휴일근무다.
- 공통사항은 부서 공통 항목 작성, 화주별 자료 검토, 중요도 요약, 작성 현황을 함께 제공한다.
- 공통사항 검색은 부서 공통 항목과 화주별 항목을 모두 대상으로 하며 일치한 데이터만 표시한다.
- `사업부 요청사항`은 관리자 등이 회의자료에서 등록한 미종결 요청을 주차와 관계없이 표시한다. 제목 상세는 회의자료와 같은 팝업 계약을 사용한다.
- 물동량은 화주자료의 `weekly_volumes`를 부서/주차별로 집계하는 조회 화면이다. 입고는 `inbound`, 출고는 `outbound`, 합계는 둘의 합이다.
- 공통사항, 시설공사, 공휴일근무는 `department_weekly_contents`에 저장한다. 공실은 `department_vacancy_records`에 별도로 저장한다.
- 시설공사와 공휴일근무, 다건 공통사항은 버전이 있는 JSON 문자열이다. 기존 평문 데이터 파서 호환을 유지한다.
- 매니저는 초안을 작성할 수 있지만 사업부 확정 제출은 관리자와 부서장만 할 수 있다.
- `/mobile`에서는 공통사항, 공휴일근무, 시설공사만 노출하고 동일한 권한과 저장 계약을 유지한다.

### `/mobile` - 모바일 앱

- 인증된 사용자의 화주자료 작성, 제한된 부서자료 작성, 계정·관리 화주 확인을 모바일 하단 메뉴로 제공한다.
- 자세한 레이아웃, 권한, 데이터 재사용 계약은 `docs/menus/mobile-app.md`를 따른다.

### `/meeting-materials` - 회의자료

- 관리자, 부서장, 매니저만 접근한다.
- 탭은 취합현황, 회의자료, 물동량, 공휴일근무, 시설공사다.
- 취합현황은 부서별 작성 상태, 매우높음/높음 항목, 종결되지 않은 요청사항을 보여준다.
- 회의자료는 선택 주차의 부서 공통사항과 화주별 항목을 한 범위에서 조회하고 검색한다.
- 항목 상세 팝업에서 요청사항 등록, 처리결과 등록, 종결 흐름을 수행한다.
- 물동량은 선택 월의 주차별 입고·출고·합계 추이와 부서별 현황, 전월 대비 증감 및 증감률을 표시한다.
- 공휴일근무와 시설공사는 부서자료의 해당 section을 읽어 회의용으로 집계한다.
- 데이터는 우선 `get_meeting_materials_payload` RPC로 현재 탭에 필요한 payload만 가져오며, 호환을 위한 기존 쿼리 fallback이 있다.
- 새 탭을 추가할 때 RPC payload, fallback 쿼리, 타입 가드, loading label, 탭 네비게이션을 함께 수정한다.

### `/admin/departments` - 부서마스터

- 관리자, 부서장, 매니저가 조회할 수 있고 비관리자는 소속 부서만 본다.
- 부서 자체 생성·수정·미사용 처리는 관리자만 한다.
- 부서별 화주 등록과 화주담당자 배정은 관리자 또는 해당 부서의 부서장·매니저가 수행한다.
- 부서-화주 연결과 담당자 배정은 별도 관계이며 둘을 동시에 유지해야 한다.

### `/admin/centers` - 센터마스터

- 관리자, 부서장, 매니저가 조회한다.
- 현재 구현은 Firestore가 아니다. 관리자가 `LABOR_SUPABASE_URL`의 `centers` 테이블에서 활성 센터를 수동 불러와 `center_masters`에 upsert한다.
- 외부 연결에는 `LABOR_SUPABASE_SERVICE_ROLE_KEY`, 내부 저장에는 서버의 Supabase 관리자 클라이언트를 사용한다.
- 센터 데이터는 부서자료의 공실 현황 센터 선택 기준이 된다.

### `/admin/clients` - 화주마스터

- 관리자만 접근해 화주를 등록, 수정, 일괄 등록, 미사용 처리한다.
- 화주를 부서에 배치하고 담당자를 지정하는 실제 운영 흐름은 부서마스터의 화주등록 화면을 사용한다.
- 일괄 등록은 `bulk_import_clients_atomic` RPC로 중복과 부분 실패를 제어한다.

### `/admin/users` - 사용자관리

- 관리자, 부서장, 매니저가 화면에 접근한다.
- 현재 화면에서 관리자는 역할·부서·활성상태 변경과 미사용 처리를 한다. 사용자 생성·초대 form/action은 정의되어 있지만 현재 route에는 장착되어 있지 않다.
- 부서장과 매니저는 소속 부서의 대기 중 가입 요청만 승인·반려한다.
- Auth 사용자와 `profiles` 행의 ID는 동일해야 한다.

### `/mini-game` - 미니게임

- 모든 활성 사용자가 이용할 수 있다.
- 점수 저장은 Zod 검증과 본인 세션을 거쳐 `mini_game_scores`에 기록한다.
- 랭킹 API는 상위 20건을 점수, 생존시간, 등록시간 순으로 조회한다.
- 게임은 업무 승인·보고 흐름과 결합하지 않는다.

## 8. State Machines And Cross-Menu Flows

### Client Report

```text
draft -> submitted -> approved
                   -> rejected -> draft | submitted
approved -> submitted | draft   (권한 있는 재오픈)
submitted -> draft              (확정 후 3일 이내 확정취소)
```

- 승인과 반려는 관리자, 부서장, 매니저가 수행한다.
- 반려에는 사유가 필요하다.
- 확정, 확정취소, 승인, 반려는 `approval_history`에 기록한다.

### Department Submission

```text
draft -> submitted_to_division -> division_approved
                               -> division_rejected -> draft | submitted_to_division
division_approved -> draft      (관리자 재오픈)
submitted_to_division -> draft  (확정 후 3일 이내 확정취소)
```

- 제출은 관리자 또는 부서장만 가능하다.
- 최종 승인과 반려는 관리자만 가능하고 반려에는 사유가 필요하다.
- 저장 RPC는 내용 저장과 제출 상태 전이를 하나의 트랜잭션 안에서 처리한다.

### Report Item Request

```text
요청 등록 -> 요청 수정/삭제 가능 -> 처리결과 등록 -> 종결
```

- 대상은 화주 항목(`client_item`) 또는 부서 공통 항목(`department_common`)이다.
- `target_key`가 논리적 대상을 식별한다. 부서 공통 항목은 submission, period, sort order를 함께 사용한다.
- 미종결 요청은 주차가 바뀌어도 부서자료와 회의자료 취합현황에 계속 나타난다.
- 종결 전에는 요청 등록자 또는 관리자만 요청을 수정·삭제한다.
- 처리결과는 접근 가능한 사용자가 등록하며, 종결은 관리자, 요청 등록자 또는 결과 등록자가 수행한다.
- 처리결과가 없는 요청은 종결할 수 없다. 종결된 요청은 수정·삭제하지 않는다.

## 9. Data Model Ownership

| 영역 | 기준 테이블 |
| --- | --- |
| 조직과 사용자 | `departments`, `profiles`, `user_registration_requests` |
| 화주 관계 | `clients`, `department_client_links`, `client_assignments` |
| 업무 분류 | `work_categories` |
| 화주 주간자료 | `weekly_client_reports`, `weekly_client_report_items`, `weekly_volumes` |
| 부서 주간자료 | `department_weekly_submissions`, `department_weekly_contents` |
| 부서 공실 | `center_masters`, `department_vacancy_records` |
| 승인 이력 | `approval_history` |
| 요청사항 | `weekly_report_item_requests` |
| 공지 | `notices`, `notice_comments` |
| 게임 | `mini_game_scores` |

데이터 변경 시 지켜야 할 불변 조건:

- 보고서와 공지의 사용자 삭제 기능은 기본적으로 soft delete다. 기존 조건에 맞춰 모든 조회에 `deleted_at is null`을 유지한다.
- 한 화주/주차 보고서와 한 부서/주차 제출은 중복 생성하지 않는다. 원자적 RPC와 DB 잠금을 우회하지 않는다.
- 자식 업무항목과 물동량은 부모 보고서의 권한을 상속한다.
- `department_weekly_contents`는 section별 한 행을 유지한다.
- 업무 항목 기간은 `current`와 `next`, 중요도는 `very_high`, `high`, `medium`, `low`를 사용한다.
- 물동량 타입 enum에는 여러 값이 있지만 현재 핵심 집계는 `inbound`와 `outbound`다. 화면의 합계는 저장된 별도 합계 행이 아니라 두 값의 합으로 계산한다.
- JSON 문자열 payload 형식을 변경할 때 버전을 올리고 기존 평문 및 이전 버전 파싱을 유지한다.
- `src/types/database.ts`는 앱이 기대하는 현재 DB 계약이다. schema 변경 시 migration과 이 타입을 함께 갱신한다.

## 10. Supabase And Security Rules

- 일반 조회와 쓰기는 `createSupabaseServerClient()`를 우선 사용해 사용자 세션과 RLS를 적용한다.
- `createSupabaseAdminClient()`는 서버 전용이다. 전체 범위 조회, Auth 관리, 외부 동기화, 또는 앱에서 대상을 먼저 검증한 제한적 RLS 보완에만 사용한다.
- 관리자 클라이언트를 사용하는 server action도 활성 사용자, 역할, 부서, 대상 소유권을 먼저 검증해야 한다.
- 속도 개선을 이유로 RLS를 제거하거나 service-role 데이터를 브라우저에 노출하지 않는다. 인덱스, 단순화된 permission helper, 범위가 제한된 RPC로 해결한다.
- `security definer` 함수는 `auth.uid()`, 활성 프로필, 역할, 부서/화주 범위를 내부에서 다시 검사하고 `search_path`와 execute grant를 명시한다.
- 독립적인 여러 쓰기를 클라이언트에서 순서대로 실행하지 않는다. 부분 성공이 위험하면 RPC 트랜잭션으로 만든다.
- 모든 외부 입력은 `src/lib/validations/common.ts` 또는 목적별 Zod schema를 통과시킨다.
- SQL을 수정할 때 기존 migration을 다시 쓰지 말고 새 migration을 추가한다. 로컬 확인 후 `supabase db push` 대상이 되는지 명확히 보고한다.

## 11. Performance Contracts

이 앱은 데이터 양보다 RLS가 걸린 관계 조회, 큰 Server Component payload, 탭에 필요 없는 동시 쿼리에서 느려질 가능성이 크다. 다음 최적화를 보존한다.

- 회의자료는 활성 탭에 필요한 데이터만 조회한다.
- 회의자료의 기본 경로는 `get_meeting_materials_payload` RPC이고, fallback은 migration 미적용 환경을 위한 호환 경로다.
- 서로 독립적인 서버 조회는 `Promise.all`로 병렬 실행한다.
- 목록은 필요한 컬럼만 select하고 현재 상수 limit와 indexed predicate를 유지한다.
- 루프 안에서 관계별 쿼리를 추가하지 않는다. join, 집계 RPC, 한 번의 batch 조회를 사용한다.
- 헤더 필터는 `/api/header-filters` RPC/호환 쿼리와 sessionStorage 10분 캐시를 사용한다.
- 사이드바는 idle 시 주요 모듈을 prewarm하고 경로를 순차 prefetch한다. 메뉴 클릭의 pending 피드백을 유지한다.
- 무거운 탭 컴포넌트의 dynamic import와 Suspense 경계를 유지한다.
- 검색과 탭 전환은 URL 상태를 보존하며 불필요한 `router.refresh()`나 전체 페이지 remount를 추가하지 않는다.
- 저장은 원자적 RPC 한 번을 우선하고 성공한 결과를 로컬 상태에 반영한다.

성능 변경은 기능 보존과 함께 검증한다.

1. 같은 사용자, 같은 URL, 같은 데이터 범위에서 변경 전 기준을 측정한다.
2. 메뉴 클릭부터 새 화면 안정화, 회의자료 탭 클릭부터 내용 표시, 저장 클릭부터 성공 메시지까지를 각각 측정한다.
3. 브라우저 network에서 요청 수, 가장 느린 RSC/API/RPC, 전송 크기를 기록한다.
4. 변경 후 같은 조건으로 최소 3회 반복해 중앙값을 비교한다.
5. 권한별 데이터 범위, 탭 내용, 검색, 저장, 승인 상태가 동일한지 함께 확인한다.

## 12. UI And Interaction Rules

- 업무 화면의 현재 한국어 문구, 정보 밀도, 표 중심 구성, 색상 체계를 존중한다.
- 기능 요청에 포함되지 않은 디자인이나 문구를 임의로 바꾸지 않는다.
- 보고서 탭은 `src/components/reports/report-tab-styles.ts`의 공유 스타일을 우선 사용한다.
- 버튼 아이콘은 설치된 lucide-react 아이콘을 사용하고, 아이콘 전용 버튼에는 접근 가능한 label/title을 둔다.
- 고정 형식 표와 탭은 안정적인 높이와 열 너비를 사용해 로딩, 선택, 긴 텍스트로 레이아웃이 이동하지 않게 한다.
- 검색은 빠른 검색, 초기화, 상세검색의 기존 위치와 URL param 계약을 유지한다.
- 검색 결과 화면에서는 일치한 항목만 표시하고, 초기화 시 선택한 부서·화주·주차·탭은 유지한 채 검색조건만 제거한다.
- 공통 항목 상세와 요청사항 상세는 이미 공유되는 `MeetingItemDetailDialog` 계약을 우선 재사용한다.

## 13. Change Playbook

작업을 시작할 때:

1. 대상 route page와 렌더링되는 client component를 함께 읽는다.
2. 연결된 server action, Zod schema, permission helper를 찾는다.
3. 사용하는 테이블을 `src/types/database.ts`에서 확인하고 관련 최신 migration을 읽는다.
4. URL params, 상태 전이, soft delete, 3일 확정취소 제한에 영향이 있는지 확인한다.
5. 이미 dirty인 파일의 사용자 변경을 보존하고 요청 범위 밖 코드를 되돌리지 않는다.

DB 변경이 필요할 때:

1. 새 순번 또는 timestamp migration을 추가한다.
2. RLS, index, grant, 기존 데이터 호환, rollback 영향까지 검토한다.
3. `src/types/database.ts`와 호출부를 함께 갱신한다.
4. 사용자가 실행할 `supabase db push` 또는 SQL 적용 필요 여부를 결과에 명시한다.

검색을 변경할 때:

- 세 메뉴의 공통 필터 의미가 갈라지지 않도록 `client-report-search.ts`를 먼저 확장한다.
- 보고서 단위가 아니라 일치한 개별 항목만 남기는 현재 동작을 보존한다.
- 부서 공통사항의 JSON/평문 호환 파서를 거쳐 검색한다.

보고/승인 기능을 변경할 때:

- UI 가능 여부, server action 검사, RPC/RLS 검사가 같은 규칙을 표현하는지 확인한다.
- 상태 전이와 이력 저장을 분리하지 않는다.
- 취소 제한은 UI 시간과 DB `now()` 모두에서 검사하되 DB를 최종 기준으로 둔다.

## 14. Verification Standard

변경 범위에 맞춰 아래 순서로 검증한다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

- 작은 순수 로직 변경은 관련 Vitest부터 실행한 뒤 전체 테스트로 넓힌다.
- UI 변경은 데스크톱과 모바일에서 실제 보호 경로를 열어 overflow, 겹침, loading, empty, error, disabled 상태를 확인한다.
- 보고서 변경은 최소한 저장, 주차 변경, 검색/초기화, 확정/취소, 승인/반려 권한을 확인한다.
- DB 변경은 migration 적용 여부, RLS 적용 사용자와 관리자 동작, 중복/부분 실패를 확인한다.
- 성능 작업은 개선 전후 수치와 테스트한 URL/역할/데이터 범위를 결과에 남긴다.
- 실행하지 못한 검증은 완료한 것처럼 말하지 않고 이유와 남은 위험을 보고한다.

## 15. Primary Source Map

- 제품 목적과 전체 흐름: 이 `AGENTS.md`
- 팀 역할 분담과 Claude 보고 하네스: `CLAUDE.md`, `.claude/agents/*`
- 앱 역할과 상태 전이: `src/lib/auth/permissions.ts`, `src/types/enums.ts`
- 주차 계산: `src/lib/dates/week.ts`
- 검색 의미와 공통사항 호환 파싱: `src/lib/reports/client-report-search.ts`
- 입력 계약: `src/lib/validations/common.ts`
- 앱 DB 계약: `src/types/database.ts`
- 실제 DB 변경 이력: `supabase/migrations/*`
- 조회/저장 유스케이스: `src/app/(protected)/*/page.tsx`, `src/actions/*`
- 배포와 환경: `README.md`, `.env.example`, `netlify.toml`

새 작업에서 어느 문서를 따라야 할지 애매하면 이 파일로 제품 경계를 잡고, 위 source map의 실행 코드를 확인한 후 수정한다.
