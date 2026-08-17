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

---

## 🎯 자주 반복되는 카테고리 (주의 영역)

이 카테고리에 해당하는 실수는 **재발 시 즉시 본 로그 + 해당 팀 에이전트 파일 둘 다 갱신**:

- DB 스키마 판단 — 마이그레이션 파일 vs prod 실태 불일치
- 줄글 보고 — 톡방에 마크다운 없이 한 줄 줄글 INSERT
- 톡방 INSERT 누락 — 작업 단계 진행했는데 기록 안 함
- 검수 누락 — verifier-team 거치지 않고 "완료" 보고
- 감사팀 누락 — 결제·DB·법적 문구 등 도메인 작업에 해당 감사팀 호출 안 함
