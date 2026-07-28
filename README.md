# TPL사업부 주간자료 시스템

TPL사업부의 주차별·부서별·화주별 업무자료 작성, 물동량 비교, 승인, 공지 관리를 위한 Next.js/Supabase 업무시스템이다.

## 사용 기술

- Next.js App Router, TypeScript strict, React, Tailwind CSS
- Supabase Auth, Database, RLS
- Zod, React Hook Form 호환 구조, lucide-react, Recharts
- Netlify SSR 배포

## 설치

```bash
npm install
cp .env.example .env.local
```

`.env.local`에 Supabase 값을 입력한다.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_NAME=TPL사업부 주간자료 시스템
APP_TIMEZONE=Asia/Seoul
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Supabase 적용

```bash
supabase link --project-ref <project-ref>
supabase db push
```

CLI를 쓰지 않는 경우 Supabase SQL Editor에서 `supabase/migrations` 파일을 번호 순서대로 실행한다.

## 최초 관리자

Supabase Dashboard에서 Auth 사용자를 만든 뒤 `docs/supabase-setup.md`의 SQL에 Auth 사용자 ID를 넣어 `profiles`에 `admin` 권한으로 등록한다.

## 로컬 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속한다.

## 주요 경로

- `/login`: 로그인
- `/reset-password`: 비밀번호 재설정
- `/notices`: 사업부 공지사항
- `/meeting-materials`: 부서별 회의자료
- `/department-reports`: 부서별 자료 작성
- `/client-reports`: 화주별 자료 작성
- `/admin/departments`: 부서마스터
- `/admin/clients`: 화주마스터
- `/admin/users`: 사용자관리

## 권한과 승인 흐름

관리자는 전체 조회, 마스터 관리, 공지 관리, 사업부 최종 승인·반려를 수행한다. 부서장과 매니저는 소속 부서 화주자료를 작성·검토할 수 있고, 사업부 최종 제출은 부서장과 관리자만 가능하다. 화주담당자는 소속 부서 자료를 조회하고 자신에게 배정된 화주만 작성한다.

화주자료 상태는 `draft → submitted → approved/rejected`로 이동한다. 부서자료 상태는 `draft → submitted_to_division → division_approved/division_rejected`로 이동한다. 모든 승인·반려는 `approval_history`에 저장된다.

## 배포

Netlify 설정은 `netlify.toml`에 포함되어 있다.

```bash
npm run build
```

Netlify 환경변수에 `.env.example` 항목을 등록한다. Supabase Auth Redirect URL에는 production URL, preview URL, `/reset-password` URL을 추가한다.

## 검증

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## 자주 발생하는 오류

- 로그인 후 다시 로그인 화면으로 이동: `profiles`에 Auth 사용자 ID가 연결되어 있는지 확인한다.
- 비활성 사용자 안내: 사용자관리 또는 SQL에서 `profiles.is_active`를 확인한다.
- 저장 권한 오류: 소속 부서, 화주 담당자 배정, RLS migration 적용 여부를 확인한다.
- 사용자 초대 실패: `SUPABASE_SERVICE_ROLE_KEY`가 서버 환경변수에 설정되어 있는지 확인한다.
