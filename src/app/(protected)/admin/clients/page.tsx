import { redirect } from "next/navigation";
import { ClientMasterControls } from "@/components/masters/MasterForms";
import { PageHeader } from "@/components/common/PageHeader";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DepartmentOption = { id: string; department_name: string };
type ClientRow = {
  id: string;
  client_code: string;
  client_name: string;
  notes: string | null;
  department_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const CLIENT_MASTER_LIMIT = 200;

export default async function ClientsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; department_id?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentUserProfile();
  if (!isAdmin(profile)) {
    redirect("/notices?error=forbidden");
  }

  const supabase = await createSupabaseServerClient();
  let departments: DepartmentOption[] = [];
  let clients: ClientRow[] = [];

  if (supabase) {
    const [{ data: departmentData }, { data: clientData }] = await Promise.all([
      supabase.from("departments").select("id,department_name").eq("is_active", true).order("sort_order"),
      (async () => {
        const baseQuery = (withNotes: boolean, searchColumn?: "client_code" | "client_name") => {
          let query = supabase
            .from("clients")
            .select(
              withNotes
                ? "id,client_code,client_name,notes,department_id,is_active,sort_order,created_at,updated_at"
                : "id,client_code,client_name,department_id,is_active,sort_order,created_at,updated_at"
            )
            .eq("is_active", true)
            .order("sort_order")
            .order("client_name")
            .limit(CLIENT_MASTER_LIMIT);

          if (searchColumn) {
            query = query.ilike(searchColumn, `%${params.q}%`);
          }
          if (params.department_id) {
            query = query.eq("department_id", params.department_id);
          }

          return query;
        };

        // 검색어를 PostgREST 필터 문자열에 보간하지 않도록 컬럼별로 조회한 뒤 합친다.
        const runQuery = async (withNotes: boolean) => {
          if (!params.q) {
            return baseQuery(withNotes);
          }
          const [codeResult, nameResult] = await Promise.all([
            baseQuery(withNotes, "client_code"),
            baseQuery(withNotes, "client_name")
          ]);
          const mergedRows = new Map<string, ClientRow>();
          for (const row of [...(codeResult.data ?? []), ...(nameResult.data ?? [])] as unknown as ClientRow[]) {
            mergedRows.set(row.id, row);
          }
          return {
            data: [...mergedRows.values()]
              .sort(
                (left, right) =>
                  left.sort_order - right.sort_order || left.client_name.localeCompare(right.client_name, "ko")
              )
              .slice(0, CLIENT_MASTER_LIMIT),
            error: codeResult.error ?? nameResult.error
          };
        };

        const result = await runQuery(true);
        if (result.error?.message.includes("notes")) {
          return runQuery(false);
        }
        return result;
      })()
    ]);

    departments = (departmentData ?? []) as DepartmentOption[];
    clients = (clientData ?? []) as unknown as ClientRow[];
  }

  return (
    <>
      <PageHeader title="화주마스터" description="화주 정보를 등록하고 수정합니다." />
      <ClientMasterControls departments={departments} clients={clients} />
    </>
  );
}
