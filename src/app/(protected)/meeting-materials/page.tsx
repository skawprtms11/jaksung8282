import Link from "next/link";
import { BarChart3, CalendarDays, ClipboardCheck, FileText, Hammer, Search } from "lucide-react";
import { VolumeComparisonChart, type VolumeChartRow } from "@/components/charts/VolumeComparisonChart";
import { EmptyState } from "@/components/common/EmptyState";
import { TableShell } from "@/components/common/TableShell";
import { MeetingFacilityConstructionBoard } from "@/components/reports/MeetingFacilityConstructionBoard";
import { MeetingPriorityPanel, type MeetingPriorityItem } from "@/components/reports/MeetingPriorityPanel";
import { MeetingHolidayWorkBoard } from "@/components/reports/MeetingHolidayWorkBoard";
import { WeekSelect } from "@/components/reports/WeekSelect";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import {
  getCurrentWeekOption,
  getReportMonthByThursday,
  getWeekEndDate,
  getWeekOfMonth,
  resolveWeekFromSelection,
  type WeekOption
} from "@/lib/dates/week";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, volumeTypeLabels, volumeUnitLabels } from "@/lib/utils/labels";
import type { ClientReportStatus, DepartmentSubmissionStatus, Importance, ItemPeriod, VolumeType, VolumeUnit } from "@/types/enums";

type MeetingTab = "collection" | "materials" | "volumes" | "holiday" | "facility";

type DepartmentRow = {
  id: string;
  department_name: string;
};

type ClientSummaryRow = {
  id: string;
  department_id: string;
};

type ClientLinkSummaryRow = { department_id: string; client_id: string };

type MeetingReportRow = {
  id: string;
  created_by: string;
  department_id: string;
  client_id: string;
  report_year: number;
  report_month: number;
  week_of_month: number;
  week_start_date: string;
  week_end_date: string;
  status: ClientReportStatus;
  updated_at: string;
  departments: { department_name: string } | null;
  clients: { client_name: string } | null;
  profiles: { full_name: string } | null;
  weekly_client_report_items: {
    id: string;
    item_period: ItemPeriod;
    title: string | null;
    content: string;
    importance: Importance;
    work_categories: { category_name: string } | null;
  }[];
  weekly_volumes: { volume_type: VolumeType; quantity: number; unit: VolumeUnit }[];
};

type DepartmentContentRow = {
  section_type: "common" | "facility" | "vacancy" | "holiday_work";
  current_week_content: string;
  next_week_content: string;
};

type SubmissionRow = {
  id: string;
  status: DepartmentSubmissionStatus;
  department_id: string;
  week_start_date: string;
  finalized_at: string | null;
  department_weekly_contents: DepartmentContentRow[];
};

type MeetingSearchParams = {
  tab?: string;
  department_id?: string;
  client_id?: string;
  report_year?: string;
  report_month?: string;
  week_of_month?: string;
  week_start_date?: string;
};

const MEETING_REPORT_LIMIT = 500;
const tabs: { value: MeetingTab; label: string; icon: typeof ClipboardCheck }[] = [
  { value: "collection", label: "취합현황", icon: ClipboardCheck },
  { value: "materials", label: "회의자료", icon: FileText },
  { value: "volumes", label: "물동량", icon: BarChart3 },
  { value: "holiday", label: "공휴일", icon: CalendarDays },
  { value: "facility", label: "시설공사", icon: Hammer }
];

function getActiveTab(value?: string): MeetingTab {
  return tabs.some((tab) => tab.value === value) ? (value as MeetingTab) : "collection";
}

function makeWeekFromStartDate(weekStartDate: string): WeekOption {
  const { year, month } = getReportMonthByThursday(weekStartDate);
  const weekOfMonth = getWeekOfMonth(weekStartDate);
  const weekEndDate = getWeekEndDate(weekStartDate);
  return {
    year,
    month,
    weekOfMonth,
    weekStartDate,
    weekEndDate,
    label: `${year}년 ${month}월 ${weekOfMonth}주차 · ${weekStartDate.replaceAll("-", ".")} ~ ${weekEndDate.replaceAll("-", ".")}`
  };
}

function getSelectedWeek(params: MeetingSearchParams) {
  if (params.week_start_date && /^\d{4}-\d{2}-\d{2}$/.test(params.week_start_date)) {
    return makeWeekFromStartDate(params.week_start_date);
  }

  const year = Number(params.report_year);
  const month = Number(params.report_month);
  const weekOfMonth = Number(params.week_of_month);
  if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(weekOfMonth)) {
    try {
      return resolveWeekFromSelection(year, month, weekOfMonth);
    } catch {
      return getCurrentWeekOption();
    }
  }

  return getCurrentWeekOption();
}

function buildTabHref(tab: MeetingTab, params: MeetingSearchParams, selectedWeek: WeekOption) {
  const nextParams = new URLSearchParams({
    tab,
    report_year: String(selectedWeek.year),
    report_month: String(selectedWeek.month),
    week_of_month: String(selectedWeek.weekOfMonth),
    week_start_date: selectedWeek.weekStartDate
  });
  if (params.department_id) {
    nextParams.set("department_id", params.department_id);
  }
  if (params.client_id) {
    nextParams.set("client_id", params.client_id);
  }
  return `/meeting-materials?${nextParams.toString()}`;
}

function makeChartRows(reports: MeetingReportRow[]): VolumeChartRow[] {
  const grouped = new Map<string, { current: number; previous: number }>();
  reports.forEach((report) => {
    report.weekly_volumes.forEach((volume) => {
      const key = `${report.clients?.client_name ?? "화주"} ${volumeTypeLabels[volume.volume_type]}/${volumeUnitLabels[volume.unit]}`;
      const current = grouped.get(key) ?? { current: 0, previous: 0 };
      current.current += Number(volume.quantity);
      grouped.set(key, current);
    });
  });
  return Array.from(grouped.entries()).map(([name, value]) => {
    const changeLabel =
      value.previous === 0 && value.current > 0
        ? "신규"
        : value.previous === 0
          ? "0%"
          : `${Math.round(((value.current - value.previous) / value.previous) * 100)}%`;
    return { name, current: value.current, previous: value.previous, changeLabel };
  });
}

function makePriorityItems(reports: MeetingReportRow[]): MeetingPriorityItem[] {
  return reports
    .flatMap((report) =>
      report.weekly_client_report_items
        .filter((item) => item.importance === "very_high" || item.importance === "high")
        .map((item) => ({
          id: item.id,
          title: item.title?.trim() || item.content.split("\n")[0]?.trim() || "제목 없음",
          content: item.content,
          importance: item.importance as MeetingPriorityItem["importance"],
          period: item.item_period,
          categoryName: item.work_categories?.category_name ?? "기타",
          departmentName: report.departments?.department_name ?? "-",
          clientName: report.clients?.client_name ?? "-"
        }))
    )
    .sort((left, right) => {
      if (left.importance !== right.importance) {
        return left.importance === "very_high" ? -1 : 1;
      }
      return left.departmentName.localeCompare(right.departmentName, "ko");
    });
}

function countByDepartment(clients: ClientSummaryRow[], reports: MeetingReportRow[]) {
  const clientCountMap = new Map<string, number>();
  clients.forEach((client) => {
    if (!client.department_id) {
      return;
    }
    clientCountMap.set(client.department_id, (clientCountMap.get(client.department_id) ?? 0) + 1);
  });

  const writtenClientMap = new Map<string, Set<string>>();
  reports.forEach((report) => {
    const writtenClients = writtenClientMap.get(report.department_id) ?? new Set<string>();
    writtenClients.add(report.client_id);
    writtenClientMap.set(report.department_id, writtenClients);
  });

  return { clientCountMap, writtenClientMap };
}

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

function compactDepartmentStatus(status: DepartmentSubmissionStatus | null) {
  if (!status) {
    return { label: "미작성", className: "border-slate-200 bg-slate-50 text-slate-600" };
  }
  if (status === "draft") {
    return { label: "작성 중", className: "border-slate-200 bg-slate-50 text-slate-700" };
  }
  if (status === "submitted_to_division") {
    return { label: "검토", className: "border-blue-200 bg-blue-50 text-blue-700" };
  }
  if (status === "division_approved") {
    return { label: "승인", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  return { label: "반려", className: "border-rose-200 bg-rose-50 text-rose-700" };
}

export default async function MeetingMaterialsPage({
  searchParams
}: {
  searchParams: Promise<MeetingSearchParams>;
}) {
  const params = await searchParams;
  const activeTab = getActiveTab(params.tab);
  const selectedWeek = getSelectedWeek(params);
  const { profile } = await getCurrentUserProfile();
  const supabase = await createSupabaseServerClient();
  let departments: DepartmentRow[] = [];
  let clients: ClientSummaryRow[] = [];
  let reports: MeetingReportRow[] = [];
  let submissions: SubmissionRow[] = [];

  if (supabase && profile) {
    let materialsDepartmentLimit: string | undefined;
    if (isAdmin(profile) && activeTab === "materials" && !params.department_id && !params.client_id) {
      const { data: firstDepartment } = await supabase
        .from("departments")
        .select("id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("department_name", { ascending: true })
        .limit(1)
        .maybeSingle();
      materialsDepartmentLimit = firstDepartment?.id;
    }
    const departmentFilter = isAdmin(profile) ? params.department_id ?? materialsDepartmentLimit : profile.department_id;
    const [{ data: departmentData }, { data: clientData }, { data: reportData, error: reportError }, { data: submissionData }] =
      await Promise.all([
        (() => {
          let query = supabase
            .from("departments")
            .select("id,department_name")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .order("department_name", { ascending: true });
          if (departmentFilter) {
            query = query.eq("id", departmentFilter);
          }
          return query;
        })(),
        (() => {
          let query = supabase
            .from("department_client_links")
            .select("department_id,client_id")
            .eq("is_active", true);
          if (departmentFilter) {
            query = query.eq("department_id", departmentFilter);
          }
          if (params.client_id) {
            query = query.eq("client_id", params.client_id);
          }
          return query;
        })(),
        (() => {
          let query = supabase
            .from("weekly_client_reports")
            .select(
              "id,created_by,department_id,client_id,report_year,report_month,week_of_month,week_start_date,week_end_date,status,updated_at,departments(department_name),clients(client_name),weekly_client_report_items(id,item_period,importance,title,content,work_categories(category_name)),weekly_volumes(volume_type,quantity,unit)"
            )
            .eq("week_start_date", selectedWeek.weekStartDate)
            .is("deleted_at", null)
            .order("updated_at", { ascending: false })
            .limit(MEETING_REPORT_LIMIT);
          if (departmentFilter) {
            query = query.eq("department_id", departmentFilter);
          }
          if (params.client_id) {
            query = query.eq("client_id", params.client_id);
          }
          return query;
        })(),
        (() => {
          let query = supabase
            .from("department_weekly_submissions")
            .select("id,status,department_id,week_start_date,finalized_at,department_weekly_contents(section_type,current_week_content,next_week_content)")
            .eq("week_start_date", selectedWeek.weekStartDate)
            .is("deleted_at", null)
            .limit(MEETING_REPORT_LIMIT);
          if (departmentFilter) {
            query = query.eq("department_id", departmentFilter);
          }
          return query;
        })()
      ]);

    departments = (departmentData ?? []) as DepartmentRow[];
    clients = ((clientData ?? []) as ClientLinkSummaryRow[]).map((link) => ({
      id: link.client_id,
      department_id: link.department_id
    }));
    const reportRows = reportError ? [] : ((reportData ?? []) as unknown as MeetingReportRow[]);
    if (reportRows.length > 0) {
      const creatorIds = Array.from(new Set(reportRows.map((report) => report.created_by)));
      const { data: creatorData } = await supabase.from("profiles").select("id,full_name").in("id", creatorIds);
      const creatorNameMap = new Map((creatorData ?? []).map((creator) => [creator.id, creator.full_name]));
      reports = reportRows.map((report) => ({
        ...report,
        profiles: { full_name: creatorNameMap.get(report.created_by) ?? "-" }
      }));
    }
    submissions = (submissionData ?? []) as unknown as SubmissionRow[];
  }

  const chartRows = makeChartRows(reports);
  const priorityItems = makePriorityItems(reports);
  const { clientCountMap, writtenClientMap } = countByDepartment(clients, reports);

  return (
    <div className="space-y-4">
      <div className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/82 p-2 shadow-[0_14px_34px_rgba(16,34,61,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-[1rem] bg-[#f5f9ff] p-1 lg:grid-cols-5" aria-label="회의자료 화면 탭">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.value;
              return (
                <Link
                  key={tab.value}
                  href={buildTabHref(tab.value, params, selectedWeek)}
                  className={cn(
                    "relative flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-extrabold tracking-normal transition",
                    isSelected
                      ? "bg-white text-[#075be8] shadow-[0_8px_18px_rgba(7,91,232,0.12)]"
                      : "text-slate-500 hover:bg-white/70 hover:text-[#10223d]"
                  )}
                  aria-current={isSelected ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                  {isSelected ? (
                    <span className="absolute bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-[#075be8]" aria-hidden="true" />
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <form className="flex shrink-0 flex-wrap items-center justify-end gap-2" method="get">
            <input type="hidden" name="tab" value={activeTab} />
            {params.department_id ? <input type="hidden" name="department_id" value={params.department_id} /> : null}
            {params.client_id ? <input type="hidden" name="client_id" value={params.client_id} /> : null}
            <div className="rounded-full border border-[#dbe8fb] bg-white/90 px-2 py-1.5 shadow-[0_10px_22px_rgba(16,34,61,0.05)]">
              <WeekSelect
                defaultWeekStartDate={selectedWeek.weekStartDate}
                compactWeekLabel
                className="flex flex-wrap items-center gap-1.5"
                labelClassName="flex items-center gap-1 text-[11px] font-black text-slate-500"
                weekLabelClassName="flex items-center gap-1 text-[11px] font-black text-slate-500"
                controlClassName="h-8 w-[78px] rounded-full border border-[#d7e4f6] bg-[#f5f9ff] px-2 text-sm font-black text-[#10223d] outline-none"
              />
            </div>
            <button className="tool-button tool-button-primary min-h-9 py-1.5">
              <Search className="h-4 w-4" aria-hidden="true" />
              조회
            </button>
          </form>
        </div>
      </div>

      {activeTab === "collection" ? (
        <CollectionView
          departments={departments}
          reports={reports}
          submissions={submissions}
          priorityItems={priorityItems}
          clientCountMap={clientCountMap}
          writtenClientMap={writtenClientMap}
        />
      ) : null}
      {activeTab === "materials" ? <MaterialsView reports={reports} /> : null}
      {activeTab === "volumes" ? <VolumesView chartRows={chartRows} reports={reports} /> : null}
      {activeTab === "holiday" ? (
        <MeetingHolidayWorkBoard departments={departments} submissions={submissions} selectedWeek={selectedWeek} />
      ) : null}
      {activeTab === "facility" ? <MeetingFacilityConstructionBoard departments={departments} submissions={submissions} /> : null}
    </div>
  );
}

function CollectionView({
  departments,
  reports,
  submissions,
  priorityItems,
  clientCountMap,
  writtenClientMap
}: {
  departments: DepartmentRow[];
  reports: MeetingReportRow[];
  submissions: SubmissionRow[];
  priorityItems: MeetingPriorityItem[];
  clientCountMap: Map<string, number>;
  writtenClientMap: Map<string, Set<string>>;
}) {
  return (
    <div className="grid w-full gap-3 xl:grid-cols-2">
      <MeetingPriorityPanel items={priorityItems} />
      <section className="sketch-panel p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#10223d]">부서별 작성 모니터링</p>
            <p className="text-xs font-bold text-slate-500">작성완료 여부를 빠르게 확인합니다.</p>
          </div>
          <span className="section-chip">자료 {reports.length}건</span>
        </div>
        <TableShell>
          <table className="table-sticky w-full table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-2 py-2.5">부서</th>
                <th className="px-2 py-2.5">화주</th>
                <th className="px-2 py-2.5">미작성</th>
                <th className="px-2 py-2.5">상태</th>
                <th className="px-2 py-2.5">확정일</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => {
                const totalClients = clientCountMap.get(department.id) ?? 0;
                const writtenClients = writtenClientMap.get(department.id)?.size ?? 0;
                const missingClients = Math.max(totalClients - writtenClients, 0);
                const submission = submissions.find((row) => row.department_id === department.id);
                const status = compactDepartmentStatus(submission?.status ?? null);
                return (
                  <tr key={department.id} className="border-t border-slate-100">
                    <td className="truncate px-2 py-2.5 font-black text-[#10223d]" title={department.department_name}>
                      {department.department_name}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="font-black text-[#075be8]">{writtenClients}</span>
                      <span className="text-slate-400"> / {totalClients}</span>
                    </td>
                    <td className="px-2 py-2.5">{missingClients}</td>
                    <td className="px-2 py-2.5">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 font-black", status.className)}>
                        {status.label}
                      </span>
                    </td>
                    <td className="truncate px-2 py-2.5">{formatDateTime(submission?.finalized_at).split(" ")[0]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      </section>
    </div>
  );
}

function MaterialsView({ reports }: { reports: MeetingReportRow[] }) {
  if (reports.length === 0) {
    return <EmptyState title="선택한 주차의 회의자료가 없습니다." />;
  }
  return (
    <TableShell>
      <table className="table-sticky w-full min-w-[1100px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[190px]" />
          <col className="w-[455px]" />
          <col className="w-[455px]" />
        </colgroup>
        <thead>
          <tr>
            <th className="px-3 py-3">화주</th>
            <th className="px-3 py-3">금주 실시사항</th>
            <th className="px-3 py-3">차주 예정사항</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id} className="border-t border-slate-100 align-top">
              <td className="px-3 py-4">
                <div className="font-black text-[#10223d]">{report.clients?.client_name ?? "-"}</div>
                <div className="mt-1 text-xs font-bold text-slate-400">{report.departments?.department_name ?? "-"}</div>
              </td>
              <td className="px-3 py-4">
                <MeetingWorkItemList rows={report.weekly_client_report_items} period="current" />
              </td>
              <td className="px-3 py-4">
                <MeetingWorkItemList rows={report.weekly_client_report_items} period="next" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function MeetingWorkItemList({ rows, period }: { rows: MeetingReportRow["weekly_client_report_items"]; period: ItemPeriod }) {
  const values = rows.filter((row) => row.item_period === period);
  if (values.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <ol className="space-y-3">
      {values.map((row, index) => (
        <li key={`${period}-${row.id}-${index}`} className="flex gap-2.5 rounded-2xl bg-[#f8fbff] px-3 py-2.5">
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
            <span className="block break-words text-[15px] font-black leading-6 text-[#10223d]">
              {row.title?.trim() || "제목 없음"}
            </span>
            <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{row.content}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function VolumesView({ chartRows, reports }: { chartRows: VolumeChartRow[]; reports: MeetingReportRow[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_460px]">
      <VolumeComparisonChart rows={chartRows} />
      <section className="sketch-panel p-4">
        <h2 className="section-doodle-title mb-3">물동량 요약</h2>
        {reports.length === 0 ? (
          <EmptyState title="선택한 주차의 물동량 데이터가 없습니다." />
        ) : (
          <TableShell>
            <table className="table-sticky w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-3">화주</th>
                  <th className="px-3 py-3">물동량</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 font-black text-[#10223d]">{report.clients?.client_name ?? "-"}</td>
                    <td className="px-3 py-3">
                      {report.weekly_volumes.map((volume) => `${volumeTypeLabels[volume.volume_type]} ${volume.quantity}${volumeUnitLabels[volume.unit]}`).join(", ") || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </section>
    </div>
  );
}
