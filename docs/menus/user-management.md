# 사용자관리 메뉴 지침

## 1. 목적

`/admin/users`는 Supabase Auth 계정과 앱 `profiles`를 연결하고 사용자 역할, 소속 부서, 활성상태를 관리하며 신규 가입 요청을 승인·반려하는 메뉴다.

## 2. 접근과 권한

| 기능 | `admin` | `department_head` | `manager` |
| --- | --- | --- | --- |
| 사용자 목록 | 전체 | 소속 부서 | 소속 부서 |
| 가입 요청 | 전체 | 소속 부서 | 소속 부서 |
| 가입 승인·반려 | 가능 | 소속 부서만 | 소속 부서만 |
| 사용자 생성·초대·수정·미사용 | 가능 | 불가 | 불가 |
| 비밀번호 초기화 | 가능 | 불가 | 불가 |

`client_owner`는 접근할 수 없다. 페이지 데이터는 일반 profile RLS로 조회하기 어려운 관계를 포함하므로 서버 관리자 클라이언트를 사용하지만, `departmentFilter`로 비관리자 범위를 제한한다.

## 3. URL과 화면 구조

- `q`: 성함 부분 검색
- `department_id`: 부서 필터

화면 영역:

1. 대기 중 사용자등록 요청, 최대 100건
2. 이름·부서 조회 조건
3. 사용자 목록, 최대 200건
4. 관리자 전용 수정·미사용 동작

현재 화면에는 신규 사용자 생성·초대 버튼이 없다. `UserForm`과 `saveUserAction`의 신규 생성·초대 분기는 정의되어 있지만 route에서 mount되지 않는다.

목록 필드:

- 사번
- 성함
- 이메일
- 부서
- 관리권한
- 사용여부
- 비밀번호 초기화(관리자 전용)
- 최종 확인일

## 4. 신규 가입 요청 흐름

가입 요청은 `/login`의 가입 기능과 `requestUserRegistrationAction`이 시작한다.

1. 이메일, 8자 이상 비밀번호와 확인, 사번, 성명, 활성 부서를 검증한다. 사번은 `employeeNoSchema`(`src/lib/validations/common.ts`)로 영문·숫자·하이픈(`[A-Za-z0-9-]`)만 허용한다. 이 제약은 인증 전 service-role 경로에서 PostgREST 필터 메타문자가 섞여 들어가는 것을 막기 위한 것이며, 가입 요청과 관리자 사용자 등록(`userSchema`) 양쪽에 적용된다.
2. 같은 이메일 또는 사번의 활성 profile과 pending 요청이 없는지 이메일·사번 컬럼별 개별 조회로 확인한다(`requestUserRegistrationAction`). 과거의 `.or()` 단일 쿼리는 검색어 보간으로 우회될 수 있어 제거했다.
3. Supabase Admin Auth로 email-confirmed 사용자를 만든다.
4. 같은 Auth ID로 `app_role = client_owner`, `is_active = false` profile을 upsert한다.
5. `user_registration_requests`에 `pending` 행을 저장한다.
6. profile 또는 요청 저장 실패 시 새 Auth 사용자를 삭제해 불완전 계정을 정리한다.

승인:

- 요청이 아직 `pending`인지 확인한다.
- 관리자 또는 같은 부서의 부서장·매니저인지 검사한다.
- 연결 profile을 활성화하고 대기 메모를 제거한다.
- 요청을 `approved`로 바꾸고 처리자·처리일·의견을 기록한다.

반려:

- 연결 profile은 비활성 상태로 유지하고 반려 메모를 기록한다.
- 요청을 `rejected`로 바꾸고 처리 이력을 기록한다.
- Auth 사용자를 삭제하지 않는다.

## 5. 관리자 사용자 관리

### 생성·초대

- 아래는 현재 화면 미장착 상태인 도메인 지원 로직이다.
- 이메일, 사번, 성명, 선택 부서, 역할, 비고, 활성상태를 `userSchema`로 검증한다.
- 새 사용자는 선택값에 따라 `inviteUserByEmail` 또는 관리자 `createUser`를 사용한다.
- 반환된 Auth ID와 같은 ID로 `profiles`를 upsert한다.
- 기존 사용자 수정은 새 Auth 사용자를 만들지 않고 profile만 갱신한다.

역할:

- `admin`
- `department_head`
- `manager`
- `client_owner`

역할이나 부서를 변경하면 기존 `client_assignments`가 자동 정리되지 않는다. `client_owner` 배정 유효성에 영향을 주는 변경은 부서마스터 담당자 배정도 확인한다.

### 미사용

- 선택 사용자의 `profiles.is_active = false`로 처리한다.
- 현재 로그인 사용자는 자기 자신을 미사용 처리할 수 없다.
- Auth 사용자를 hard delete하거나 세션을 직접 폐기하지 않는다. 보호 화면은 다음 프로필 검사 시 비활성 사용자를 차단한다.

### 비밀번호 초기화

- 관리자만 사용자 목록 행의 초기화 버튼을 사용할 수 있다.
- 확인 팝업 승인 후 대상 profile의 사번을 서버에서 조회하고 Supabase Auth Admin API로 같은 ID의 Auth 사용자 비밀번호를 변경한다.
- 초기 비밀번호는 등록된 사번과 동일하다. Supabase의 최소 6자리 정책 때문에 사번이 6자리 미만이면 뒤에 `0`을 추가해 6자리로 만들고, 확인 팝업에 해당 계정의 실제 초기 비밀번호를 안내한다.
- 브라우저 상태, 응답, 로그 또는 `profiles` 테이블에 평문 비밀번호를 저장하지 않는다.
- 사번이 비어 있거나 다른 Supabase 비밀번호 정책을 충족하지 못하거나 Auth 사용자가 연결되지 않은 경우 변경하지 않고 오류를 표시한다.

## 6. 데이터와 주요 코드

| 구분 | 위치 |
| --- | --- |
| 서버 페이지 | `src/app/(protected)/admin/users/page.tsx` |
| 화면 | `UserMasterControls`, `UserEditDialog` in `MasterForms.tsx` |
| 가입 요청 | `requestUserRegistrationAction` in `src/actions/auth.ts` |
| 사용자 CRUD·승인 | `src/actions/masters.ts` |
| 현재 사용자 | `src/lib/auth/current-user.ts` |
| 권한 | `src/lib/auth/permissions.ts` |
| 테이블 | `profiles`, `user_registration_requests`, `departments` |
| 외부 시스템 | Supabase Auth Admin API |
| migration | `014_user_registration_requests.sql` |

Auth Admin 기능에는 서버의 `SUPABASE_SERVICE_ROLE_KEY`가 필요하다. 키를 브라우저 컴포넌트에 전달하지 않는다.

## 7. 불변 조건

- `auth.users.id`와 `profiles.id`는 동일해야 한다.
- 활성 profile이 없는 사용자는 보호 화면을 사용할 수 없어야 한다.
- 비관리자 승인자는 다른 부서 요청을 처리할 수 없어야 한다.
- 이메일과 사번 중복 검사를 가입 요청과 관리자 생성 모두에서 일관되게 처리한다.
- 인증 전(가입 요청) 경로를 포함해 사용자 입력값을 PostgREST 필터 문자열에 직접 보간하지 않는다. 사번은 `employeeNoSchema`로 문자셋을 제한하고, 중복 검사는 컬럼별 `.eq()` 쿼리로 분리한다.
- 역할 이름을 바꾸면 enum, UI label, permission helper, RLS/RPC, 테스트를 함께 수정한다.
- 사용자 미사용이 과거 작성자 ID, 승인 이력, 댓글 snapshot을 삭제하지 않아야 한다.
- 관리자 클라이언트 조회에 부서 범위 조건을 빼지 않는다.

## 8. 교차 메뉴 영향과 검증

- 역할·부서 변경은 사이드바 메뉴, 헤더 범위, 회의자료 접근, 보고서 쓰기, 마스터 접근에 영향을 준다.
- `client_owner` 활성화 후에는 부서마스터에서 화주담당자 배정이 필요하다.

필수 시나리오:

- 역할별 목록과 가입 요청 부서 범위
- 신규 가입 요청 중복, 부분 실패 정리, 비활성 로그인 차단
- 같은 부서 부서장·매니저 승인과 다른 부서 위조 차단
- 기존 사용자 수정·미사용, 그리고 신규 생성·초대 UI를 연결하는 경우 Auth/profile 동시 처리
- 역할·부서·활성상태 수정 후 메뉴·헤더 반영
- 자기 자신 미사용 차단과 타 사용자 다건 미사용
- 서비스 역할 키 누락 오류
