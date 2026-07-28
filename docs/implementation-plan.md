# 구현 계획

## 적용 기준

- 빈 저장소이므로 Next.js App Router, TypeScript strict, Tailwind CSS 기반으로 신규 프로젝트를 구성한다.
- 모든 업무 데이터 변경은 Server Action을 거치며, Supabase RLS와 서버 권한검증을 함께 적용한다.
- 주차의 DB 고유 기준은 `week_start_date`이고, 화면 표시는 목요일 기준 월과 월별 주차를 사용한다.
- 물리삭제 대신 업무자료와 공지는 `deleted_at`, `deleted_by`를 기록하는 soft delete를 기본으로 한다.
- Service Role Key는 `src/lib/supabase/admin.ts`의 서버 전용 사용자 초대/생성 흐름에서만 사용한다.

## 단계별 결과

1. 프로젝트 구성: Next.js, React, Tailwind, Supabase, Zod, Recharts, lucide-react 설정
2. 인증: 이메일 로그인, 로그아웃, 비밀번호 재설정, middleware 보호 라우팅
3. DB/RLS: 기능별 migration, enum, trigger, helper function, RPC, policy 작성
4. 마스터: 부서, 화주, 사용자 등록 및 조회 화면
5. 화주별 자료: 반복 실시사항/예정사항, 물동량 입력, 저장/검토요청
6. 부서별 자료: 화주별 검토, 승인/반려, 부서 공통자료 4개 탭, 사업부 제출
7. 회의자료: URL 필터, Recharts 물동량 비교, 관리자 최종 승인/반려
8. 공지사항: 목록, 검색, 상세, 관리자 등록/수정/soft delete
9. 안정화: 빈 상태, 권한 차단, 한국어 오류 메시지, 반응형 표
10. 배포 문서: Supabase, 최초 관리자, Netlify SSR 설정
