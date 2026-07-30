import { redirect } from "next/navigation";
import { CenterMasterControls } from "@/components/masters/MasterForms";
import { PageHeader } from "@/components/common/PageHeader";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canViewDepartmentMaster, isAdmin } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CenterMasterRow = {
  id: string;
  source_center_id: string;
  center_name: string;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

const CENTER_MASTER_LIMIT = 300;

export default async function CentersPage() {
  const { profile } = await getCurrentUserProfile();
  if (!canViewDepartmentMaster(profile)) {
    redirect("/notices?error=forbidden");
  }

  const supabase = await createSupabaseServerClient();
  let centers: CenterMasterRow[] = [];

  if (supabase) {
    const { data } = await supabase
      .from("center_masters")
      .select("id,source_center_id,center_name,address,notes,is_active,updated_at")
      .eq("is_active", true)
      .order("center_name")
      .limit(CENTER_MASTER_LIMIT);

    centers = (data ?? []) as CenterMasterRow[];
  }

  return (
    <>
      <PageHeader title="센터마스터" description="노임마감시스템의 센터 정보를 불러와 조회합니다." />
      <CenterMasterControls centers={centers} canImport={isAdmin(profile)} />
    </>
  );
}
