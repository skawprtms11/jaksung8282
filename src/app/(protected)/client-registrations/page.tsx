import { redirect } from "next/navigation";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import {
  ClientRegistrationWorkspace,
  type ClientRegistrationUser
} from "@/components/masters/ClientRegistrationWorkspace";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { pickDefaultDepartmentId } from "@/lib/auth/default-scope";
import { canManageDepartmentClients, canRegisterDepartmentClients, isAdmin } from "@/lib/auth/permissions";
import {
  buildClientRegistrationRows,
  resolveRegistrationDepartmentId,
  type ClientRegistrationRow
} from "@/lib/masters/operating-clients";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DepartmentOption = { id: string; department_name: string };
type LinkRow = {
  client_id: string;
  clients: { id: string; client_code: string; client_name: string; is_active: boolean } | null;
};

const LOOKUP_LIMIT = 1000;

export default async function ClientRegistrationsPage({
  searchParams
}: {
  searchParams: Promise<{ department_id?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active || !canRegisterDepartmentClients(profile)) {
    redirect("/notices?error=forbidden");
  }

  let department: DepartmentOption | null = null;
  let rows: ClientRegistrationRow[] = [];
  let users: ClientRegistrationUser[] = [];
  let loadError: string | null = null;

  try {
    // 화면 진입 권한을 위에서 확인한 뒤 서비스키로 읽는다. 비관리자는 소속 부서만 조회한다.
    const admin = createSupabaseAdminClient();
    let departmentQuery = admin
      .from("departments")
      .select("id,department_name")
      .eq("is_active", true)
      .order("sort_order")
      .order("department_name");
    if (!isAdmin(profile)) {
      departmentQuery = departmentQuery.eq("id", profile.department_id ?? "00000000-0000-0000-0000-000000000000");
    }
    const { data: departmentData, error: departmentError } = await departmentQuery;
    const departments = (departmentData ?? []) as DepartmentOption[];
    const departmentId = resolveRegistrationDepartmentId(
      profile,
      params.department_id,
      departments.map((option) => option.id),
      pickDefaultDepartmentId(departments, profile.app_role)
    );
    department = departments.find((option) => option.id === departmentId) ?? null;
    if (departmentError) {
      loadError = "부서 정보를 불러오지 못했습니다.";
    }

    if (department) {
      const [linkResult, operatingResult, userResult, assignmentResult] = await Promise.all([
        admin
          .from("department_client_links")
          .select("client_id,clients(id,client_code,client_name,is_active)")
          .eq("department_id", department.id)
          .eq("is_active", true)
          .limit(LOOKUP_LIMIT),
        admin
          .from("department_operating_clients")
          .select("client_id")
          .eq("department_id", department.id)
          .eq("is_active", true)
          .limit(LOOKUP_LIMIT),
        admin
          .from("profiles")
          .select("id,full_name,app_role")
          .eq("department_id", department.id)
          .eq("is_active", true)
          .not("app_role", "is", null)
          .order("full_name")
          .limit(LOOKUP_LIMIT),
        admin
          .from("client_assignments")
          .select("client_id,user_id,is_primary")
          .eq("department_id", department.id)
          .eq("is_active", true)
          .limit(LOOKUP_LIMIT)
      ]);
      if (linkResult.error || operatingResult.error || userResult.error || assignmentResult.error) {
        loadError = operatingResult.error
          ? "운영 화주 정보를 불러오지 못했습니다. DB 마이그레이션 적용 여부를 확인하세요."
          : "화주·담당자 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.";
      }
      users = (userResult.data ?? []) as ClientRegistrationUser[];
      const linkedClients = ((linkResult.data ?? []) as unknown as LinkRow[]).flatMap((link) =>
        link.clients ? [link.clients] : []
      );
      rows = buildClientRegistrationRows(
        linkedClients,
        new Set((operatingResult.data ?? []).map((row) => row.client_id)),
        (assignmentResult.data ?? []) as { client_id: string; user_id: string; is_primary: boolean }[],
        new Set(users.map((user) => user.id))
      );
    }
  } catch {
    loadError = "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요.";
  }

  return (
    <>
      <PageHeader
        title="부서별화주등록"
        description="현황관리(now)에서 부서에 연결된 화주 중 운영 중인 화주와 화주별 담당자를 등록합니다."
      />
      {loadError ? (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{loadError}</p>
      ) : null}
      {department ? (
        <ClientRegistrationWorkspace
          key={department.id}
          department={department}
          initialRows={rows}
          users={users}
          canManage={canManageDepartmentClients(profile, department.id)}
        />
      ) : (
        <EmptyState title="조회할 부서가 없습니다." description="상단에서 부서를 선택하거나 소속 부서 정보를 확인하세요." />
      )}
    </>
  );
}
