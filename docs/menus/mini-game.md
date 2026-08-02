# 미니게임 메뉴 지침

## 1. 목적

`/mini-game`은 활성 사용자가 업무 시스템 안에서 짧게 이용하는 `흰둥이의 산책` 캔버스 게임과 점수 랭킹 메뉴다. 보고서, 승인, 권한 마스터와 업무 데이터 결합을 만들지 않는다.

## 2. 접근과 데이터 범위

- 모든 활성 사용자가 접근한다.
- 페이지는 현재 사용자 이름만 초기 props로 전달하고 랭킹은 브라우저에서 별도 API로 불러온다.
- 점수 저장은 현재 로그인 사용자의 ID만 사용한다.
- 전체 사용자의 상위 점수 조회는 인증 확인 후 서버 관리자 클라이언트가 수행한다.

## 3. 게임 상태와 조작

상태:

- `idle`
- `running`
- `gameover`

조작:

- 위 이동: `ArrowUp` 또는 `W`
- 아래 이동: `ArrowDown` 또는 `S`
- 시작: `Space` 또는 시작 버튼
- 3개 lane 안에서만 이동

캔버스 기준 크기는 900x540이다. responsive 표시를 변경해도 내부 좌표계, 충돌 영역, canvas pixel 렌더링이 일치해야 한다.

## 4. 게임 규칙

- entity는 `bone`, `poop`, `snack` 세 종류다.
- bone 또는 poop과 충돌하면 즉시 종료한다.
- snack과 충돌하면 6.5초 동안 장애물 이동속도가 절반이 되고 점수 증가량이 2배가 된다.
- 기본 점수는 경과시간에 따라 초당 약 12점 증가한다.
- 레벨은 12초마다 1씩 오른다.
- 레벨이 오르면 entity 이동속도가 증가하고 spawn 간격은 최소 0.42초까지 줄어든다.
- 게임 loop의 delta는 최대 0.034초로 제한해 긴 frame 후 위치 점프를 줄인다.
- HUD React state는 약 90ms 간격으로 갱신하고 canvas는 `requestAnimationFrame`마다 그린다.

종료 결과:

- 정수 점수
- 정수 생존시간(초)
- 최고 레벨
- 획득 snack 수

## 5. 점수 저장과 랭킹

게임 종료 시 같은 결과 key의 중복 저장을 막은 뒤 `saveMiniGameScoreAction`을 자동 호출한다.

검증 범위:

- 점수 0~999999 정수
- 생존시간 0~3600초 정수
- 레벨 1~999 정수
- snack 0~999 정수

저장 성공 후 `/api/mini-game-rankings`를 다시 호출한다.

랭킹 정렬:

1. 점수 내림차순
2. 생존시간 내림차순
3. 등록시간 오름차순
4. 상위 20건

랭킹은 사용자명, 부서명, 점수, 생존시간, 레벨, snack 수를 표시한다. 관리자 키나 profile 전체를 응답하지 않는다.

## 6. 주요 코드와 데이터

| 구분 | 위치 |
| --- | --- |
| 서버 페이지 | `src/app/(protected)/mini-game/page.tsx` |
| 게임 loop·canvas·UI | `src/components/game/HuindungiWalkGame.tsx` |
| 점수 저장 | `src/actions/game.ts` |
| 랭킹 API | `src/app/api/mini-game-rankings/route.ts` |
| 테이블 | `mini_game_scores` |
| 사용자 관계 | `profiles`, `departments` |
| migration | `010_mini_game_scores.sql` |

RLS는 인증 사용자 조회와 본인 점수 insert를 허용한다. 랭킹 API는 관계 조회 편의를 위해 관리자 클라이언트를 사용하기 전에 활성 프로필을 검사한다.

## 7. 변경 불변 조건

- 게임 종료 결과가 한 번만 저장되어야 한다.
- 컴포넌트 unmount나 재시작 시 기존 animation frame을 취소한다.
- keyboard listener를 cleanup한다.
- React state 갱신을 매 frame 수행해 불필요한 rerender를 만들지 않는다.
- canvas 내부 크기와 CSS 표시 크기를 혼동해 충돌 판정이 달라지지 않게 한다.
- 업무 테이블 또는 사용자 권한 상태를 게임 점수로 변경하지 않는다.
- 랭킹 API는 비로그인·비활성 사용자에게 데이터를 반환하지 않는다.

## 8. 검증 시나리오

- 키보드와 화면 버튼의 3개 lane 이동
- Space 시작, 재시작, 연속 클릭
- bone·poop 충돌 종료와 snack 획득
- boost 6.5초, 속도 절반, 점수 2배
- 12초 레벨 증가와 spawn 최소 간격
- 종료 점수 1회 저장 및 랭킹 재조회
- 랭킹 동률 정렬과 20건 제한
- service-role 또는 migration 누락 안내
- 데스크톱·모바일 canvas 비율, nonblank pixel, 버튼 겹침
