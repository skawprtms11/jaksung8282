import { DataCollectionBoard, type BoardDepartment, type DataCollectionView } from "@/components/data-collections/DataCollectionBoard";
import type { DataCollectionStatus } from "@/actions/data-collections";
import { normalizeCollectionColumns, normalizeCollectionOptions, normalizeCollectionWidths, normalizeEntryRows } from "@/lib/data-collections/template";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
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

export default async function DataCollectionsPage() {
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

  if (supabase && profile) {
    const [{ data: collectionData }, { data: departmentData }, { data: regularData }] = await Promise.all([
      supabase
        .from("data_collections")
        .select("id,title,description,example,image_url,collection_type,entry_mode,status,link_url,template,created_by,created_at")
        .is("deleted_at", null)
        .is("closed_at", null)
        .order("created_at", { ascending: false })
        .limit(COLLECTION_LIST_LIMIT),
      supabase.from("departments").select("id,department_name").eq("is_active", true).order("sort_order", { ascending: true }).order("department_name", { ascending: true }),
      supabase
        .from("data_collections")
        .select("id,title,description,example,image_url,collection_type,entry_mode,status,link_url,template,created_by,created_at")
        .eq("collection_type", "regular")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30)
    ]);
    const collectionRows = (collectionData ?? []) as CollectionQueryRow[];
    departments = (departmentData ?? []) as BoardDepartment[];

    const collectionIds = collectionRows.map((row) => row.id);
    let entryRows: EntryQueryRow[] = [];
    if (collectionIds.length > 0) {
      const { data: entryData } = await supabase
        .from("data_collection_entries")
        .select("collection_id,department_id,rows,is_completed,updated_at,departments(department_name)")
        .in("collection_id", collectionIds)
        .order("updated_at", { ascending: false });
      entryRows = (entryData ?? []) as unknown as EntryQueryRow[];
    }

    const creatorIds = Array.from(new Set(collectionRows.map((row) => row.created_by).filter((id): id is string => Boolean(id))));
    let nameById = new Map<string, string>();
    if (creatorIds.length > 0) {
      const { data: profileRows } = await supabase.from("profiles").select("id,full_name").in("id", creatorIds);
      nameById = new Map(((profileRows ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, row.full_name]));
    }

    const toView = (row: CollectionQueryRow, entries: EntryQueryRow[]) => {
      const columns = normalizeCollectionColumns(row.template);
      const widths = normalizeCollectionWidths(row.template, columns.length);
      const options = normalizeCollectionOptions(row.template, columns.length);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        example: row.example,
        imageUrl: row.image_url,
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
    regularTemplates = ((regularData ?? []) as CollectionQueryRow[]).map((row) => toView(row, []));
  }

  return <DataCollectionBoard collections={collections} departments={departments} regularTemplates={regularTemplates} canCreate={isAdmin(profile)} />;
}
