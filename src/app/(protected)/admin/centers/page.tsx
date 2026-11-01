import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { NowCenterMasterTable, NowSourceNotice } from "@/components/masters/NowMasterViews";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canViewDepartmentMaster } from "@/lib/auth/permissions";
import { sortNowMasterRows, toCenterMasterViewRow, type CenterMasterViewRow } from "@/lib/masters/now-master";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const NOW_CENTER_LIMIT = 1000;

export default async function CentersPage() {
  const { profile } = await getCurrentUserProfile();
  if (!canViewDepartmentMaster(profile)) {
    redirect("/notices?error=forbidden");
  }

  let rows: CenterMasterViewRow[] = [];
  let loadError: string | null = null;
  try {
    // 현황관리(now) 원본을 서비스키로 조회만 한다. 화면 진입 권한은 위에서 확인했다.
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .schema("now")
      .from("center")
      .select("id,center_name,lease_type,building_type,address,is_active,sort_order,note")
      .limit(NOW_CENTER_LIMIT);
    if (error) {
      loadError = "현황관리 센터 정보를 불러오지 못했습니다.";
    } else {
      rows = sortNowMasterRows(data ?? [], (row) => row.center_name).map(toCenterMasterViewRow);
    }
  } catch {
    loadError = "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요.";
  }

  return (
    <>
      <PageHeader title="센터마스터" description="현황관리(now) 센터마스터를 조회합니다. 등록·수정·삭제는 현황관리에서 합니다." />
      <NowSourceNotice />
      {loadError ? (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{loadError}</p>
      ) : null}
      <NowCenterMasterTable rows={rows} />
    </>
  );
}
