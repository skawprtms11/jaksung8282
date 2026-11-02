import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { type DepartmentHeadCandidate } from "@/components/masters/MasterForms";
import {
  NowDepartmentMasterTable,
  NowSourceNotice,
  type DepartmentMasterTableRow
} from "@/components/masters/NowMasterViews";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canViewDepartmentMaster, isAdmin } from "@/lib/auth/permissions";
import { sortNowMasterRows, toDepartmentMasterViewRow } from "@/lib/masters/now-master";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const NOW_DEPARTMENT_LIMIT = 500;
const HEAD_CANDIDATE_LIMIT = 500;

export default async function DepartmentsPage() {
  const { profile } = await getCurrentUserProfile();
  if (!canViewDepartmentMaster(profile) || !profile) {
    redirect("/notices?error=forbidden");
  }
  const isAdminUser = isAdmin(profile);

  let rows: DepartmentMasterTableRow[] = [];
  let headCandidates: DepartmentHeadCandidate[] = [];
  let loadError: string | null = null;

  if (!isAdminUser && !profile.department_id) {
    loadError = "소속 부서 정보를 확인하세요.";
  } else {
    try {
      // 현황관리(now) 원본을 서비스키로 조회만 한다. 화면 진입 권한은 위에서 확인했고, 비관리자는 소속 부서만 읽는다.
      const admin = createSupabaseAdminClient();
      let departmentQuery = admin
        .schema("now")
        .from("department")
        .select("id,dept_code,dept_name,is_active,sort_order,note")
        .limit(NOW_DEPARTMENT_LIMIT);
      let copyQuery = admin.from("departments").select("id").eq("is_active", true);
      let headQuery = admin
        .from("profiles")
        .select("id,full_name,department_id,app_role")
        .eq("is_active", true)
        .in("app_role", ["department_head", "manager"])
        .order("full_name")
        .limit(HEAD_CANDIDATE_LIMIT);
      if (!isAdminUser && profile.department_id) {
        departmentQuery = departmentQuery.eq("id", profile.department_id);
        copyQuery = copyQuery.eq("id", profile.department_id);
        headQuery = headQuery.eq("department_id", profile.department_id);
      }
      const [departmentResult, copyResult, headResult] = await Promise.all([departmentQuery, copyQuery, headQuery]);
      if (departmentResult.error) {
        loadError = "현황관리 부서 정보를 불러오지 못했습니다.";
      } else {
        const activeCopyIds = new Set((copyResult.data ?? []).map((department) => department.id));
        headCandidates = (headResult.data ?? []) as DepartmentHeadCandidate[];
        if (copyResult.error || headResult.error) {
          loadError = "부서장 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.";
        }
        rows = sortNowMasterRows(departmentResult.data ?? [], (row) => row.dept_name).map((row) => {
          const viewRow = toDepartmentMasterViewRow(row);
          return {
            ...viewRow,
            headNames: headCandidates
              .filter((user) => user.department_id === row.id && user.app_role === "department_head")
              .map((user) => user.full_name)
              .join(", "),
            canAssignHead: activeCopyIds.has(row.id)
          };
        });
      }
    } catch {
      loadError = "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요.";
    }
  }

  return (
    <>
      <PageHeader
        title="부서마스터"
        description="현황관리(now) 부서마스터를 조회하고 부서장을 지정합니다. 등록·수정·미사용은 현황관리에서 합니다."
      />
      <NowSourceNotice />
      {loadError ? (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{loadError}</p>
      ) : null}
      <NowDepartmentMasterTable rows={rows} headCandidates={headCandidates} canManage={isAdminUser} />
    </>
  );
}
