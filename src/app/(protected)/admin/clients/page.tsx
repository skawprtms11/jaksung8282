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
        const baseQuery = (withNotes: boolean) => {
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

          if (params.q) {
            query = query.or(`client_code.ilike.%${params.q}%,client_name.ilike.%${params.q}%`);
          }
          if (params.department_id) {
            query = query.eq("department_id", params.department_id);
          }

          return query;
        };

        const result = await baseQuery(true);
        if (result.error?.message.includes("notes")) {
          return baseQuery(false);
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
