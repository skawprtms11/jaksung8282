import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { DepartmentCreateButton, DepartmentMasterTable } from "@/components/masters/MasterForms";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canViewDepartmentMaster, isAdmin } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/enums";

type DepartmentRow = {
  id: string;
  department_code: string;
  department_name: string;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
type AssignmentUser = {
  id: string;
  full_name: string;
  department_id: string | null;
  app_role: AppRole;
};
type DepartmentClientValue = {
  id: string;
  client_code: string;
  client_name: string;
  notes: string | null;
  department_id: string | null;
};
type DepartmentClientLinkValue = {
  department_id: string;
  client_id: string;
  is_active: boolean;
};
type DepartmentAssignmentValue = {
  department_id: string | null;
  client_id: string;
  user_id: string;
  is_primary: boolean;
  is_active: boolean;
};

const DEPARTMENT_MASTER_LIMIT = 200;
const ASSIGNMENT_LOOKUP_LIMIT = 500;

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const { profile } = await getCurrentUserProfile();
  if (!canViewDepartmentMaster(profile)) {
    redirect("/notices?error=forbidden");
  }

  const supabase = await createSupabaseServerClient();
  let departments: DepartmentRow[] = [];
  let users: AssignmentUser[] = [];
  let departmentCreateUsers: AssignmentUser[] = [];
  let clients: DepartmentClientValue[] = [];
  let departmentClientLinks: DepartmentClientLinkValue[] = [];
  let assignments: DepartmentAssignmentValue[] = [];

  if (supabase) {
    const baseDepartmentQuery = (withNotes: boolean) => {
      let query = supabase
        .from("departments")
        .select(withNotes ? "id,department_code,department_name,notes,is_active,sort_order,created_at,updated_at" : "id,department_code,department_name,is_active,sort_order,created_at,updated_at")
        .eq("is_active", true)
        .order("sort_order")
        .order("department_name");

      if (!isAdmin(profile) && profile?.department_id) {
        query = query.eq("id", profile.department_id);
      }
      if (params.q) {
        query = query.or(`department_code.ilike.%${params.q}%,department_name.ilike.%${params.q}%`);
      }
      return query;
    };

    const result = await baseDepartmentQuery(true);
    const departmentResult = result.error?.message.includes("notes") ? await baseDepartmentQuery(false) : result;
    departments = ((departmentResult.data ?? []) as unknown as DepartmentRow[]).map((department) => ({
      ...department,
      notes: department.notes ?? null
    }));

    try {
      const admin = createSupabaseAdminClient();
      const accessibleDepartmentIds = new Set(departments.map((department) => department.id));
      const accessibleDepartmentIdList = Array.from(accessibleDepartmentIds);
      const linkDepartmentIds = accessibleDepartmentIdList.length > 0 ? accessibleDepartmentIdList : ["00000000-0000-0000-0000-000000000000"];
      const clientQuery = admin
        .from("clients")
        .select("id,client_code,client_name,notes,department_id")
        .eq("is_active", true)
        .order("client_name");

      const [{ data: userData }, { data: clientData }, { data: linkData }] = await Promise.all([
        admin
          .from("profiles")
          .select("id,full_name,department_id,app_role")
          .eq("is_active", true)
          .in("app_role", ["department_head", "manager", "client_owner"])
          .order("full_name")
          .limit(DEPARTMENT_MASTER_LIMIT),
        clientQuery.limit(DEPARTMENT_MASTER_LIMIT),
        admin
          .from("department_client_links")
          .select("department_id,client_id,is_active")
          .in("department_id", linkDepartmentIds)
          .eq("is_active", true)
          .limit(ASSIGNMENT_LOOKUP_LIMIT)
      ]);

      departmentCreateUsers = (userData ?? []) as AssignmentUser[];
      users = departmentCreateUsers.filter((user) => user.department_id && accessibleDepartmentIds.has(user.department_id));
      clients = ((clientData ?? []) as DepartmentClientValue[])
        .map((client) => ({ ...client, notes: client.notes ?? null }));
      departmentClientLinks = (linkData ?? []) as DepartmentClientLinkValue[];

      const clientIds = clients.map((client) => client.id);
      if (clientIds.length > 0) {
        const { data: assignmentData } = await admin
          .from("client_assignments")
          .select("department_id,client_id,user_id,is_primary,is_active")
          .in("client_id", clientIds)
          .in("department_id", linkDepartmentIds)
          .eq("is_active", true)
          .limit(ASSIGNMENT_LOOKUP_LIMIT);
        assignments = (assignmentData ?? []) as DepartmentAssignmentValue[];
      }
    } catch {
      users = [];
      departmentCreateUsers = [];
      clients = [];
      assignments = [];
    }
  }

  const showAdminDepartmentTools = isAdmin(profile);

  return (
    <>
      <PageHeader title="부서마스터" description="부서 정보와 부서 소속 화주를 관리합니다." />
      <div className="sketch-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <form className="flex min-w-0 flex-1 gap-2">
          <input name="q" defaultValue={params.q} placeholder="부서명 검색" className="h-10 w-full max-w-md rounded-md border border-slate-300 px-3 text-sm" />
          <button className="tool-button tool-button-primary">
            <Search className="h-4 w-4" aria-hidden="true" />
            검색
          </button>
        </form>
        {showAdminDepartmentTools ? <DepartmentCreateButton users={departmentCreateUsers} /> : null}
      </div>
      {departments.length === 0 ? (
        <EmptyState title="부서 정보가 없습니다." />
      ) : (
        <DepartmentMasterTable
          departments={departments}
          users={users}
          headCandidates={departmentCreateUsers}
          clients={clients}
          departmentClientLinks={departmentClientLinks}
          assignments={assignments}
          canManage={showAdminDepartmentTools}
        />
      )}
    </>
  );
}
