# 자료취합 (`/data-collections`)

## 1. 목적

관리자가 취합할 자료의 양식(컬럼)을 등록하면 각 부서가 부서자료 화면의 `자료취합` 탭에서 내용을 작성하고, 자료취합 화면에서 전체 진행 상황과 부서별 작성 내용을 확인한다.

## 2. 권한

- **전체 현황 조회(`/data-collections`)**: 관리자·부서장·매니저(`canViewMeetingMaterials`). 화주담당자는 메뉴 미노출 + 페이지 접근 차단 + RLS 차단 3중 게이트.
- **취합 등록·수정·종결·삭제**: 관리자만.
- **부서 작성(부서자료 탭)**: 소속 부서 사용자(`can_access_department`) — 액션 레벨과 RLS 양쪽에서 검증.
- 부서 작성 내용(`data_collection_entries`) select RLS: 관리자·부서장·매니저 전체, 그 외 소속 부서만.

## 3. 데이터

- `data_collections`: `title`, `description`(설명), `example`(작성 예시), `image_url`(안내 사진), `template` jsonb `{ columns: string[] }`, `closed_at`(종결), soft delete(`deleted_at`).
- `data_collection_entries`: `(collection_id, department_id)` unique, `rows` jsonb `string[][]`, `is_completed`. 저장은 upsert이며 빈 행은 서버에서 걸러진다. 내용 없이 완료 처리는 차단된다.
- 안내 사진은 공개 읽기 버킷 `data-collections`에 저장하며, 업로드는 관리자 전용 서버 액션(`uploadCollectionImageAction`, image/* · 5MB 제한)이 서비스 키로 수행한다.
- jsonb 복원은 `src/lib/data-collections/template.ts`(`normalizeCollectionColumns` / `normalizeEntryRows`)를 거친다. 컬럼 수 변경 시 행 길이는 컬럼 수에 맞춰 보정된다(컬럼 축소 시 잘리는 칸은 저장 시점에 확인창으로 경고).

## 4. 화면 구조

### 자료취합 메뉴 (`DataCollectionBoard`)

1. 상단: 좌측 "취합등록 현황" 제목 + 전체 완료율 가로막대·%(진행 중 취합건 × 활성 부서 대비 완료 부서 합, 100% 클램프), 우측 취합등록 버튼(관리자).
2. 목록: 진행 중(미종결) 취합건만, 기본 5건 + 더보기/접기. 행: 제목·등록자·등록일·건별 완료율 막대, 관리자용 수정·종결·삭제. 종결 건은 목록에서 숨겨진다.
3. 하단: 선택한 취합건의 부서별 작성 내용 표 — 부서마스터의 활성 부서 전체를 기본 표시(작성 전 부서는 빈 행), 부서·상태 컬럼은 부서 단위 행병합·가운데 정렬. 상태: 작성중(미저장) → 검토중(저장) → 확정(저장 및 확정). 설명·예시·안내 사진 박스 포함.
4. 취합등록 팝업: 상단 제목·설명·예시·사진 첨부, 하단 컬럼 설정만(행 설정 없음, 각 부서가 행 수 조정). 컬럼 입력은 Enter(다음/새 컬럼)·좌우 방향키 이동.

### 부서자료 `자료취합` 탭 (`DepartmentCollectionWorkspace`)

1. 상단: 진행 중 취합건 목록과 내 부서 상태(작성중/검토중/확정).
2. 선택 시 설명·예시·사진 안내 박스 + 엑셀 그리드 — 컬럼은 관리자가 등록한 컬럼으로 자동 구성(헤더 수정 불가), 행 추가 자유(버튼 + 마지막 행 Enter 자동 추가), 방향키·Enter·Tab 셀 이동.
3. 저장 / 저장 및 확정 버튼. 종결된 취합건은 작성 불가. 내용 없이 확정 불가.

## 5. 주의

- `router.refresh()` 후 새 취합건·컬럼 변경은 워크스페이스의 useEffect가 드래프트를 보충·보정한다.
- 모바일(`/mobile`)은 `visibleTabs` 화이트리스트에 자료취합이 없어 노출되지 않는다(의도적 미지원).
