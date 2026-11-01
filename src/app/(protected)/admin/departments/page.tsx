import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { DepartmentMasterTable } from "@/components/masters/MasterForms";
import { EmptyState } from "@/components/common/EmptyState";
import { NowSourceNotice } from "@/components/masters/NowMasterViews";
import { PageHeader } from "@/components/common/PageHeader";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canViewDepartmentMaster, isAdmin } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chunkValues } from "@/lib/masters/now-master";
import { toContainsPattern } from "@/lib/utils/search";
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
const ID_CHUNK_SIZE = 100;

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const { profile } = await getCurrentUserProfile();
  if (!canViewDepartmentMaster(profile)) {
    redirect("/notices?error=forbidden");
  }

  const supabase = await createSupabaseServerClient();
  let departments: DepartmentRow[] = [];
  let users: AssignmentUser[] = [];
  let headCandidateUsers: AssignmentUser[] = [];
  let clients: DepartmentClientValue[] = [];
  let departmentClientLinks: DepartmentClientLinkValue[] = [];
  let assignments: DepartmentAssignmentValue[] = [];
  let relationLoadError: string | null = null;

  if (supabase) {
    const baseDepartmentQuery = (withNotes: boolean, searchColumn?: "department_code" | "department_name") => {
      let query = supabase
        .from("departments")
        .select(withNotes ? "id,department_code,department_name,notes,is_active,sort_order,created_at,updated_at" : "id,department_code,department_name,is_active,sort_order,created_at,updated_at")
        .eq("is_active", true)
        .order("sort_order")
        .order("department_name");

      if (!isAdmin(profile) && profile?.department_id) {
        query = query.eq("id", profile.department_id);
      }
      if (searchColumn) {
        query = query.ilike(searchColumn, toContainsPattern(params.q ?? ""));
      }
      return query;
    };

    // 검색어를 PostgREST 필터 문자열에 보간하지 않도록 컬럼별로 조회한 뒤 합친다.
    const runDepartmentQuery = async (withNotes: boolean) => {
      if (!params.q) {
        return baseDepartmentQuery(withNotes);
      }
      const [codeResult, nameResult] = await Promise.all([
        baseDepartmentQuery(withNotes, "department_code"),
        baseDepartmentQuery(withNotes, "department_name")
      ]);
      const mergedRows = new Map<string, DepartmentRow>();
      for (const row of [...(codeResult.data ?? []), ...(nameResult.data ?? [])] as unknown as DepartmentRow[]) {
        mergedRows.set(row.id, row);
      }
      return {
        data: [...mergedRows.values()].sort(
          (left, right) =>
            left.sort_order - right.sort_order || left.department_name.localeCompare(right.department_name, "ko")
        ),
        error: codeResult.error ?? nameResult.error
      };
    };

    const result = await runDepartmentQuery(true);
    const departmentResult = result.error?.message.includes("notes") ? await runDepartmentQuery(false) : result;
    departments = ((departmentResult.data ?? []) as unknown as DepartmentRow[]).map((department) => ({
      ...department,
      notes: department.notes ?? null
    }));

    try {
      const admin = createSupabaseAdminClient();
      const accessibleDepartmentIds = new Set(departments.map((department) => department.id));
      const accessibleDepartmentIdList = Array.from(accessibleDepartmentIds);
      const linkDepartmentIds = accessibleDepartmentIdList.length > 0 ? accessibleDepartmentIdList : ["00000000-0000-0000-0000-000000000000"];
      const [{ data: userData }, { data: linkData }] = await Promise.all([
        admin
          .from("profiles")
          .select("id,full_name,department_id,app_role")
          .eq("is_active", true)
          .in("app_role", ["department_head", "manager", "client_owner"])
          .order("full_name")
          .limit(DEPARTMENT_MASTER_LIMIT),
        admin
          .from("department_client_links")
          .select("department_id,client_id,is_active")
          .in("department_id", linkDepartmentIds)
          .eq("is_active", true)
          .limit(ASSIGNMENT_LOOKUP_LIMIT)
      ]);

      headCandidateUsers = (userData ?? []) as AssignmentUser[];
      users = headCandidateUsers.filter((user) => user.department_id && accessibleDepartmentIds.has(user.department_id));
      departmentClientLinks = (linkData ?? []) as DepartmentClientLinkValue[];

      // 화주 등록은 현황관리에서 하므로 전체 화주 대신 연결된 화주만 읽는다(전체 상한에 걸려 누락되지 않게).
      const linkedClientIds = Array.from(new Set(departmentClientLinks.map((link) => link.client_id)));
      const clientResults = await Promise.all(
        chunkValues(linkedClientIds, ID_CHUNK_SIZE).map((ids) =>
          admin.from("clients").select("id,client_code,client_name,notes,department_id").in("id", ids).eq("is_active", true)
        )
      );
      if (clientResults.some((result) => result.error)) {
        relationLoadError = "등록 화주 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.";
      }
      clients = clientResults
        .flatMap((result) => (result.data ?? []) as DepartmentClientValue[])
        .map((client) => ({ ...client, notes: client.notes ?? null }))
        .sort((left, right) => left.client_name.localeCompare(right.client_name, "ko"));

      // 현황관리에서 연결이 해제된 화주의 배정은 데이터는 두고 화면에서만 숨긴다.
      const activeLinkKeys = new Set(departmentClientLinks.map((link) => `${link.department_id}:${link.client_id}`));
      const assignmentResults = await Promise.all(
        chunkValues(clients.map((client) => client.id), ID_CHUNK_SIZE).map((ids) =>
          admin
            .from("client_assignments")
            .select("department_id,client_id,user_id,is_primary,is_active")
            .in("client_id", ids)
            .in("department_id", linkDepartmentIds)
            .eq("is_active", true)
            .limit(ASSIGNMENT_LOOKUP_LIMIT)
        )
      );
      if (assignmentResults.some((result) => result.error)) {
        relationLoadError = "담당자 배정 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.";
      }
      assignments = assignmentResults
        .flatMap((result) => (result.data ?? []) as DepartmentAssignmentValue[])
        .filter((assignment) => activeLinkKeys.has(`${assignment.department_id}:${assignment.client_id}`));
    } catch {
      users = [];
      headCandidateUsers = [];
      clients = [];
      assignments = [];
    }
  }

  const showAdminDepartmentTools = isAdmin(profile);

  return (
    <>
      <PageHeader title="부서마스터" description="현황관리(now) 부서·부서-화주 연결을 조회하고, 부서장과 화주담당자를 지정합니다." />
      <NowSourceNotice />
      <div className="sketch-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <form className="flex min-w-0 flex-1 gap-2">
          <input name="q" defaultValue={params.q} placeholder="부서명 검색" className="h-10 w-full max-w-md rounded-md border border-slate-300 px-3 text-sm" />
          <button className="tool-button tool-button-primary">
            <Search className="h-4 w-4" aria-hidden="true" />
            검색
          </button>
        </form>
      </div>
      {relationLoadError ? (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{relationLoadError}</p>
      ) : null}
      {departments.length === 0 ? (
        <EmptyState title="부서 정보가 없습니다." />
      ) : (
        <DepartmentMasterTable
          departments={departments}
          users={users}
          headCandidates={headCandidateUsers}
          clients={clients}
          departmentClientLinks={departmentClientLinks}
          assignments={assignments}
          canManage={showAdminDepartmentTools}
        />
      )}
    </>
  );
}
