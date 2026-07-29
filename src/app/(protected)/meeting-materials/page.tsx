import { VolumeComparisonChart, type VolumeChartRow } from "@/components/charts/VolumeComparisonChart";
import { EmptyState } from "@/components/common/EmptyState";
import { TableShell } from "@/components/common/TableShell";
import { MeetingFacilityConstructionBoard } from "@/components/reports/MeetingFacilityConstructionBoard";
import { MeetingMaterialsTable } from "@/components/reports/MeetingMaterialsTable";
import { MeetingMaterialsTabNav } from "@/components/reports/MeetingMaterialsTabNav";
import { MeetingPriorityPanel, type MeetingPriorityItem } from "@/components/reports/MeetingPriorityPanel";
import { MeetingHolidayWorkBoard } from "@/components/reports/MeetingHolidayWorkBoard";
import { MeetingMaterialsWeekFilter } from "@/components/reports/MeetingMaterialsWeekFilter";
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
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, volumeTypeLabels, volumeUnitLabels } from "@/lib/utils/labels";
import type { DepartmentSubmissionStatus, Importance, ItemPeriod, VolumeType, VolumeUnit } from "@/types/enums";

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
  department_id: string;
  client_id: string;
  departments?: { department_name: string } | null;
  clients?: { client_name: string } | null;
  weekly_client_report_items: {
    id: string;
    item_period: ItemPeriod;
    title: string | null;
    content: string;
    importance: Importance;
    work_categories: { category_name: string } | null;
    weekly_report_item_requests: ReportItemRequestRow[];
    request_target_key: string;
    request_target_type: "client_item" | "department_common";
    request_department_submission_id: string | null;
    request_item_sort_order: number | null;
  }[];
  weekly_volumes: { volume_type: VolumeType; quantity: number; unit: VolumeUnit }[];
};

type ReportItemRequestRow = {
  id: string;
  target_type: "client_item" | "department_common";
  target_key: string;
  report_item_id: string | null;
  department_submission_id: string | null;
  section_type: "common" | "facility" | "vacancy" | "holiday_work" | null;
  item_period: ItemPeriod | null;
  item_sort_order: number | null;
  request_content: string;
  request_author_name: string;
  request_author_department_name: string | null;
  result_content: string | null;
  result_author_name: string | null;
  result_author_department_name: string | null;
  result_created_by: string | null;
  result_created_at: string | null;
  result_updated_at: string | null;
  closed_by: string | null;
  closed_author_name: string | null;
  closed_author_department_name: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type DepartmentContentRow = {
  section_type: "common" | "facility" | "vacancy" | "holiday_work";
  current_importance: Importance;
  current_work_category_id: string | null;
  current_week_content: string;
  next_importance: Importance;
  next_work_category_id: string | null;
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

type WorkCategoryRow = {
  id: string;
  category_name: string;
};

type MeetingWorkItemRow = MeetingReportRow["weekly_client_report_items"][number];

type DepartmentCommonContentItem = {
  importance: Importance;
  work_category_id: string | null;
  title: string;
  content: string;
  sort_order: number;
};

type PriorityItemQueryRow = {
  id: string;
  item_period: ItemPeriod;
  title: string | null;
  content: string;
  importance: Extract<Importance, "very_high" | "high">;
  work_categories: { category_name: string } | null;
  weekly_client_reports: {
    department_id: string;
    client_id: string;
    departments: { department_name: string } | null;
    clients: { client_name: string } | null;
  } | null;
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
const COMMON_CONTENT_FORMAT = "department-common-items/v1";
const tabs: { value: MeetingTab; label: string }[] = [
  { value: "collection", label: "취합현황" },
  { value: "materials", label: "회의자료" },
  { value: "volumes", label: "물동량" },
  { value: "holiday", label: "공휴일" },
  { value: "facility", label: "시설공사" }
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

function getMeetingReportSelect(tab: MeetingTab) {
  if (tab === "collection") {
    return "id,department_id,client_id";
  }

  if (tab === "volumes") {
    return "id,department_id,client_id,clients(client_name),weekly_volumes(volume_type,quantity,unit)";
  }

  return "id,department_id,client_id,departments(department_name),clients(client_name),weekly_client_report_items(id,item_period,importance,title,content,work_categories(category_name))";
}

function getSubmissionSelect(tab: MeetingTab) {
  if (tab === "collection") {
    return "id,status,department_id,week_start_date,finalized_at";
  }

  if (tab === "holiday" || tab === "facility") {
    return "id,status,department_id,week_start_date,finalized_at,department_weekly_contents!inner(section_type,current_week_content,next_week_content)";
  }

  return "id,status,department_id,week_start_date,finalized_at,department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content)";
}

function getDepartmentContentSection(tab: MeetingTab): DepartmentContentRow["section_type"] | null {
  if (tab === "facility") {
    return "facility";
  }
  if (tab === "holiday") {
    return "holiday_work";
  }
  return null;
}

function makeChartRows(reports: MeetingReportRow[]): VolumeChartRow[] {
  const grouped = new Map<string, { current: number; previous: number }>();
  reports.forEach((report) => {
    (report.weekly_volumes ?? []).forEach((volume) => {
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

function makePriorityItems(rows: PriorityItemQueryRow[]): MeetingPriorityItem[] {
  return rows
    .filter((row) => row.weekly_client_reports)
    .map((row) => ({
      id: row.id,
      title: row.title?.trim() || row.content.split("\n")[0]?.trim() || "제목 없음",
      content: row.content,
      importance: row.importance,
      period: row.item_period,
      categoryName: row.work_categories?.category_name ?? "기타",
      departmentName: row.weekly_client_reports?.departments?.department_name ?? "-",
      clientName: row.weekly_client_reports?.clients?.client_name ?? "-"
    }))
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

function normalizeImportance(value: unknown, fallback: Importance): Importance {
  return value === "very_high" || value === "high" || value === "medium" || value === "low" ? value : fallback;
}

function parseDepartmentCommonItems(
  value: string,
  fallbackImportance: Importance,
  fallbackCategoryId: string | null
): DepartmentCommonContentItem[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue) as {
      format?: string;
      items?: Array<Partial<DepartmentCommonContentItem>>;
    };
    if (parsed.format === COMMON_CONTENT_FORMAT && Array.isArray(parsed.items)) {
      return parsed.items
        .map((item, index) => ({
          importance: normalizeImportance(item.importance, fallbackImportance),
          work_category_id:
            typeof item.work_category_id === "string" && item.work_category_id ? item.work_category_id : fallbackCategoryId,
          title: String(item.title ?? ""),
          content: String(item.content ?? ""),
          sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : index
        }))
        .filter((item) => item.title.trim() || item.content.trim())
        .sort((left, right) => left.sort_order - right.sort_order);
    }
  } catch {
    // Old plain text content is displayed as a single row.
  }

  return [
    {
      importance: fallbackImportance,
      work_category_id: fallbackCategoryId,
      title: "공통사항",
      content: trimmedValue,
      sort_order: 0
    }
  ];
}

function makeCommonMeetingRows(submissions: SubmissionRow[], departments: DepartmentRow[], categories: WorkCategoryRow[]): MeetingReportRow[] {
  const departmentNameMap = new Map(departments.map((department) => [department.id, department.department_name]));
  const categoryNameMap = new Map(categories.map((category) => [category.id, category.category_name]));
  const commonRows: MeetingReportRow[] = [];

  submissions.forEach((submission) => {
    const commonContent = submission.department_weekly_contents.find((content) => content.section_type === "common");
    if (!commonContent) {
      return;
    }

    const currentItems = parseDepartmentCommonItems(
      commonContent.current_week_content,
      commonContent.current_importance,
      commonContent.current_work_category_id
    ).map<MeetingWorkItemRow>((item) => ({
      id: `${submission.id}:common:current:${item.sort_order}`,
      item_period: "current",
      title: item.title,
      content: item.content,
      importance: item.importance,
      work_categories: { category_name: item.work_category_id ? categoryNameMap.get(item.work_category_id) ?? "기타" : "기타" },
      weekly_report_item_requests: [],
      request_target_key: `${submission.id}:common:current:${item.sort_order}`,
      request_target_type: "department_common",
      request_department_submission_id: submission.id,
      request_item_sort_order: item.sort_order
    }));

    const nextItems = parseDepartmentCommonItems(
      commonContent.next_week_content,
      commonContent.next_importance,
      commonContent.next_work_category_id
    ).map<MeetingWorkItemRow>((item) => ({
      id: `${submission.id}:common:next:${item.sort_order}`,
      item_period: "next",
      title: item.title,
      content: item.content,
      importance: item.importance,
      work_categories: { category_name: item.work_category_id ? categoryNameMap.get(item.work_category_id) ?? "기타" : "기타" },
      weekly_report_item_requests: [],
      request_target_key: `${submission.id}:common:next:${item.sort_order}`,
      request_target_type: "department_common",
      request_department_submission_id: submission.id,
      request_item_sort_order: item.sort_order
    }));

    if (currentItems.length === 0 && nextItems.length === 0) {
      return;
    }

    commonRows.push({
      id: `${submission.id}-common`,
      department_id: submission.department_id,
      client_id: "common",
      departments: { department_name: departmentNameMap.get(submission.department_id) ?? "-" },
      clients: { client_name: "공통사항" },
      weekly_client_report_items: [...currentItems, ...nextItems],
      weekly_volumes: []
    });
  });

  return commonRows;
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
  let priorityItemRows: PriorityItemQueryRow[] = [];
  let submissions: SubmissionRow[] = [];
  let workCategories: WorkCategoryRow[] = [];
  let commonReports: MeetingReportRow[] = [];

  if (supabase && profile) {
    let dataClient = supabase;
    try {
      dataClient = createSupabaseAdminClient();
    } catch {
      dataClient = supabase;
    }
    let materialsDepartmentLimit: string | undefined;
    if (isAdmin(profile) && activeTab === "materials" && !params.department_id && !params.client_id) {
      const { data: firstDepartment } = await dataClient
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
    const needsDepartments = activeTab === "collection" || activeTab === "materials" || activeTab === "holiday" || activeTab === "facility";
    const needsClients = activeTab === "collection";
    const needsReports = activeTab === "collection" || activeTab === "materials" || activeTab === "volumes";
    const needsSubmissions = activeTab === "collection" || activeTab === "materials" || activeTab === "holiday" || activeTab === "facility";
    const contentSectionFilter = getDepartmentContentSection(activeTab);

    const [departmentResult, clientResult, reportResult, priorityItemResult, submissionResult, categoryResult] = await Promise.all([
      needsDepartments
        ? (() => {
            let query = dataClient
              .from("departments")
              .select("id,department_name")
              .eq("is_active", true)
              .order("sort_order", { ascending: true })
              .order("department_name", { ascending: true });
            if (departmentFilter) {
              query = query.eq("id", departmentFilter);
            }
            return query;
          })()
        : Promise.resolve({ data: [] }),
      needsClients
        ? (() => {
            let query = dataClient
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
          })()
        : Promise.resolve({ data: [] }),
      needsReports
        ? (() => {
            let query = dataClient
              .from("weekly_client_reports")
              .select(getMeetingReportSelect(activeTab))
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
          })()
        : Promise.resolve({ data: [], error: null }),
      activeTab === "collection"
        ? (() => {
            let query = dataClient
              .from("weekly_client_report_items")
              .select(
                "id,item_period,title,content,importance,work_categories(category_name),weekly_client_reports!inner(department_id,client_id,departments(department_name),clients(client_name))"
              )
              .in("importance", ["very_high", "high"])
              .eq("weekly_client_reports.week_start_date", selectedWeek.weekStartDate)
              .is("weekly_client_reports.deleted_at", null)
              .limit(MEETING_REPORT_LIMIT);
            if (departmentFilter) {
              query = query.eq("weekly_client_reports.department_id", departmentFilter);
            }
            if (params.client_id) {
              query = query.eq("weekly_client_reports.client_id", params.client_id);
            }
            return query;
          })()
        : Promise.resolve({ data: [] }),
      needsSubmissions
        ? (() => {
            let query = dataClient
              .from("department_weekly_submissions")
              .select(getSubmissionSelect(activeTab))
              .eq("week_start_date", selectedWeek.weekStartDate)
              .is("deleted_at", null)
              .limit(MEETING_REPORT_LIMIT);
            if (departmentFilter) {
              query = query.eq("department_id", departmentFilter);
            }
            if (contentSectionFilter) {
              query = query.eq("department_weekly_contents.section_type", contentSectionFilter);
            }
            return query;
          })()
        : Promise.resolve({ data: [] }),
      activeTab === "materials"
        ? dataClient.from("work_categories").select("id,category_name").eq("is_active", true).order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] })
    ]);

    departments = (departmentResult.data ?? []) as DepartmentRow[];
    clients = ((clientResult.data ?? []) as ClientLinkSummaryRow[]).map((link) => ({
      id: link.client_id,
      department_id: link.department_id
    }));
    reports = ((reportResult.error ? [] : reportResult.data ?? []) as unknown as MeetingReportRow[]).map((report) => ({
      ...report,
      weekly_client_report_items: (report.weekly_client_report_items ?? []).map((item) => ({
        ...item,
        weekly_report_item_requests: [],
        request_target_key: item.id,
        request_target_type: "client_item" as const,
        request_department_submission_id: null,
        request_item_sort_order: null
      })),
      weekly_volumes: report.weekly_volumes ?? []
    }));
    priorityItemRows = (priorityItemResult.data ?? []) as unknown as PriorityItemQueryRow[];
    submissions = ((submissionResult.data ?? []) as unknown as SubmissionRow[]).map((submission) => ({
      ...submission,
      department_weekly_contents: submission.department_weekly_contents ?? []
    }));
    workCategories = (categoryResult.data ?? []) as WorkCategoryRow[];
    commonReports = activeTab === "materials" ? makeCommonMeetingRows(submissions, departments, workCategories) : [];
    if (activeTab === "materials") {
      const materialTargetKeys = [...commonReports, ...reports].flatMap((report) =>
        report.weekly_client_report_items.map((item) => item.request_target_key)
      );
      if (materialTargetKeys.length > 0) {
        const { data: requestRows } = await dataClient
          .from("weekly_report_item_requests")
          .select(
            "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at"
          )
          .in("target_key", materialTargetKeys)
          .is("deleted_at", null)
          .order("created_at", { ascending: true });
        const requestMap = new Map<string, ReportItemRequestRow[]>();
        ((requestRows ?? []) as ReportItemRequestRow[]).forEach((request) => {
          const rows = requestMap.get(request.target_key) ?? [];
          rows.push(request);
          requestMap.set(request.target_key, rows);
        });
        const attachRequests = (rows: MeetingReportRow[]) =>
          rows.map((report) => ({
            ...report,
            weekly_client_report_items: report.weekly_client_report_items.map((item) => ({
              ...item,
              weekly_report_item_requests: requestMap.get(item.request_target_key) ?? []
            }))
          }));
        commonReports = attachRequests(commonReports);
        reports = attachRequests(reports);
      }
    }
  }

  const chartRows = activeTab === "volumes" ? makeChartRows(reports) : [];
  const priorityItems = activeTab === "collection" ? makePriorityItems(priorityItemRows) : [];
  const materialRows = activeTab === "materials" ? [...commonReports, ...reports] : reports;
  const { clientCountMap, writtenClientMap } =
    activeTab === "collection" ? countByDepartment(clients, reports) : { clientCountMap: new Map(), writtenClientMap: new Map() };

  return (
    <div className="space-y-4">
      <div className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/82 p-2 shadow-[0_14px_34px_rgba(16,34,61,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MeetingMaterialsTabNav
            activeTab={activeTab}
            tabs={tabs.map((tab) => ({
              ...tab,
              href: buildTabHref(tab.value, params, selectedWeek)
            }))}
          />
          <MeetingMaterialsWeekFilter defaultWeekStartDate={selectedWeek.weekStartDate} />
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
      {activeTab === "materials" ? (
        <MeetingMaterialsTable
          key={`materials-${selectedWeek.weekStartDate}-${params.department_id ?? "all"}-${params.client_id ?? "all"}`}
          reports={materialRows}
          currentUserId={profile?.id ?? ""}
          canManageAllRequests={isAdmin(profile)}
        />
      ) : null}
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
