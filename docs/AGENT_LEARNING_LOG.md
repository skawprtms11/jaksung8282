# 에이전트 집단 학습 로그

> 모든 팀(부장·dev-team·감사팀·검수팀·consultant)이 공유하는 실수·교훈 기록.
> **세션 시작 시 필독.** 새 항목은 하단에 append (시간 역순 X — 추가 순서 보존).

---

## 📐 형식

```markdown
### YYYY-MM-DD — [팀명] 한 줄 제목

**상황**: 무엇을 하다가 발생했는지 1~2줄
**실수/오판**: 무엇이 잘못됐는지
**원인**: 왜 그렇게 됐는지 (구조적·인지적)
**교훈**: 다음에 어떻게 다르게 할 것인지
**파일**: 관련 파일:라인 (있으면)
```

---

## 📚 항목

<!-- 첫 항목은 init 스크립트가 자동으로 추가하거나, 첫 작업 후 부장이 append 한다. -->

### 2026-07-25 — [부장] 하네스 부장 시스템 도입

**상황**: 본 프로젝트에 하네스 부장 다중 에이전트 시스템 도입.
**원인**: 코드 작업이 단일 에이전트로는 검수가 약하고, 톡방 가시성 없이는 "어디서 막혔는지" 파악이 어려움.
**교훈**: 작업마다 `harness_messages` INSERT를 빠뜨리지 말 것. 모든 단계가 톡방에 보여야 대표님이 진행 파악 가능.
**파일**: `.claude/agents/*.md` · 톡방: `bujang chat`

### 2026-08-17 — [부장] grep 단독으로 죽은 코드 판정했다가 9건 오판

**상황**: 죽은 코드 정리 작업 1단계에서, 검수팀이 돌기 전에 부장이 `grep -rlw <심볼>`로 "참조 0건 후보" 45개를 사전 추출해 대표님께 보고.
**실수/오판**: 그중 최소 9건이 실제로는 살아있는 코드였음. `DepartmentForm` 등 `MasterForms.tsx` export 9개(내부 JSX 사용), `getMonday`(동일 파일 사용), Zod 스키마 6종(동일 파일 합성), sky-pup 9모듈(상대경로 import), `matchesDepartmentCommonSearch`(테스트만 사용).
**원인**: `grep -rl`이 반환하는 "심볼을 포함한 파일 목록"에서 정의 파일을 제외하면 참조 0으로 보이는데, 이는 **동일 파일 내 사용**을 통째로 놓치는 방식. 추가로 `@/` alias만 검색하면 **상대경로 import**를, 앱 코드만 보면 **테스트 참조**를, 정적 검색만 하면 **`next/dynamic`·Sidebar prewarm `import()`**를 놓침.
**교훈**: 심볼 사용 여부는 grep으로 단정하지 말 것. 최소 4중 확인 — ①동일 파일 내 사용 ②상대경로 import ③`tests/` 참조 ④동적 import. 더 확실한 방법은 컴파일러: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`가 미사용 import·변수·파라미터를 정확히 잡고, `--allowUnreachableCode false`가 도달 불가 분기를 잡음. 실제로 코드리뷰팀은 이 방식으로 45건을 10건까지 정확히 좁혔음.
**추가 교훈**: 문서(`docs/menus/*.md`)도 참조축이다. 검수팀조차 `DepartmentClientRegistration`을 "제거 가능"으로 오판했는데, 코드리뷰팀이 `department-master.md`에 호환 계약으로 등재된 것을 발견해 뒤집음.
**파일**: `src/components/masters/MasterForms.tsx` · `src/lib/dates/week.ts:33` · `src/lib/validations/common.ts` · `src/components/game/sky-pup/*`

### 2026-08-18 — [부장] `cd` 프리픽스 습관이 승인 프롬프트 67%를 유발

**상황**: 대표님이 "터미널에서 계속 승인요청을 한다"고 지적. 최근 세션 2건의 transcript에서 Bash 호출 147건을 전수 분석.
**실수/오판**: 부장이 거의 모든 Bash 호출을 `cd "/Users/seominho/Documents/New project 3" && <cmd>` 형태로 작성 — 147건 중 **99건(67%)**.
**원인**: ①복합명령 안의 `cd`는 그 자체로 승인 프롬프트를 유발. ②더 치명적으로, allowlist 매칭이 **명령 전체 문자열** 기준이라 `Bash(sqlite3 .harness/chat.db *)`가 `cd "…" && sqlite3 …`와 안 맞음. 대표님이 등록해둔 허용 규칙 30건이 통째로 헛돌았고, 톡방 INSERT 29건이 전부 매번 승인창을 띄웠음. Bash 도구는 작업 디렉터리가 호출 간 유지되므로 `cd`는 애초에 불필요했음.
**교훈**: `cd "<프로젝트 경로>" &&` 프리픽스 금지. 명령은 bare로 작성하고, 프로젝트 밖 파일은 절대경로 사용. `cd`는 **다른 저장소**로 옮길 때만, 그것도 `&&` 없이 단독 호출로. 일반화하면 — **allowlist를 늘리기 전에 명령 문자열이 기존 패턴과 매칭되는지부터 확인할 것.** 규칙이 부실한 게 아니라 규칙이 안 걸리고 있었음.
**파일**: `CLAUDE.md` (🚫 No `cd` prefix 절) · `.claude/settings.json` · 메모리 `no-cd-prefix-in-bash.md`

### 2026-08-19 — [부장] 물동량 EA 통일 작업에서 메뉴 문서 갱신 누락

**상황**: 화주자료 물동량을 EA 단위로만 등록하도록 코드·데이터를 수정해 PR #26으로 머지. 이후 대표님이 "메뉴별 md 문서가 제대로 관리되는지" 점검을 지시.
**실수/오판**: `docs/menus/README.md`의 계약("기능 계약이 바뀌면 코드와 같은 작업에서 해당 메뉴 문서를 갱신한다")을 어기고 문서 없이 코드만 머지. `client-reports.md`는 8종 단위 나열을, `mobile-app.md`는 "단위별로 집계"를 그대로 갖고 있었음. #23에서도 `user-management.md`(사번 규칙)와 `department-reports.md`(fail-closed)가 누락됨.
**원인**: 부장이 팀 디스패치 없이 직접 처리한 작업이라 doc-sync-team 게이트를 거치지 않았고, 검수 체크리스트에도 문서 대조 항목이 없었음. 팀을 거친 #20·#21은 문서가 함께 갱신된 것과 대조적.
**교훈**: 직접 처리하는 1인 작업일수록 문서 게이트를 스스로 대신해야 한다. 기능 계약이 바뀌는 커밋은 머지 전에 `docs/menus/README.md`의 공유 코드 표를 열어 영향 문서를 대조할 것. verifier 의뢰서에 "메뉴 문서 동기화 여부" 항목을 상시 포함.
**파일**: `docs/menus/client-reports.md:49,79` · `docs/menus/mobile-app.md:44` · `docs/menus/user-management.md` · `docs/menus/department-reports.md`

---

## 🎯 자주 반복되는 카테고리 (주의 영역)

이 카테고리에 해당하는 실수는 **재발 시 즉시 본 로그 + 해당 팀 에이전트 파일 둘 다 갱신**:

- DB 스키마 판단 — 마이그레이션 파일 vs prod 실태 불일치
- 줄글 보고 — 톡방에 마크다운 없이 한 줄 줄글 INSERT
- 톡방 INSERT 누락 — 작업 단계 진행했는데 기록 안 함
- 검수 누락 — verifier-team 거치지 않고 "완료" 보고
- 감사팀 누락 — 결제·DB·법적 문구 등 도메인 작업에 해당 감사팀 호출 안 함
