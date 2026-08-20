import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// 회의자료 표의 화주명 아래에 작성자명을 표시하기 위한 { 자료 id → 작성자명 } 맵.
// created_by가 auth.users를 참조해 profiles로 embed 조인이 안 되므로 2단계로 조회한다.
// weekly_client_reports RLS(can_access_department)가 부서 범위를 강제하므로
// departmentId 필터는 페이로드를 줄이는 성능 목적으로만 쓰인다.
export async function loadMeetingReportAuthorNames(
  client: SupabaseClient<Database>,
  weekStartDate: string,
  departmentId?: string | null
): Promise<Record<string, string>> {
  let reportQuery = client
    .from("weekly_client_reports")
    .select("id,created_by")
    .eq("week_start_date", weekStartDate)
    .is("deleted_at", null);
  if (departmentId) {
    reportQuery = reportQuery.eq("department_id", departmentId);
  }
  const { data: reportRows } = await reportQuery;
  const rows = (reportRows ?? []) as { id: string; created_by: string | null }[];
  const creatorIds = Array.from(
    new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id)))
  );
  if (creatorIds.length === 0) {
    return {};
  }
  const { data: profileRows } = await client.from("profiles").select("id,full_name").in("id", creatorIds);
  const nameById = new Map(
    ((profileRows ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, row.full_name])
  );
  return Object.fromEntries(
    rows.flatMap((row) => {
      const name = row.created_by ? nameById.get(row.created_by) : undefined;
      return name ? [[row.id, name] as const] : [];
    })
  );
}
