# 메뉴별 시스템 지침

이 디렉터리는 사이드바 메뉴별 목적과 현재 구현 계약을 기록한다. 전역 원칙은 루트 `AGENTS.md`를 우선 적용하고, 메뉴 작업을 시작하기 전에 아래 해당 문서를 추가로 읽는다.

| 메뉴 | 경로 | 상세 문서 |
| --- | --- | --- |
| 공지사항 | `/notices` | [notices.md](./notices.md) |
| 회의자료 | `/meeting-materials` | [meeting-materials.md](./meeting-materials.md) |
| 부서자료 | `/department-reports` | [department-reports.md](./department-reports.md) |
| 화주자료 | `/client-reports` | [client-reports.md](./client-reports.md) |
| 미니게임 | `/mini-game` | [mini-game.md](./mini-game.md) |
| 부서마스터 | `/admin/departments` | [department-master.md](./department-master.md) |
| 센터마스터 | `/admin/centers` | [center-master.md](./center-master.md) |
| 화주마스터 | `/admin/clients` | [client-master.md](./client-master.md) |
| 사용자관리 | `/admin/users` | [user-management.md](./user-management.md) |

공유 코드 변경 시 한 문서만 읽어서는 안 된다.

- `src/actions/reports.ts`: 회의자료, 부서자료, 화주자료 문서를 모두 확인한다.
- `src/components/masters/MasterForms.tsx` 또는 `src/actions/masters.ts`: 영향받는 마스터 메뉴 문서를 모두 확인한다.
- `src/components/layout/Header.tsx`, `Sidebar.tsx`, `/api/header-filters`: 회의자료, 부서자료, 화주자료와 권한이 달라지는 모든 메뉴 문서를 확인한다.
- 사이드바의 공지사항·회의자료·부서자료·화주자료는 배포 환경에서 전체 route payload를 백그라운드 프리페치한다. 마스터·보조 메뉴는 자동 부분 프리페치를 사용하며 모든 링크는 Next.js 기본 내비게이션을 유지한다.
- `src/lib/auth/permissions.ts`, `src/types/enums.ts`, `src/types/database.ts`, Supabase RLS/RPC: 루트 `AGENTS.md`와 영향받는 모든 메뉴 문서를 확인한다.

기능 계약이 바뀌면 코드와 같은 작업에서 해당 메뉴 문서를 갱신한다.
