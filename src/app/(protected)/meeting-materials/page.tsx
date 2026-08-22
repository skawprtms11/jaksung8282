import { Suspense } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, ClipboardList, Percent } from "lucide-react";
import type { VolumeChartRow } from "@/components/charts/VolumeComparisonChart";
import { TableShell } from "@/components/common/TableShell";
import { MeetingMaterialsWorkspace } from "@/components/reports/MeetingMaterialsWorkspace";
import type {
  MeetingDepartmentVolumeRow,
  MeetingDepartmentVolumeValue
} from "@/components/reports/MeetingDepartmentVolumeBoard";
import type { MeetingOpenRequestItem, MeetingPriorityItem } from "@/components/reports/MeetingPriorityPanel";
import { MeetingMaterialsWeekFilter } from "@/components/reports/MeetingMaterialsWeekFilter";
import { DepartmentCommonSearchToolbar } from "@/components/reports/DepartmentCommonSearchToolbar";
import { DepartmentMemoButton } from "@/components/reports/DepartmentMemoButton";
import { MemoStatusButton } from "@/components/reports/MemoStatusButton";
import type { DepartmentOpenRequestItem } from "@/components/reports/DepartmentOpenRequestBoard";
import { loadWeekMemosAction, type WeekMemoItem } from "@/actions/reports";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canViewMeetingMaterials, isAdmin, type ProfileSummary } from "@/lib/auth/permissions";
import {
  getCurrentWeekOption,
  getReportMonthByThursday,
  getWeekEndDate,
  getWeekOfMonth,
  resolveWeekFromSelection,
  type WeekOption
} from "@/lib/dates/week";
import { loadMeetingReportAuthorNames } from "@/lib/reports/meeting-report-authors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  filterClientReportSearchItems,
  hasClientReportSearchFilters,
  parseClientReportSearchFilters,
  parseDepartmentCommonContentItems,
  type ClientReportSearchFilters
} from "@/lib/reports/client-report-search";
import { makeConfirmationRequestItems, makePriorityOpenRequestItems } from "@/lib/reports/meeting-materials-tab-data";
import { cn } from "@/lib/utils/cn";
import { formatCompactDate } from "@/lib/utils/labels";
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

type VolumeTrendReportRow = Pick<MeetingReportRow, "id" | "department_id" | "client_id" | "weekly_volumes"> & {
  week_of_month: number;
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
  deleted_at?: string | null;
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
  departments?: { department_name: string } | null;
  department_weekly_contents: DepartmentContentRow[];
};

type WorkCategoryRow = {
  id: string;
  category_name: string;
};

type MeetingWorkItemRow = MeetingReportRow["weekly_client_report_items"][number];

type OpenRequestQueryRow = ReportItemRequestRow & {
  weekly_client_report_items?: {
    id: string;
    item_period: ItemPeriod;
    title: string | null;
    content: string;
    importance: Importance;
    work_categories: { category_name: string } | null;
    weekly_client_reports: {
      id: string;
      department_id: string;
      client_id: string;
      week_start_date: string;
      report_year: number;
      report_month: number;
      week_of_month: number;
      departments: { department_name: string } | null;
      clients: { client_name: string } | null;
    } | null;
  } | null;
  department_weekly_submissions?: {
    id: string;
    department_id: string;
    week_start_date: string;
    report_year: number;
    report_month: number;
    week_of_month: number;
    departments: { department_name: string } | null;
    department_weekly_contents: DepartmentContentRow[];
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
  q?: string;
  search_data?: string;
  work_category_id?: string;
  importance?: string;
  title?: string;
  current_content?: string;
  next_content?: string;
  date_from?: string;
  date_to?: string;
};

type MeetingMaterialsPayload = {
  resolvedDepartmentId: string | null;
  departments: DepartmentRow[];
  clients: ClientSummaryRow[];
  reports: MeetingReportRow[];
  openRequests: OpenRequestQueryRow[];
  submissions: SubmissionRow[];
  workCategories: WorkCategoryRow[];
  commonMaterialRequests: ReportItemRequestRow[];
  volumeTrendReports: VolumeTrendReportRow[];
  previousVolumeTrendReports: VolumeTrendReportRow[];
};

function isMeetingMaterialsPayload(value: unknown): value is MeetingMaterialsPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const payload = value as Partial<MeetingMaterialsPayload>;
  return (
    Array.isArray(payload.departments) &&
    Array.isArray(payload.clients) &&
    Array.isArray(payload.reports) &&
    Array.isArray(payload.openRequests) &&
    Array.isArray(payload.submissions) &&
    Array.isArray(payload.workCategories) &&
    Array.isArray(payload.commonMaterialRequests) &&
    Array.isArray(payload.volumeTrendReports) &&
    Array.isArray(payload.previousVolumeTrendReports)
  );
}

function normalizeMeetingReports(rows: MeetingReportRow[]) {
  return rows.map((report) => ({
    ...report,
    weekly_client_report_items: (report.weekly_client_report_items ?? []).map((item) => ({
      ...item,
      weekly_report_item_requests: (item.weekly_report_item_requests ?? [])
        .filter((request) => !request.deleted_at)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
      request_target_key: item.id,
      request_target_type: "client_item" as const,
      request_department_submission_id: null,
      request_item_sort_order: null
    })),
    weekly_volumes: report.weekly_volumes ?? []
  }));
}

function attachCommonMaterialRequests(rows: MeetingReportRow[], requests: ReportItemRequestRow[]) {
  const commonTargetKeys = rows.flatMap((report) =>
    report.weekly_client_report_items.map((item) => item.request_target_key)
  );
  if (commonTargetKeys.length === 0) {
    return rows;
  }

  const commonTargetKeySet = new Set(commonTargetKeys);
  const requestMap = new Map<string, ReportItemRequestRow[]>();
  requests.forEach((request) => {
    if (!commonTargetKeySet.has(request.target_key)) {
      return;
    }
    const requestRows = requestMap.get(request.target_key) ?? [];
    requestRows.push(request);
    requestMap.set(request.target_key, requestRows);
  });

  return rows.map((report) => ({
    ...report,
    weekly_client_report_items: report.weekly_client_report_items.map((item) => ({
      ...item,
      weekly_report_item_requests: requestMap.get(item.request_target_key) ?? []
    }))
  }));
}

const MEETING_REPORT_LIMIT = 500;
const OPEN_REQUEST_COMPATIBILITY_SELECT =
  "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,deleted_at,weekly_client_report_items(id,item_period,title,content,importance,work_categories(category_name),weekly_client_reports(id,department_id,client_id,week_start_date,report_year,report_month,week_of_month,departments(department_name),clients(client_name))),department_weekly_submissions(id,department_id,week_start_date,report_year,report_month,week_of_month,departments(department_name),department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content))";
const MeetingPriorityPanel = dynamic(() => import("@/components/reports/MeetingPriorityPanel").then((mod) => mod.MeetingPriorityPanel), {
  loading: () => <PanelLoading label="핵심 이슈를 불러오는 중입니다." />
});
const MeetingMaterialsTable = dynamic(() => import("@/components/reports/MeetingMaterialsTable").then((mod) => mod.MeetingMaterialsTable), {
  loading: () => <PanelLoading label="회의자료를 불러오는 중입니다." />
});
const DepartmentOpenRequestBoard = dynamic(
  () => import("@/components/reports/DepartmentOpenRequestBoard").then((mod) => mod.DepartmentOpenRequestBoard),
  { loading: () => <PanelLoading label="확인요청현황을 불러오는 중입니다." /> }
);
const MeetingHolidayWorkBoard = dynamic(() => import("@/components/reports/MeetingHolidayWorkBoard").then((mod) => mod.MeetingHolidayWorkBoard), {
  loading: () => <PanelLoading label="공휴일 근무현황을 불러오는 중입니다." />
});
const MeetingFacilityConstructionBoard = dynamic(
  () => import("@/components/reports/MeetingFacilityConstructionBoard").then((mod) => mod.MeetingFacilityConstructionBoard),
  { loading: () => <PanelLoading label="시설공사 자료를 불러오는 중입니다." /> }
);
const VolumeComparisonChart = dynamic(() => import("@/components/charts/VolumeComparisonChart").then((mod) => mod.VolumeComparisonChart), {
  loading: () => <PanelLoading label="물동량 그래프를 불러오는 중입니다." />
});
const MeetingDepartmentVolumeBoard = dynamic(
  () => import("@/components/reports/MeetingDepartmentVolumeBoard").then((mod) => mod.MeetingDepartmentVolumeBoard),
  { loading: () => <PanelLoading label="부서별 물동량 현황을 불러오는 중입니다." /> }
);

const tabs: { value: MeetingTab; label: string }[] = [
  { value: "collection", label: "취합현황" },
  { value: "materials", label: "회의자료" },
  { value: "volumes", label: "물동량" },
  { value: "holiday", label: "공휴일근무" },
  { value: "facility", label: "시설공사" }
];

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="sketch-panel flex min-h-44 items-center justify-center p-4 text-sm font-black text-slate-500">
      {label}
    </div>
  );
}

const meetingTabLoadingLabels: Record<MeetingTab, string> = {
  collection: "취합현황을 불러오는 중입니다.",
  materials: "회의자료를 불러오는 중입니다.",
  volumes: "물동량 현황을 불러오는 중입니다.",
  holiday: "공휴일 근무현황을 불러오는 중입니다.",
  facility: "시설공사 자료를 불러오는 중입니다."
};

function MeetingMaterialsAccessDenied() {
  return (
    <section className="sketch-panel p-6">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-lg font-black text-[#012241]">회의자료 접근 권한이 없습니다.</p>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          회의자료는 관리자, 부서장, 매니저 권한 사용자만 조회할 수 있습니다.
        </p>
      </div>
    </section>
  );
}

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

function buildTabHref(
  tab: MeetingTab,
  params: MeetingSearchParams,
  selectedWeek: WeekOption,
  defaultMaterialsDepartmentId?: string
) {
  const nextParams = new URLSearchParams({
    tab,
    report_year: String(selectedWeek.year),
    report_month: String(selectedWeek.month),
    week_of_month: String(selectedWeek.weekOfMonth),
    week_start_date: selectedWeek.weekStartDate
  });
  if (params.department_id) {
    nextParams.set("department_id", params.department_id);
  } else if (tab === "materials" && !params.client_id && defaultMaterialsDepartmentId) {
    nextParams.set("department_id", defaultMaterialsDepartmentId);
  }
  if (params.client_id) {
    nextParams.set("client_id", params.client_id);
  }
  return `/meeting-materials?${nextParams.toString()}`;
}

function getMeetingReportSelect(tab: MeetingTab) {
  if (tab === "collection") {
    return "id,department_id,client_id,departments(department_name),clients(client_name),weekly_client_report_items(id,item_period,importance,title,content,work_categories(category_name))";
  }

  return "id,department_id,client_id,departments(department_name),clients(client_name),weekly_client_report_items(id,item_period,importance,title,content,work_categories(category_name),weekly_report_item_requests(id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,deleted_at))";
}

function getSubmissionSelect(tab: MeetingTab) {
  if (tab === "collection") {
    return "id,status,department_id,week_start_date,finalized_at";
  }

  if (tab === "holiday" || tab === "facility") {
    return "id,status,department_id,week_start_date,finalized_at,department_weekly_contents!inner(section_type,current_week_content,next_week_content)";
  }

  if (tab === "materials") {
    return "id,status,department_id,week_start_date,finalized_at,departments(department_name),department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content)";
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

function makeChartRows(reports: VolumeTrendReportRow[], lastWeekOfMonth: number): VolumeChartRow[] {
  const weekCount = Math.max(1, Math.min(lastWeekOfMonth, 6));
  const rows = Array.from({ length: weekCount }, (_, index) => ({
    name: `${index + 1}주차`,
    inbound: 0,
    outbound: 0,
    total: 0
  }));
  let hasVolume = false;

  reports.forEach((report) => {
    const row = rows[report.week_of_month - 1];
    if (!row) {
      return;
    }
    (report.weekly_volumes ?? []).forEach((volume) => {
      if (volume.volume_type !== "inbound" && volume.volume_type !== "outbound") {
        return;
      }
      const quantity = Number(volume.quantity);
      row[volume.volume_type] += quantity;
      row.total += quantity;
      hasVolume = true;
    });
  });

  return hasVolume ? rows : [];
}

function getPreviousReportMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function createVolumeValue(): MeetingDepartmentVolumeValue {
  return { inbound: 0, outbound: 0, total: 0 };
}

function addVolumeValues(target: MeetingDepartmentVolumeValue, volumes: MeetingReportRow["weekly_volumes"]) {
  volumes.forEach((volume) => {
    if (volume.volume_type !== "inbound" && volume.volume_type !== "outbound") {
      return;
    }
    const quantity = Number(volume.quantity);
    target[volume.volume_type] += quantity;
    target.total += quantity;
  });
}

function makeDepartmentVolumeRows(
  departments: DepartmentRow[],
  currentReports: VolumeTrendReportRow[],
  previousReports: VolumeTrendReportRow[]
): MeetingDepartmentVolumeRow[] {
  const rowMap = new Map<string, MeetingDepartmentVolumeRow>();
  departments.forEach((department) => {
    rowMap.set(department.id, {
      departmentId: department.id,
      departmentName: department.department_name,
      weeks: Array.from({ length: 5 }, createVolumeValue),
      totals: createVolumeValue(),
      previousTotals: createVolumeValue()
    });
  });

  currentReports.forEach((report) => {
    const row = rowMap.get(report.department_id);
    const week = row?.weeks[report.week_of_month - 1];
    if (!row || !week) {
      return;
    }
    addVolumeValues(week, report.weekly_volumes ?? []);
    addVolumeValues(row.totals, report.weekly_volumes ?? []);
  });

  previousReports.forEach((report) => {
    const row = rowMap.get(report.department_id);
    if (!row || report.week_of_month < 1 || report.week_of_month > 5) {
      return;
    }
    addVolumeValues(row.previousTotals, report.weekly_volumes ?? []);
  });

  return Array.from(rowMap.values());
}

function makePriorityItems(reports: MeetingReportRow[]): MeetingPriorityItem[] {
  return reports
    .flatMap((report) =>
      report.weekly_client_report_items
        .filter(
          (item): item is MeetingWorkItemRow & { importance: Extract<Importance, "very_high" | "high"> } =>
            item.importance === "very_high" || item.importance === "high"
        )
        .map((item) => ({
          id: item.id,
          title: item.title?.trim() || item.content.split("\n")[0]?.trim() || "제목 없음",
          content: item.content,
          importance: item.importance,
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

function makeCommonMeetingRows(submissions: SubmissionRow[], departments: DepartmentRow[], categories: WorkCategoryRow[]): MeetingReportRow[] {
  const departmentNameMap = new Map(departments.map((department) => [department.id, department.department_name]));
  const categoryNameMap = new Map(categories.map((category) => [category.id, category.category_name]));
  const commonRows: MeetingReportRow[] = [];

  submissions.forEach((submission) => {
    const commonContent = submission.department_weekly_contents.find((content) => content.section_type === "common");
    if (!commonContent) {
      return;
    }

    const currentItems = parseDepartmentCommonContentItems(
      commonContent.current_week_content,
      commonContent.current_importance,
      commonContent.current_work_category_id ?? "",
      "공통사항"
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

    const nextItems = parseDepartmentCommonContentItems(
      commonContent.next_week_content,
      commonContent.next_importance,
      commonContent.next_work_category_id ?? "",
      "공통사항"
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
      departments: {
        department_name:
          departmentNameMap.get(submission.department_id) ?? submission.departments?.department_name ?? "-"
      },
      clients: { client_name: "공통사항" },
      weekly_client_report_items: [...currentItems, ...nextItems],
      weekly_volumes: []
    });
  });

  return commonRows;
}

function filterMeetingMaterialSearch(
  report: MeetingReportRow,
  weekStartDate: string,
  filters: ClientReportSearchFilters,
  categoryIdByName: Map<string, string>
): MeetingReportRow | null {
  // 빠른 검색어(query)는 회의자료 탭에서 제목·내용·업무구분(카테고리명)을 모두 대상으로 한다.
  // 나머지 상세 필터(기간·업무구분 선택·중요도·상세검색)는 공유 라이브러리에 그대로 위임한다.
  const { query, ...detailFilters } = filters;
  const baseItems = filterClientReportSearchItems(
    {
      week_start_date: weekStartDate,
      weekly_client_report_items: report.weekly_client_report_items.map((item) => ({
        source: item,
        item_period: item.item_period,
        importance: item.importance,
        work_category_id: categoryIdByName.get(item.work_categories?.category_name ?? "") ?? "",
        title: item.title ?? "",
        content: item.content
      }))
    },
    detailFilters
  );
  const term = query?.trim().toLowerCase();
  const matchingItems = term
    ? baseItems.filter((item) => {
        const source = item.source;
        return (
          (source.title ?? "").toLowerCase().includes(term) ||
          (source.content ?? "").toLowerCase().includes(term) ||
          (source.work_categories?.category_name ?? "").toLowerCase().includes(term)
        );
      })
    : baseItems;
  return matchingItems.length > 0
    ? { ...report, weekly_client_report_items: matchingItems.map((item) => item.source) }
    : null;
}

function compactDepartmentStatus(status: DepartmentSubmissionStatus | null) {
  if (!status) {
    return { label: "미작성", dotClassName: "bg-slate-300", textClassName: "text-slate-500" };
  }
  if (status === "draft") {
    return { label: "작성 중", dotClassName: "u-dot-amber", textClassName: "text-[#012241]" };
  }
  // 부서 확정(submitted_to_division)이 이 앱 운영 흐름의 최종 단계다(별도 사업부 승인 UI 없음).
  // 취합현황 모니터링에서는 확정을 곧 승인으로 표시한다.
  if (status === "submitted_to_division" || status === "division_approved") {
    return { label: "승인", dotClassName: "u-dot-green", textClassName: "text-[#007050]" };
  }
  return { label: "반려", dotClassName: "u-dot-pink", textClassName: "text-[#c2566d]" };
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
  if (!profile || !canViewMeetingMaterials(profile)) {
    return <MeetingMaterialsAccessDenied />;
  }

  const defaultDepartmentId =
    params.department_id ??
    (!isAdmin(profile) ? profile.department_id ?? undefined : undefined);
  // 작성자명 맵은 materials 탭에서만 쓰이는데 여기서 순차 조회하면 모든 탭의 첫 화면이
  // DB 왕복 2회만큼 늦게 뜬다. MeetingMaterialsContent(Suspense 내부)에서 RPC와 병렬로 조회한다.
  const contentKey = [
    activeTab,
    selectedWeek.weekStartDate,
    params.department_id ?? "all",
    params.client_id ?? "all"
  ].join("-");

  return (
    <MeetingMaterialsWorkspace
      key={contentKey}
      initialTab={activeTab}
      currentUserId={profile.id}
      canManageAllRequests={isAdmin(profile)}
      tabs={tabs.map((tab) => ({
        ...tab,
        href: buildTabHref(tab.value, params, selectedWeek, defaultDepartmentId)
      }))}
      weekFilter={<MeetingMaterialsWeekFilter defaultWeekStartDate={selectedWeek.weekStartDate} />}
    >
      <Suspense key={contentKey} fallback={<PanelLoading label={meetingTabLoadingLabels[activeTab]} />}>
        <MeetingMaterialsContent params={params} activeTab={activeTab} selectedWeek={selectedWeek} profile={profile} defaultDepartmentId={defaultDepartmentId} />
      </Suspense>
    </MeetingMaterialsWorkspace>
  );
}

async function MeetingMaterialsContent({
  params,
  activeTab,
  selectedWeek,
  profile,
  defaultDepartmentId
}: {
  params: MeetingSearchParams;
  activeTab: MeetingTab;
  selectedWeek: WeekOption;
  profile: ProfileSummary;
  defaultDepartmentId?: string;
}) {
  const searchFilters = parseClientReportSearchFilters(params);
  const hasSearchFilters = hasClientReportSearchFilters(searchFilters);
  // 전체부서(admin·부서/화주 미선택 materials): 회의자료 목록은 스킵하고 확인요청만 전체 부서 기준으로 노출한다.
  const isMaterialsAllDept =
    activeTab === "materials" && isAdmin(profile) && !params.department_id && !params.client_id;
  const supabase = await createSupabaseServerClient();
  let departments: DepartmentRow[] = [];
  let clients: ClientSummaryRow[] = [];
  let reports: MeetingReportRow[] = [];
  let confirmationRequestItems: DepartmentOpenRequestItem[] = [];
  let openRequestItems: MeetingOpenRequestItem[] = [];
  let submissions: SubmissionRow[] = [];
  let workCategories: WorkCategoryRow[] = [];
  let commonReports: MeetingReportRow[] = [];
  let volumeTrendReports: VolumeTrendReportRow[] = [];
  let previousVolumeTrendReports: VolumeTrendReportRow[] = [];
  let reportAuthorNames: Record<string, string> = {};
  let initialMemoContent = "";
  let weekMemoItems: WeekMemoItem[] = [];
  const memoDepartmentId = activeTab === "materials" && isAdmin(profile) ? params.department_id ?? null : null;

  if (supabase && profile) {
    // 작성자명·메모·주차메모는 RPC 결과와 무관하므로 순차 await 대신 아래 Promise.all에 함께 태워
    // materials 탭의 DB 왕복을 줄인다.
    const reportAuthorNamesPromise =
      activeTab === "materials" && !isMaterialsAllDept
        ? loadMeetingReportAuthorNames(supabase, selectedWeek.weekStartDate, defaultDepartmentId ?? null)
        : Promise.resolve<Record<string, string>>({});
    const memoContentPromise = memoDepartmentId
      ? supabase
          .from("department_meeting_memos")
          .select("content")
          .eq("department_id", memoDepartmentId)
          .eq("week_start_date", selectedWeek.weekStartDate)
          .maybeSingle()
      : Promise.resolve({ data: null });
    const weekMemosPromise =
      activeTab === "materials" && isAdmin(profile)
        ? loadWeekMemosAction({ week_start_date: selectedWeek.weekStartDate })
        : Promise.resolve(null);
    const compatibilityRequestPromise = (async (): Promise<OpenRequestQueryRow[] | null> => {
      if (activeTab !== "collection" && activeTab !== "materials") {
        return null;
      }
      try {
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin
          .from("weekly_report_item_requests")
          .select(OPEN_REQUEST_COMPATIBILITY_SELECT)
          .is("deleted_at", null)
          .is("closed_at", null)
          .order("created_at", { ascending: false })
          .limit(MEETING_REPORT_LIMIT);
        return error ? null : ((data ?? []) as unknown as OpenRequestQueryRow[]);
      } catch {
        return null;
      }
    })();
    const [{ data: rpcData, error: rpcError }, compatibilityRequestData, loadedAuthorNames, memoRowResult, weekMemosResult] = await Promise.all([
      supabase.rpc("get_meeting_materials_payload", {
        p_tab: activeTab,
        p_week_start_date: selectedWeek.weekStartDate,
        p_report_year: selectedWeek.year,
        p_report_month: selectedWeek.month,
        p_week_of_month: selectedWeek.weekOfMonth,
        p_department_id: params.department_id ?? null,
        p_client_id: params.client_id ?? null
      }),
      compatibilityRequestPromise,
      reportAuthorNamesPromise,
      memoContentPromise,
      weekMemosPromise
    ]);
    reportAuthorNames = loadedAuthorNames;
    initialMemoContent = (memoRowResult.data as { content?: string | null } | null)?.content ?? "";
    if (weekMemosResult?.ok) {
      weekMemoItems = weekMemosResult.items;
    }

    if (!rpcError && isMeetingMaterialsPayload(rpcData)) {
      departments = rpcData.departments;
      clients = rpcData.clients;
      reports = normalizeMeetingReports(rpcData.reports);
      submissions = rpcData.submissions.map((submission) => ({
        ...submission,
        department_weekly_contents: submission.department_weekly_contents ?? []
      }));
      workCategories = rpcData.workCategories;
      volumeTrendReports = rpcData.volumeTrendReports;
      previousVolumeTrendReports = rpcData.previousVolumeTrendReports;
      // 전체부서 materials면 RPC가 강제한 기본 부서 스코프를 무시하고 확인요청을 전체 부서 기준으로 조회한다.
      const requestDepartmentFilter = isMaterialsAllDept ? null : rpcData.resolvedDepartmentId;
      let openRequestRows = rpcData.openRequests;
      if ((activeTab === "collection" || activeTab === "materials") && compatibilityRequestData) {
        const departmentFilter = requestDepartmentFilter;
        // fail-closed: 전체부서 열람이 아닌데 부서 스코프가 없으면(부서 미지정 계정) 전 부서 노출을 막는다.
        openRequestRows = !isMaterialsAllDept && !departmentFilter ? [] : compatibilityRequestData.filter((request) => {
          if (request.target_type === "client_item") {
            const report = request.weekly_client_report_items?.weekly_client_reports;
            return Boolean(
              report &&
              (!departmentFilter || report.department_id === departmentFilter) &&
              (!params.client_id || report.client_id === params.client_id)
            );
          }
          const submission = request.department_weekly_submissions;
          return Boolean(
            !params.client_id &&
            submission &&
            (!departmentFilter || submission.department_id === departmentFilter)
          );
        });
      }
      const seenOpenRequestIds = new Set<string>();
      openRequestRows = openRequestRows.filter((request) => {
        if (seenOpenRequestIds.has(request.id)) {
          return false;
        }
        seenOpenRequestIds.add(request.id);
        return true;
      });
      if (activeTab === "collection" || activeTab === "materials") {
        confirmationRequestItems = makeConfirmationRequestItems(
          openRequestRows as unknown as import("@/lib/reports/meeting-materials-tab-data").OpenRequestQueryRow[],
          workCategories,
          requestDepartmentFilter ?? undefined,
          params.client_id
        );
        if (activeTab === "collection") {
          openRequestItems = makePriorityOpenRequestItems(confirmationRequestItems);
        }
      }
      if (isMaterialsAllDept) {
        reports = [];
        commonReports = [];
      } else {
        commonReports = activeTab === "materials" ? makeCommonMeetingRows(submissions, departments, workCategories) : [];
        if (activeTab === "materials") {
          commonReports = attachCommonMaterialRequests(commonReports, rpcData.commonMaterialRequests);
        }
      }
    } else {
      console.warn("[meeting-materials] Falling back to legacy queries", rpcError?.message ?? "invalid RPC payload");
      let dataClient = supabase;
      try {
        dataClient = createSupabaseAdminClient();
      } catch {
        dataClient = supabase;
      }
    // 전체부서 materials는 기본 부서를 강제하지 않고 부서 미선택(null)을 유지한다.
    const departmentFilter = isAdmin(profile) ? params.department_id ?? undefined : profile.department_id;
    const skipMaterialsList = isMaterialsAllDept;
    const needsDepartments =
      activeTab === "collection" ||
      activeTab === "volumes" ||
      activeTab === "holiday" ||
      activeTab === "facility";
    const needsClients = activeTab === "collection";
    const needsReports = activeTab === "collection" || (activeTab === "materials" && !skipMaterialsList);
    const needsSubmissions =
      activeTab === "collection" ||
      (activeTab === "materials" && !skipMaterialsList) ||
      activeTab === "holiday" ||
      activeTab === "facility";
    const contentSectionFilter = getDepartmentContentSection(activeTab);
    const previousReportMonth = getPreviousReportMonth(selectedWeek.year, selectedWeek.month);

    const [
      departmentResult,
      clientResult,
      reportResult,
      openRequestResult,
      submissionResult,
      categoryResult,
      commonMaterialRequestResult,
      volumeTrendResult,
      previousVolumeTrendResult
    ] = await Promise.all([
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
            if (activeTab === "collection") {
              query = query.in("weekly_client_report_items.importance", ["very_high", "high"]);
            }
            return query;
          })()
        : Promise.resolve({ data: [], error: null }),
      activeTab === "collection" || activeTab === "materials"
        ? (() => {
            let clientRequestQuery = dataClient
              .from("weekly_report_item_requests")
              .select(
                "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,deleted_at,weekly_client_report_items!inner(id,item_period,title,content,importance,work_categories(category_name),weekly_client_reports!inner(id,department_id,client_id,week_start_date,report_year,report_month,week_of_month,departments(department_name),clients(client_name)))"
              )
              .eq("target_type", "client_item")
              .is("deleted_at", null)
              .is("closed_at", null)
              .order("created_at", { ascending: false })
              .limit(MEETING_REPORT_LIMIT);
            let commonRequestQuery = dataClient
              .from("weekly_report_item_requests")
              .select(
                "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,deleted_at,department_weekly_submissions!inner(id,department_id,week_start_date,report_year,report_month,week_of_month,departments(department_name),department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content))"
              )
              .eq("target_type", "department_common")
              .is("deleted_at", null)
              .is("closed_at", null)
              .order("created_at", { ascending: false })
              .limit(MEETING_REPORT_LIMIT);
            if (departmentFilter) {
              clientRequestQuery = clientRequestQuery.eq("weekly_client_report_items.weekly_client_reports.department_id", departmentFilter);
              commonRequestQuery = commonRequestQuery.eq("department_weekly_submissions.department_id", departmentFilter);
            }
            if (params.client_id) {
              clientRequestQuery = clientRequestQuery.eq("weekly_client_report_items.weekly_client_reports.client_id", params.client_id);
            }
            return Promise.all([clientRequestQuery, params.client_id ? Promise.resolve({ data: [] }) : commonRequestQuery]).then(
              ([clientRequests, commonRequests]) => ({
                data: [...(clientRequests.data ?? []), ...(commonRequests.data ?? [])].sort((left, right) =>
                  String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""))
                ).slice(0, MEETING_REPORT_LIMIT)
              })
            );
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
      activeTab === "materials" || activeTab === "collection"
        ? dataClient.from("work_categories").select("id,category_name").eq("is_active", true).order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] }),
      activeTab === "materials" && !skipMaterialsList
        ? (() => {
            let query = dataClient
              .from("weekly_report_item_requests")
              .select(
                "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,department_weekly_submissions!inner(department_id,week_start_date)"
              )
              .eq("target_type", "department_common")
              .eq("department_weekly_submissions.week_start_date", selectedWeek.weekStartDate)
              .is("deleted_at", null)
              .order("created_at", { ascending: true })
              .limit(MEETING_REPORT_LIMIT);
            if (departmentFilter) {
              query = query.eq("department_weekly_submissions.department_id", departmentFilter);
            }
            return query;
          })()
        : Promise.resolve({ data: [] }),
      activeTab === "volumes"
        ? (() => {
            let query = dataClient
              .from("weekly_client_reports")
              .select("id,department_id,client_id,week_of_month,weekly_volumes(volume_type,quantity,unit)")
              .eq("report_year", selectedWeek.year)
              .eq("report_month", selectedWeek.month)
              .lte("week_of_month", selectedWeek.weekOfMonth)
              .is("deleted_at", null)
              .order("week_of_month", { ascending: true })
              .limit(MEETING_REPORT_LIMIT);
            if (departmentFilter) {
              query = query.eq("department_id", departmentFilter);
            }
            if (params.client_id) {
              query = query.eq("client_id", params.client_id);
            }
            return query;
          })()
        : Promise.resolve({ data: [] }),
      activeTab === "volumes"
        ? (() => {
            let query = dataClient
              .from("weekly_client_reports")
              .select("id,department_id,client_id,week_of_month,weekly_volumes(volume_type,quantity,unit)")
              .eq("report_year", previousReportMonth.year)
              .eq("report_month", previousReportMonth.month)
              .lte("week_of_month", selectedWeek.weekOfMonth)
              .is("deleted_at", null)
              .order("week_of_month", { ascending: true })
              .limit(MEETING_REPORT_LIMIT);
            if (departmentFilter) {
              query = query.eq("department_id", departmentFilter);
            }
            if (params.client_id) {
              query = query.eq("client_id", params.client_id);
            }
            return query;
          })()
        : Promise.resolve({ data: [] })
    ]);

    departments = (departmentResult.data ?? []) as DepartmentRow[];
    clients = ((clientResult.data ?? []) as ClientLinkSummaryRow[]).map((link) => ({
      id: link.client_id,
      department_id: link.department_id
    }));
    reports = normalizeMeetingReports((reportResult.error ? [] : reportResult.data ?? []) as unknown as MeetingReportRow[]);
    if (activeTab === "collection" || activeTab === "materials") {
      confirmationRequestItems = makeConfirmationRequestItems(
        (openRequestResult.data ?? []) as unknown as import("@/lib/reports/meeting-materials-tab-data").OpenRequestQueryRow[],
        (categoryResult.data ?? []) as WorkCategoryRow[],
        departmentFilter ?? undefined,
        params.client_id
      );
      if (activeTab === "collection") {
        openRequestItems = makePriorityOpenRequestItems(confirmationRequestItems);
      }
    }
    submissions = ((submissionResult.data ?? []) as unknown as SubmissionRow[]).map((submission) => ({
      ...submission,
      department_weekly_contents: submission.department_weekly_contents ?? []
    }));
    workCategories = (categoryResult.data ?? []) as WorkCategoryRow[];
    volumeTrendReports = (volumeTrendResult.data ?? []) as unknown as VolumeTrendReportRow[];
    previousVolumeTrendReports = (previousVolumeTrendResult.data ?? []) as unknown as VolumeTrendReportRow[];
    commonReports = activeTab === "materials" ? makeCommonMeetingRows(submissions, departments, workCategories) : [];
    if (activeTab === "materials") {
      commonReports = attachCommonMaterialRequests(
        commonReports,
        (commonMaterialRequestResult.data ?? []) as unknown as ReportItemRequestRow[]
      );
    }
    }
  }

  const chartRows = activeTab === "volumes" ? makeChartRows(volumeTrendReports, selectedWeek.weekOfMonth) : [];
  const departmentVolumeRows =
    activeTab === "volumes" ? makeDepartmentVolumeRows(departments, volumeTrendReports, previousVolumeTrendReports) : [];
  const priorityItems = activeTab === "collection" ? makePriorityItems(reports) : [];
  const materialRows = activeTab === "materials" ? [...commonReports, ...reports] : reports;
  const categoryIdByName = new Map(workCategories.map((category) => [category.category_name, category.id]));
  const filteredMaterialRows =
    activeTab === "materials" && hasSearchFilters
      ? materialRows
          .map((report) =>
            filterMeetingMaterialSearch(report, selectedWeek.weekStartDate, searchFilters, categoryIdByName)
          )
          .filter((report): report is MeetingReportRow => Boolean(report))
      : materialRows;
  const { clientCountMap, writtenClientMap } =
    activeTab === "collection" ? countByDepartment(clients, reports) : { clientCountMap: new Map(), writtenClientMap: new Map() };

  const memoDepartmentName = memoDepartmentId
    ? departments.find((department) => department.id === memoDepartmentId)?.department_name ?? null
    : null;

  return (
    <>
      {activeTab === "collection" ? (
        <CollectionView
          departments={departments}
          submissions={submissions}
          priorityItems={priorityItems}
          openRequestItems={openRequestItems}
          clientCountMap={clientCountMap}
          writtenClientMap={writtenClientMap}
        />
      ) : null}
      {activeTab === "materials" ? (
        <div className="space-y-2">
          <div className="flex items-stretch gap-2">
            {isAdmin(profile) ? (
              <MemoStatusButton
                weekStartDate={selectedWeek.weekStartDate}
                canView={isAdmin(profile)}
                initialItems={weekMemoItems}
                initialCount={weekMemoItems.length}
              />
            ) : null}
            {isAdmin(profile) ? (
              <DepartmentMemoButton
                departmentId={memoDepartmentId}
                weekStartDate={selectedWeek.weekStartDate}
                initialContent={initialMemoContent}
                canEdit={isAdmin(profile)}
                departmentName={memoDepartmentName}
              />
            ) : null}
            <div className="min-w-0 flex-1 rounded-md border border-[#e7ddcd] bg-white/90 px-2 py-0.5 shadow-[0_10px_26px_rgba(16,34,61,0.05)]">
              <DepartmentCommonSearchToolbar
              key={Object.values(searchFilters).join("|")}
              categories={workCategories}
              filters={searchFilters}
              resultCount={filteredMaterialRows.length}
              detailsId="meeting-materials-detailed-search"
              unifiedDataSearch
              showQuickReset
              inlineQuickSearch
            />
            </div>
          </div>
          {confirmationRequestItems.length > 0 ? (
            <DepartmentOpenRequestBoard
              requests={confirmationRequestItems}
              currentUserId={profile.id}
              canManageAllRequests={isAdmin(profile)}
              title="확인요청현황"
              emptyMessage="진행 중인 확인요청이 없습니다."
              compact
            />
          ) : null}
          {isMaterialsAllDept ? (
            <section className="sketch-panel flex min-h-44 items-center justify-center p-6 text-center">
              <p className="text-sm font-black text-slate-500">부서를 선택하면 회의자료가 표시됩니다.</p>
            </section>
          ) : (
            <MeetingMaterialsTable
              key={`materials-${selectedWeek.weekStartDate}-${params.department_id ?? "all"}-${params.client_id ?? "all"}-${Object.values(searchFilters).join("-")}`}
              reports={filteredMaterialRows}
              reportAuthorNames={reportAuthorNames}
              currentUserId={profile?.id ?? ""}
              canManageAllRequests={isAdmin(profile)}
              emptyTitle={hasSearchFilters ? "검색 조건에 맞는 회의자료가 없습니다." : "선택한 주차의 회의자료가 없습니다."}
            />
          )}
        </div>
      ) : null}
      {activeTab === "volumes" ? <VolumesView chartRows={chartRows} departmentRows={departmentVolumeRows} /> : null}
      {activeTab === "holiday" ? (
        <MeetingHolidayWorkBoard departments={departments} submissions={submissions} selectedWeek={selectedWeek} />
      ) : null}
      {activeTab === "facility" ? <MeetingFacilityConstructionBoard departments={departments} submissions={submissions} /> : null}
    </>
  );
}

function CollectionView({
  departments,
  submissions,
  priorityItems,
  openRequestItems,
  clientCountMap,
  writtenClientMap
}: {
  departments: DepartmentRow[];
  submissions: SubmissionRow[];
  priorityItems: MeetingPriorityItem[];
  openRequestItems: MeetingOpenRequestItem[];
  clientCountMap: Map<string, number>;
  writtenClientMap: Map<string, Set<string>>;
}) {
  const totalClientCount = departments.reduce((sum, department) => sum + (clientCountMap.get(department.id) ?? 0), 0);
  const completedClientCount = departments.reduce((sum, department) => sum + (writtenClientMap.get(department.id)?.size ?? 0), 0);
  const completionRate = totalClientCount > 0 ? Math.round((completedClientCount / totalClientCount) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="kpi-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-slate-500">총건수</p>
              <p className="mt-1.5 text-3xl leading-none tabular-nums text-[#012241]" style={{ fontWeight: 850 }}>{totalClientCount}</p>
            </div>
            <span className="icon-badge icon-badge-blue" aria-hidden="true">
              <ClipboardList className="h-5 w-5" />
            </span>
          </div>
        </article>
        <article className="kpi-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-slate-500">완료건수</p>
              <p className="mt-1.5 text-3xl leading-none tabular-nums text-[#007050]" style={{ fontWeight: 850 }}>
                {completedClientCount}
                <span className="ml-1 text-[11px] font-bold text-slate-400">/ {totalClientCount}</span>
              </p>
            </div>
            <span className="icon-badge icon-badge-green" aria-hidden="true">
              <CheckCircle2 className="h-5 w-5" />
            </span>
          </div>
          <div className="mini-bar mt-2.5">
            <i style={{ width: `${completionRate}%` }} />
          </div>
        </article>
        <article className="kpi-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-slate-500">완료율</p>
              <p className="mt-1.5 text-3xl leading-none tabular-nums text-[#012241]" style={{ fontWeight: 850 }}>
                {completionRate}
                <span className="ml-0.5 text-[11px] font-bold text-slate-400">%</span>
              </p>
            </div>
            <span className="icon-badge icon-badge-amber" aria-hidden="true">
              <Percent className="h-5 w-5" />
            </span>
          </div>
          <div className="mini-bar mt-2.5">
            <i style={{ width: `${completionRate}%` }} />
          </div>
        </article>
      </div>
      <div className="grid w-full gap-3 xl:grid-cols-2">
        <MeetingPriorityPanel items={priorityItems} openRequests={openRequestItems} />
        <section className="kpi-card p-3">
          <div className="mb-3 flex min-h-[38px] flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-[#012241]">부서별 작성 모니터링</p>
              </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-black text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="u-dot u-dot-green" aria-hidden="true" />
                승인
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="u-dot u-dot-amber" aria-hidden="true" />
                작성 중
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="u-dot u-dot-pink" aria-hidden="true" />
                반려
              </span>
            </div>
          </div>
          <TableShell>
            <table className="table-sticky w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[14%]" />
                <col className="w-[24%]" />
                <col className="w-[17%]" />
                <col className="w-[17%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-2 py-2.5">부서</th>
                  <th className="px-2 py-2.5">화주</th>
                  <th className="px-2 py-2.5">완료율</th>
                  <th className="px-2 py-2.5">상태</th>
                  <th className="px-2 py-2.5">확정일</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((department) => {
                  const totalClients = clientCountMap.get(department.id) ?? 0;
                  const writtenClients = writtenClientMap.get(department.id)?.size ?? 0;
                  const departmentCompletionRate = totalClients > 0 ? Math.round((writtenClients / totalClients) * 100) : 0;
                  const submission = submissions.find((row) => row.department_id === department.id);
                  const status = compactDepartmentStatus(submission?.status ?? null);
                  return (
                    <tr key={department.id} className="border-t border-slate-100">
                      <td className="truncate px-2 py-1.5 text-sm font-black text-[#012241]" title={department.department_name}>
                        {department.department_name}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="font-black text-[#007050]">{writtenClients}</span>
                        <span className="text-slate-400"> / {totalClients}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-2">
                          <span className="mini-bar block min-w-8 flex-1" aria-hidden="true">
                            <i style={{ width: `${departmentCompletionRate}%` }} />
                          </span>
                          <span
                            className={cn(
                              "shrink-0 font-black tabular-nums",
                              departmentCompletionRate === 100 ? "text-emerald-600" : "text-slate-600"
                            )}
                          >
                            {departmentCompletionRate}%
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={cn("inline-flex items-center gap-1.5 font-black", status.textClassName)}>
                          <span className={cn("u-dot", status.dotClassName)} aria-hidden="true" />
                          {status.label}
                        </span>
                      </td>
                      <td className="truncate px-2 py-1.5">{formatCompactDate(submission?.finalized_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableShell>
        </section>
      </div>
    </div>
  );
}

function VolumesView({
  chartRows,
  departmentRows
}: {
  chartRows: VolumeChartRow[];
  departmentRows: MeetingDepartmentVolumeRow[];
}) {
  const weekRows = [1, 2, 3, 4, 5].map(
    (week) => chartRows.find((row) => row.name === `${week}주차`) ?? { name: `${week}주차`, inbound: 0, outbound: 0, total: 0 }
  );
  const monthlyTotal = weekRows.reduce(
    (total, row) => ({
      inbound: total.inbound + row.inbound,
      outbound: total.outbound + row.outbound,
      total: total.total + row.total
    }),
    { inbound: 0, outbound: 0, total: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_460px]">
        <VolumeComparisonChart rows={chartRows} />
        <section className="sketch-panel p-4">
          <h2 className="section-doodle-title mb-3">물동량 요약</h2>
          <TableShell>
            <table className="table-sticky w-full min-w-[420px] table-fixed text-left text-xs">
              <thead>
                <tr>
                  <th className="px-3 py-2.5">주차</th>
                  <th className="px-2 py-2.5 text-right">입고</th>
                  <th className="px-2 py-2.5 text-right">출고</th>
                  <th className="px-3 py-2.5 text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {weekRows.map((row) => (
                  <tr key={row.name} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-black text-[#012241]">{row.name}</td>
                    <td className="px-2 py-2 text-right font-bold">{row.inbound.toLocaleString("ko-KR")}</td>
                    <td className="px-2 py-2 text-right font-bold">{row.outbound.toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-2 text-right font-black text-[#012241]">{row.total.toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
                <tr className="border-t border-[#ddd2bf] bg-[#faf6ef]">
                  <td className="px-3 py-2.5 font-black text-[#012241]">합계</td>
                  <td className="px-2 py-2.5 text-right font-black text-emerald-700">{monthlyTotal.inbound.toLocaleString("ko-KR")}</td>
                  <td className="px-2 py-2.5 text-right font-black text-blue-700">{monthlyTotal.outbound.toLocaleString("ko-KR")}</td>
                  <td className="px-3 py-2.5 text-right font-black text-[#012241]">{monthlyTotal.total.toLocaleString("ko-KR")}</td>
                </tr>
              </tbody>
            </table>
          </TableShell>
        </section>
      </div>
      <MeetingDepartmentVolumeBoard rows={departmentRows} />
    </div>
  );
}
