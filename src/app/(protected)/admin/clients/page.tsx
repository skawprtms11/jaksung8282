import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { NowClientMasterTable, NowSourceNotice } from "@/components/masters/NowMasterViews";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { sortNowMasterRows, toClientMasterViewRow, type ClientMasterViewRow } from "@/lib/masters/now-master";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const NOW_CLIENT_LIMIT = 2000;

export default async function ClientsPage() {
  const { profile } = await getCurrentUserProfile();
  if (!isAdmin(profile)) {
    redirect("/notices?error=forbidden");
  }

  let rows: ClientMasterViewRow[] = [];
  let loadError: string | null = null;
  try {
    // 현황관리(now) 원본을 서비스키로 조회만 한다. 화면 진입 권한은 위에서 관리자만 통과시켰다.
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .schema("now")
      .from("client")
      .select("id,client_code,client_name,erp_code,labor_code,pl_code,rep_client_code,rep_client_name,is_active,sort_order,note")
      .limit(NOW_CLIENT_LIMIT);
    if (error) {
      loadError = "현황관리 화주 정보를 불러오지 못했습니다.";
    } else {
      rows = sortNowMasterRows(data ?? [], (row) => row.client_name).map(toClientMasterViewRow);
    }
  } catch {
    loadError = "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요.";
  }

  return (
    <>
      <PageHeader title="화주마스터" description="현황관리(now) 화주마스터를 조회합니다. 등록·수정·삭제는 현황관리에서 합니다." />
      <NowSourceNotice />
      {loadError ? (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{loadError}</p>
      ) : null}
      <NowClientMasterTable rows={rows} />
    </>
  );
}
