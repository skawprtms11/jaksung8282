# 공지사항 메뉴 지침

## 1. 목적

`/notices`는 사업부 공지, 지시, 자료취합, 기타 안내를 전 직원에게 전달하고 댓글과 부서별 자료취합 완료 상태를 관리하는 메뉴다. 업무 보고 승인 흐름과는 분리되어 있지만 모든 활성 사용자의 공통 진입 화면이다.

## 2. 접근과 권한

| 기능 | 권한 |
| --- | --- |
| 목록·상세·댓글 조회 | 모든 활성 사용자 |
| 새 공지 등록 | `admin` |
| 공지 수정·삭제 | `admin` 또는 해당 공지 작성자 |
| 댓글·답글 등록 | 모든 활성 사용자 |
| 댓글 수정·삭제 | `admin` 또는 댓글 작성자 |
| 자료취합 완료 상태 변경 | 소속 부서가 있는 활성 사용자 |

UI 노출 권한과 `src/actions/notices.ts`의 서버 검사를 함께 유지한다. 비관리자 작성자의 공지 수정·삭제는 server action이 소유권을 검사한 뒤 제한적으로 관리자 클라이언트를 사용한다.

## 3. URL과 조회 상태

- `q`: 제목 부분 검색
- `type`: `general | important | urgent | system`
- `page`: 1부터 시작하는 페이지 번호, 페이지당 10건

목록은 `deleted_at is null`, `is_active = true`만 조회하고 고정 여부, 최신 등록일 순으로 정렬한다. 고정 공지는 일반 목록과 별도로 최신 5건을 조회해 상단에 표시한다. 댓글 수는 삭제되지 않은 댓글 count로 계산한다.

## 4. 화면 구조와 상호작용

1. 상단에서 게시구분과 제목을 검색한다.
2. 고정 공지가 있으면 `중요 게시글` 영역에 별도로 표시한다.
3. 표는 등록일, 게시구분, 제목, 비고, 조회수, 댓글 수, 관리 기능을 표시한다.
4. 제목 선택 시 상세 팝업을 열고 조회수를 즉시 로컬 증가시킨 뒤 `increment_notice_view` RPC를 비동기로 호출한다.
5. 상세 팝업을 처음 연 시점에만 댓글을 lazy load하며 같은 공지의 댓글은 화면 세션에서 재사용한다.
6. 댓글은 parent-child 구조로 답글을 구성한다.
7. 자료취합 공지는 별도 팝업에서 부서별 완료 여부, 확인자, 확인일을 표시한다.

## 5. 공지 데이터 형식

`notices.content`는 일반 문자열처럼 보이지만 `src/lib/notices/content.ts`가 관리하는 구조화 payload를 지원한다.

- 본문
- 비고
- 자료취합 대상 부서와 부서별 완료 상태
- 완료 확인자와 갱신 시각

내용을 읽거나 저장할 때 `parseNoticeContent`와 `serializeNoticeContent`를 사용한다. 기존 평문 공지가 계속 열려야 하므로 직접 `JSON.parse`하거나 새 형식으로 일괄 덮어쓰지 않는다.

공지 유형의 화면 의미:

- `general`: 공지사항
- `important`: 지시사항
- `urgent`: 자료취합
- `system`: 기타내용

## 6. 쓰기 흐름

### 공지 저장

1. `noticeSchema`로 제목, 유형, 내용, 고정 여부, 게시 기간, 사용 여부를 검증한다.
2. 신규는 관리자 여부를 검사한다.
3. 수정은 대상 공지의 작성자를 읽어 관리자 또는 작성자 여부를 확인한다.
4. 신규는 `created_by`, 수정은 `updated_by`를 기록한다.
5. 성공 후 `/notices`를 revalidate하고 팝업을 닫은 뒤 목록을 refresh한다.

### 공지 삭제

- `soft_delete_notices_atomic` RPC를 우선 사용한다.
- RPC가 아직 적용되지 않은 환경만 소유권을 다시 확인한 뒤 관리자 클라이언트 fallback을 사용한다.
- `deleted_at`, `deleted_by`, `is_active = false`를 기록하며 행을 hard delete하지 않는다.

### 댓글

- 저장 전 대상 공지의 활성 여부와 parent 댓글의 동일 공지 소속을 확인한다.
- 작성 시 사용자명과 부서명을 snapshot으로 저장한다.
- 삭제는 `deleted_at`, `deleted_by`를 기록한다.
- 화면은 댓글 저장·삭제 후 전체 refresh 대신 로컬 목록과 댓글 count를 갱신한다.

### 자료취합 상태

- `urgent` 공지만 처리한다.
- 현재 부서의 기존 상태를 구조화 본문에서 교체한다.
- 완료 해제 시 확인자와 확인일을 비운다.
- 한 공지의 본문 전체를 갱신하므로 동시 수정 시 다른 부서 상태를 잃지 않도록 현재 payload 병합 방식을 보존한다.

## 7. 데이터와 주요 코드

| 구분 | 위치 |
| --- | --- |
| 서버 페이지 | `src/app/(protected)/notices/page.tsx` |
| 레거시 상세 route | `src/app/(protected)/notices/[id]/page.tsx` |
| 주 화면·팝업·댓글 | `src/components/notices/NoticeBoard.tsx` |
| 서버 액션 | `src/actions/notices.ts` |
| 내용 직렬화 | `src/lib/notices/content.ts` |
| 입력 검증 | `noticeSchema`, `noticeCommentSchema` |
| 테이블 | `notices`, `notice_comments`, `departments` |
| RPC | `increment_notice_view`, `soft_delete_notices_atomic` |
| 관련 migration | `021_notice_comments.sql`, `028_notice_author_delete_rpc.sql` |

## 8. 변경 불변 조건

- 사이드바 진입은 배포 환경의 전체 route 프리페치와 Next.js 기본 링크 전환을 유지한다.
- 비활성 또는 soft delete 공지가 목록, 상세, 댓글 대상에 다시 나타나지 않아야 한다.
- 조회수 증가는 상세 열기를 막지 않는 비동기 부가 동작이어야 한다.
- 고정 공지 영역과 일반 목록의 같은 공지는 조회수, 댓글 수, 수정·삭제 상태가 함께 갱신되어야 한다.
- 댓글 lazy load와 로컬 갱신을 제거해 상세 열기마다 모든 댓글을 다시 조회하지 않는다.
- 자료취합 상태 변경이 공지 본문과 비고를 손상시키지 않아야 한다.

## 9. 검증 시나리오

- 유형·제목 검색과 빈 결과
- 고정 공지 5건 제한과 최신순
- 관리자 신규 등록, 작성자 수정·삭제, 타인 수정 차단
- 상세 조회수 증가와 댓글 최초 lazy load
- 댓글, 답글, 수정, soft delete, count 반영
- 자료취합 완료·해제 후 다른 부서 상태 보존
- 비활성 사용자와 소속 부서 없는 사용자의 쓰기 차단
