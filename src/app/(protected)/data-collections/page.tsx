import { DataCollectionBoard, type BoardDepartment, type DataCollectionView } from "@/components/data-collections/DataCollectionBoard";
import type { DataCollectionStatus } from "@/actions/data-collections";
import { createCollectionImageUrlResolver } from "@/lib/data-collections/image";
import { normalizeCollectionColumns, normalizeCollectionOptions, normalizeCollectionWidths, normalizeEntryRows } from "@/lib/data-collections/template";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { resolveServerDepartmentScope } from "@/lib/auth/header-scope";
import { canViewMeetingMaterials, isAdmin } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const COLLECTION_LIST_LIMIT = 50;

type CollectionQueryRow = {
  id: string;
  title: string;
  description: string;
  example: string;
  image_url: string | null;
  collection_type: string;
  entry_mode: string;
  status: string;
  link_url: string | null;
  template: Json;
  created_by: string | null;
  created_at: string;
};

type EntryQueryRow = {
  collection_id: string;
  department_id: string;
  rows: Json;
  is_completed: boolean;
  updated_at: string;
  departments: { department_name: string } | null;
};

export default async function DataCollectionsPage({
  searchParams
}: {
  searchParams: Promise<{ department_id?: string; client_id?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentUserProfile();
  if (!canViewMeetingMaterials(profile)) {
    return (
      <section className="sketch-panel flex min-h-64 items-center justify-center rounded-md p-6 text-center">
        <p className="text-sm font-black text-slate-500">자료취합 전체 현황은 관리자·부서장·매니저만 조회할 수 있습니다.</p>
      </section>
    );
  }
  const supabase = await createSupabaseServerClient();
  let collections: DataCollectionView[] = [];
  let regularTemplates: DataCollectionView[] = [];
  let departments: BoardDepartment[] = [];
  let totalDepartmentCount = 0;

  // 자료취합 입력은 부서 단위라 헤더의 부서 조건만 적용한다(화주 연결 데이터 없음).
  const departmentScope = profile ? resolveServerDepartmentScope(profile, params.department_id) : ({ kind: "blocked" } as const);
  const scopedDepartmentId = departmentScope.kind === "department" ? departmentScope.departmentId : null;

  if (supabase && profile && departmentScope.kind !== "blocked") {
    const departmentQuery = supabase
      .from("departments")
      .select("id,department_name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("department_name", { ascending: true });
    const [{ data: collectionData }, { data: departmentData }, { data: regularData }] = await Promise.all([
      supabase
        .from("data_collections")
        .select("id,title,description,example,image_url,collection_type,entry_mode,status,link_url,template,created_by,created_at")
        .is("deleted_at", null)
        .is("closed_at", null)
        .order("created_at", { ascending: false })
        .limit(COLLECTION_LIST_LIMIT),
      scopedDepartmentId ? departmentQuery.eq("id", scopedDepartmentId) : departmentQuery,
      supabase
        .from("data_collections")
        .select("id,title,description,example,image_url,collection_type,entry_mode,status,link_url,template,created_by,created_at")
        .eq("collection_type", "regular")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30)
    ]);
    const collectionRows = (collectionData ?? []) as CollectionQueryRow[];
    const regularRows = (regularData ?? []) as CollectionQueryRow[];
    departments = (departmentData ?? []) as BoardDepartment[];

    const collectionIds = collectionRows.map((row) => row.id);
    let entryRows: EntryQueryRow[] = [];
    const completedCountByCollection = new Map<string, number>();
    totalDepartmentCount = departments.length;
    if (collectionIds.length > 0) {
      let entryQuery = supabase
        .from("data_collection_entries")
        .select("collection_id,department_id,rows,is_completed,updated_at,departments(department_name)")
        .in("collection_id", collectionIds);
      if (scopedDepartmentId) {
        entryQuery = entryQuery.eq("department_id", scopedDepartmentId);
      }
      // 한 부서로 좁혀 보더라도 진행률·자동 완료 상태는 활성 부서 전체 기준이어야 하므로 확정 행 수와 활성 부서 수를 따로 센다.
      const [{ data: entryData }, completedResult, departmentCountResult] = await Promise.all([
        entryQuery.order("updated_at", { ascending: false }),
        scopedDepartmentId
          ? supabase.from("data_collection_entries").select("collection_id").in("collection_id", collectionIds).eq("is_completed", true)
          : Promise.resolve({ data: null }),
        scopedDepartmentId
          ? supabase.from("departments").select("id", { count: "exact", head: true }).eq("is_active", true)
          : Promise.resolve({ count: null })
      ]);
      entryRows = (entryData ?? []) as unknown as EntryQueryRow[];
      const completedRows = scopedDepartmentId
        ? ((completedResult.data ?? []) as { collection_id: string }[])
        : entryRows.filter((entry) => entry.is_completed);
      completedRows.forEach((row) => {
        completedCountByCollection.set(row.collection_id, (completedCountByCollection.get(row.collection_id) ?? 0) + 1);
      });
      if (scopedDepartmentId) {
        totalDepartmentCount = departmentCountResult.count ?? departments.length;
      }
    }

    const creatorIds = Array.from(new Set(collectionRows.map((row) => row.created_by).filter((id): id is string => Boolean(id))));
    let nameById = new Map<string, string>();
    if (creatorIds.length > 0) {
      const { data: profileRows } = await supabase.from("profiles").select("id,full_name").in("id", creatorIds);
      nameById = new Map(((profileRows ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, row.full_name]));
    }

    // 비공개 버킷 사진은 서버에서 만료 1시간 서명 주소로 바꿔 내려준다.
    const resolveImageUrl = await createCollectionImageUrlResolver(
      [...collectionRows, ...regularRows].map((row) => row.image_url)
    );

    const toView = (row: CollectionQueryRow, entries: EntryQueryRow[]) => {
      const columns = normalizeCollectionColumns(row.template);
      const widths = normalizeCollectionWidths(row.template, columns.length);
      const options = normalizeCollectionOptions(row.template, columns.length);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        example: row.example,
        imageUrl: resolveImageUrl(row.image_url),
        columns,
        widths,
        options,
        collectionType: row.collection_type === "regular" ? ("regular" as const) : ("adhoc" as const),
        status: (["in_progress", "on_hold", "completed", "cancelled"].includes(row.status)
          ? row.status
          : "in_progress") as DataCollectionStatus,
        entryMode: row.entry_mode === "link" ? ("link" as const) : ("grid" as const),
        linkUrl: row.link_url,
        authorName: (row.created_by ? nameById.get(row.created_by) : undefined) ?? "-",
        createdAt: row.created_at,
        completedDepartmentCount: completedCountByCollection.get(row.id) ?? 0,
        entries: entries
          .filter((entry) => entry.collection_id === row.id)
          .map((entry) => ({
            departmentId: entry.department_id,
            departmentName: entry.departments?.department_name ?? "-",
            rows: normalizeEntryRows(entry.rows, columns.length),
            isCompleted: entry.is_completed,
            updatedAt: entry.updated_at
          }))
          .sort((left, right) => left.departmentName.localeCompare(right.departmentName, "ko"))
      };
    };
    collections = collectionRows.map((row) => toView(row, entryRows));
    regularTemplates = regularRows.map((row) => toView(row, []));
  }

  return (
    <DataCollectionBoard
      collections={collections}
      departments={departments}
      totalDepartmentCount={totalDepartmentCount}
      scopedDepartmentName={scopedDepartmentId ? departments[0]?.department_name ?? null : null}
      regularTemplates={regularTemplates}
      canCreate={isAdmin(profile)}
    />
  );
}
