import {
  DepartmentSubmissionEditor,
  type DepartmentSubmissionEditorInitialSubmission
} from "@/components/reports/DepartmentSubmissionEditor";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableShell } from "@/components/common/TableShell";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canSubmitDepartment, isAdmin } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { getCurrentWeekOption } from "@/lib/dates/week";
import { formatDateTime, volumeUnitLabels } from "@/lib/utils/labels";
import type { ClientReportStatus, Importance, VolumeType, VolumeUnit } from "@/types/enums";

type DepartmentOption = { id: string; department_name: string };
type CategoryOption = { id: string; category_name: string; icon_key: string };
type HolidayClientOption = { id: string; client_name: string };
type HolidayClientLinkRow = { clients: { id: string; client_name: string } | null };
type HolidayWorkerOption = { id: string; full_name: string };
type ClientReviewItem = {
  item_period: "current" | "next";
  importance: Importance;
  title: string;
  content: string;
  sort_order: number;
  work_categories: { category_name: string; icon_key: string } | null;
};
type ClientReviewRow = {
  id: string;
  created_by: string;
  status: ClientReportStatus;
  updated_at: string;
  clients: { client_name: string } | null;
  profiles: { full_name: string } | null;
  weekly_client_report_items: ClientReviewItem[];
  weekly_volumes: { volume_type: VolumeType; quantity: number; unit: VolumeUnit }[];
};
type DepartmentSubmissionInitialRow = {
  id: string;
  department_id: string;
  week_start_date: string;
  status: "draft" | "submitted_to_division" | "division_approved" | "division_rejected";
  finalized_at: string | null;
  department_weekly_contents: DepartmentSubmissionEditorInitialSubmission["department_weekly_contents"];
};

const CLIENT_REVIEW_LIMIT = 100;

function importanceIconClassName(importance: Importance) {
  if (importance === "very_high") {
    return "border-red-100 bg-red-50 text-red-600";
  }
  if (importance === "high") {
    return "border-orange-100 bg-orange-50 text-orange-500";
  }
  if (importance === "medium") {
    return "border-emerald-100 bg-emerald-50 text-emerald-600";
  }
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function WorkItemList({ rows, period }: { rows: ClientReviewRow["weekly_client_report_items"]; period: "current" | "next" }) {
  const values = rows.filter((row) => row.item_period === period).sort((left, right) => left.sort_order - right.sort_order);
  if (values.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <ol className="space-y-2">
      {values.map((row, index) => (
        <li key={`${period}-${row.title}-${index}`} className="flex gap-2">
          <span
            className={cn(
              "mt-0.5 inline-flex h-7 min-w-11 shrink-0 items-center justify-center rounded-xl border px-2 text-xs font-black",
              importanceIconClassName(row.importance)
            )}
            title={row.work_categories?.category_name ?? "기타"}
          >
            {row.work_categories?.category_name ?? "기타"}
          </span>
          <span className="min-w-0">
            <span className="block break-words text-sm font-black leading-5 text-[#10223d]">{row.title}</span>
            <span className="mt-0.5 block whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">{row.content}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function summarizeVolumeByUnit(reports: ClientReviewRow[], volumeType: VolumeType) {
  const totals = new Map<VolumeUnit, number>();
  reports.forEach((report) => {
    report.weekly_volumes
      .filter((volume) => volume.volume_type === volumeType)
      .forEach((volume) => totals.set(volume.unit, (totals.get(volume.unit) ?? 0) + Number(volume.quantity)));
  });

  if (totals.size === 0) {
    return "0";
  }

  return Array.from(totals.entries())
    .map(([unit, quantity]) => `${quantity.toLocaleString("ko-KR")}${volumeUnitLabels[unit]}`)
    .join(" · ");
}

function getImportanceStats(reports: ClientReviewRow[]) {
  const labels: Record<Importance, string> = {
    very_high: "매우높음",
    high: "높음",
    medium: "보통",
    low: "낮음"
  };
  const styles: Record<Importance, string> = {
    very_high: "bg-red-500",
    high: "bg-orange-400",
    medium: "bg-emerald-500",
    low: "bg-slate-400"
  };
  const counts: Record<Importance, number> = {
    very_high: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  reports.forEach((report) => {
    report.weekly_client_report_items.forEach((item) => {
      counts[item.importance] += 1;
    });
  });

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const rows = (["very_high", "high", "medium", "low"] as Importance[]).map((importance) => ({
    importance,
    label: labels[importance],
    count: counts[importance],
    ratio: total > 0 ? Math.round((counts[importance] / total) * 100) : 0,
    barClassName: styles[importance],
    badgeClassName: importanceIconClassName(importance)
  }));

  return { total, rows };
}

export default async function DepartmentReportsPage({
  searchParams
}: {
  searchParams: Promise<{ department_id?: string; client_id?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentUserProfile();
  const supabase = await createSupabaseServerClient();
  let departments: DepartmentOption[] = [];
  let categories: CategoryOption[] = [];
  let reports: ClientReviewRow[] = [];
  let holidayClientOptions: HolidayClientOption[] = [];
  let holidayWorkerOptions: HolidayWorkerOption[] = [];
  let clientCount = 0;
  let initialSubmission: DepartmentSubmissionEditorInitialSubmission | null = null;
  let initialLookupDepartmentId: string | null = null;
  const currentWeek = getCurrentWeekOption();
  if (supabase && profile) {
    let adminDefaultDepartmentId: string | undefined;
    if (isAdmin(profile) && !params.department_id) {
      const { data: firstDepartment } = await supabase
        .from("departments")
        .select("id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("department_name", { ascending: true })
        .limit(1)
        .maybeSingle();
      adminDefaultDepartmentId = firstDepartment?.id;
    }
    const departmentFilter = isAdmin(profile) ? params.department_id ?? adminDefaultDepartmentId : profile.department_id;
    const selectedDepartmentFilter = departmentFilter ?? params.department_id;
    const selectedClientFilter = params.client_id;
    initialLookupDepartmentId = selectedDepartmentFilter ?? null;
    const [
      { data: departmentData },
      { data: categoryData },
      { data: reportData, error: reportError },
      { count },
      { data: submissionData },
      { data: holidayClientData },
      { data: holidayWorkerData }
    ] = await Promise.all([
      (() => {
        let query = supabase.from("departments").select("id,department_name").eq("is_active", true).order("sort_order");
        if (!isAdmin(profile) && departmentFilter) {
          query = query.eq("id", departmentFilter);
        }
        return query;
      })(),
      supabase.from("work_categories").select("id,category_name,icon_key").eq("is_active", true).order("sort_order"),
      (() => {
        let query = supabase
          .from("weekly_client_reports")
          .select("id,created_by,status,updated_at,clients(client_name),weekly_client_report_items(item_period,importance,title,content,sort_order,work_categories(category_name,icon_key)),weekly_volumes(volume_type,quantity,unit)")
          .eq("week_start_date", currentWeek.weekStartDate)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(CLIENT_REVIEW_LIMIT);
        if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        if (selectedDepartmentFilter) {
          query = query.eq("department_id", selectedDepartmentFilter);
        }
        if (selectedClientFilter) {
          query = query.eq("client_id", selectedClientFilter);
        }
        return query;
      })(),
      (() => {
        let query = supabase
          .from("department_client_links")
          .select("client_id", { count: "exact", head: true })
          .eq("is_active", true);
        if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        if (selectedDepartmentFilter) {
          query = query.eq("department_id", selectedDepartmentFilter);
        }
        if (selectedClientFilter) {
          query = query.eq("client_id", selectedClientFilter);
        }
        return query;
      })(),
      selectedDepartmentFilter
        ? supabase
            .from("department_weekly_submissions")
            .select(
              "id,department_id,week_start_date,status,finalized_at,department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content)"
            )
            .eq("department_id", selectedDepartmentFilter)
            .eq("week_start_date", currentWeek.weekStartDate)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      selectedDepartmentFilter
        ? supabase
            .from("department_client_links")
            .select("clients(id,client_name)")
            .eq("department_id", selectedDepartmentFilter)
            .eq("is_active", true)
            .order("client_id", { ascending: true })
        : Promise.resolve({ data: [] }),
      selectedDepartmentFilter
        ? supabase
            .from("profiles")
            .select("id,full_name")
            .eq("department_id", selectedDepartmentFilter)
            .eq("is_active", true)
            .order("full_name", { ascending: true })
        : Promise.resolve({ data: [] })
    ]);
    departments = (departmentData ?? []) as DepartmentOption[];
    categories = (categoryData ?? []) as CategoryOption[];
    holidayClientOptions = ((holidayClientData ?? []) as unknown as HolidayClientLinkRow[])
      .filter((link) => link.clients)
      .map((link) => ({
        id: link.clients?.id ?? "",
        client_name: link.clients?.client_name ?? ""
      }))
      .sort((left, right) => left.client_name.localeCompare(right.client_name, "ko"));
    holidayWorkerOptions = (holidayWorkerData ?? []) as HolidayWorkerOption[];
    const reportRows = reportError ? [] : ((reportData ?? []) as unknown as ClientReviewRow[]);
    if (reportRows.length > 0) {
      const creatorIds = Array.from(new Set(reportRows.map((report) => report.created_by)));
      const { data: creatorData } = await supabase.from("profiles").select("id,full_name").in("id", creatorIds);
      const creatorNameMap = new Map((creatorData ?? []).map((creator) => [creator.id, creator.full_name]));
      reports = reportRows.map((report) => ({
        ...report,
        profiles: { full_name: creatorNameMap.get(report.created_by) ?? "-" }
      }));
    }
    clientCount = count ?? 0;
    initialSubmission = submissionData ? (submissionData as unknown as DepartmentSubmissionInitialRow) : null;
  }
  const missingCount = Math.max(clientCount - reports.length, 0);
  const inboundVolumeSummary = summarizeVolumeByUnit(reports, "inbound");
  const outboundVolumeSummary = summarizeVolumeByUnit(reports, "outbound");
  const importanceStats = getImportanceStats(reports);
  return (
    <>
      <DepartmentSubmissionEditor
        key={`${initialLookupDepartmentId ?? "department"}-${currentWeek.weekStartDate}`}
        departments={departments}
        categories={categories}
        defaultDepartmentId={isAdmin(profile) ? initialLookupDepartmentId : profile?.department_id}
        canSubmit={canSubmitDepartment(profile)}
        holidayClientOptions={holidayClientOptions}
        holidayWorkerOptions={holidayWorkerOptions}
        initialSubmission={initialSubmission}
        initialLookupDepartmentId={initialLookupDepartmentId}
        initialLookupWeekStartDate={currentWeek.weekStartDate}
        requireExplicitDepartmentSelection={false}
        reviewSlot={
          <>
            <h2 className="section-doodle-title mb-3 mt-6">화주별 자료 검토</h2>
            {reports.length === 0 ? (
              <EmptyState title="검토할 화주별 자료가 없습니다." />
            ) : (
              <TableShell>
                <table className="table-sticky min-w-[1080px] w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-3">화주명</th>
                      <th className="px-3 py-3">담당자</th>
                      <th className="px-3 py-3">금주 실시사항</th>
                      <th className="px-3 py-3">차주 예정사항</th>
                      <th className="px-3 py-3">작성상태</th>
                      <th className="px-3 py-3">최종수정일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report.id} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-3 font-medium">{report.clients?.client_name ?? "-"}</td>
                        <td className="px-3 py-3">{report.profiles?.full_name ?? "-"}</td>
                        <td className="w-[34%] px-3 py-3">
                          <WorkItemList rows={report.weekly_client_report_items} period="current" />
                        </td>
                        <td className="w-[34%] px-3 py-3">
                          <WorkItemList rows={report.weekly_client_report_items} period="next" />
                        </td>
                        <td className="px-3 py-3"><StatusBadge type="client" value={report.status} /></td>
                        <td className="px-3 py-3">{formatDateTime(report.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            )}
          </>
        }
      >
        <div className="grid gap-2 xl:grid-cols-[0.85fr_1.2fr_1fr]">
          <div className="rounded-2xl border border-[#d9e7f7] bg-white/88 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-slate-500">작성현황</p>
                <p className="text-lg font-black text-[#10223d]">
                  {reports.length}<span className="text-sm text-slate-500"> / {clientCount}</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="rounded-xl bg-[#f5f9ff] px-2 py-1">
                  <p className="text-[10px] font-black text-slate-500">전체</p>
                  <p className="text-xs font-black text-[#10223d]">{clientCount}</p>
                </div>
                <div className="rounded-xl bg-blue-50 px-2 py-1">
                  <p className="text-[10px] font-black text-blue-600">작성</p>
                  <p className="text-xs font-black text-[#075be8]">{reports.length}</p>
                </div>
                <div className="rounded-xl bg-rose-50 px-2 py-1">
                  <p className="text-[10px] font-black text-rose-600">미작성</p>
                  <p className="text-xs font-black text-rose-600">{missingCount}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[#d9e7f7] bg-white/88 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-slate-500">내용건수</p>
                <p className="text-lg font-black text-[#10223d]">{importanceStats.total}<span className="text-sm text-slate-500">건</span></p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex h-2 overflow-hidden rounded-full bg-slate-100">
                  {importanceStats.rows.map((row) => (
                    <span
                      key={row.importance}
                      className={row.barClassName}
                      style={{ width: `${row.ratio}%` }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <div className="grid gap-1 sm:grid-cols-4">
                  {importanceStats.rows.map((row) => (
                    <div key={row.importance} className="flex items-center justify-between gap-1 rounded-lg bg-[#f5f9ff] px-1.5 py-1">
                      <span className={cn("inline-flex rounded-md border px-1 py-0.5 text-[10px] font-black", row.badgeClassName)}>
                        {row.label}
                      </span>
                      <span className="text-[11px] font-black text-[#10223d]">{row.count}<span className="ml-0.5 text-slate-500">{row.ratio}%</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[#d9e7f7] bg-white/88 px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-black text-slate-500">물동량</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-1.5">
                <p className="text-xs font-black text-emerald-700">입고</p>
                <p className="break-words text-sm font-black text-[#10223d]">{inboundVolumeSummary}</p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-1.5">
                <p className="text-xs font-black text-blue-700">출고</p>
                <p className="break-words text-sm font-black text-[#10223d]">{outboundVolumeSummary}</p>
              </div>
            </div>
          </div>
        </div>
      </DepartmentSubmissionEditor>
    </>
  );
}
