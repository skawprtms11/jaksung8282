import dynamic from "next/dynamic";
import { Boxes, ClipboardCheck, ListChecks } from "lucide-react";
import {
  DepartmentOpenRequestBoard,
  type DepartmentOpenRequestItem
} from "@/components/reports/DepartmentOpenRequestBoard";
import type { DepartmentVolumeReport } from "@/components/reports/DepartmentVolumeBoard";
import { DepartmentCommonSearchToolbar } from "@/components/reports/DepartmentCommonSearchToolbar";
import type { MeetingReportItemRequest } from "@/components/reports/MeetingMaterialsTable";
import type {
  DepartmentSubmissionEditorInitialSubmission,
  DepartmentTabValue,
  DepartmentVacancyRecordValue,
  DepartmentVacancyTrendPointValue
} from "@/components/reports/DepartmentSubmissionEditor";
import {
  DepartmentCollectionWorkspace,
  type DepartmentCollectionEntry,
  type DepartmentCollectionItem
} from "@/components/data-collections/DepartmentCollectionWorkspace";
import { normalizeCollectionColumns, normalizeCollectionOptions, normalizeCollectionWidths, normalizeEntryRows } from "@/lib/data-collections/template";
import type { Json } from "@/types/database";
import { ClientReviewTable } from "@/components/reports/ClientReviewTable";
import { pickDefaultDepartmentId } from "@/lib/auth/default-scope";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canReviewClientReport, canSubmitDepartment, isAdmin } from "@/lib/auth/permissions";
import {
  filterClientReportSearchItems,
  filterDepartmentCommonSearchItems,
  hasClientReportSearchFilters,
  parseClientReportSearchFilters,
  parseDepartmentCommonContentItems
} from "@/lib/reports/client-report-search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import {
  getCurrentWeekOption,
  getReportMonthByThursday,
  getWeekEndDate,
  getWeekOfMonth,
  resolveWeekFromSelection,
  type WeekOption
} from "@/lib/dates/week";
import { volumeUnitLabels } from "@/lib/utils/labels";
import type { ClientReportStatus, Importance, VolumeType, VolumeUnit } from "@/types/enums";

type DepartmentOption = { id: string; department_name: string };
type CategoryOption = { id: string; category_name: string; icon_key: string };
type CenterOption = { id: string; center_name: string };
type HolidayClientOption = { id: string; client_name: string };
type HolidayClientLinkRow = { clients: { id: string; client_name: string } | null };
type HolidayWorkerOption = { id: string; full_name: string };
type ProfileNameRow = HolidayWorkerOption & { is_active: boolean };
type ClientReviewItem = {
  id: string;
  item_period: "current" | "next";
  importance: Importance;
  work_category_id: string;
  title: string;
  content: string;
  sort_order: number;
  original_title: string | null;
  original_content: string | null;
  admin_edited_at: string | null;
  work_categories: { category_name: string; icon_key: string } | null;
};
type ClientReviewRow = {
  id: string;
  created_by: string;
  report_year: number;
  report_month: number;
  week_of_month: number;
  week_start_date: string;
  status: ClientReportStatus;
  updated_at: string;
  clients: { client_name: string } | null;
  profiles: { full_name: string } | null;
  weekly_client_report_items: ClientReviewItem[];
  weekly_volumes: { volume_type: VolumeType; quantity: number; unit: VolumeUnit }[];
};
type SummaryReportRow = {
  week_start_date: string;
  weekly_client_report_items: { importance: Importance }[];
  weekly_volumes: { volume_type: VolumeType; quantity: number; unit: VolumeUnit }[];
};
type DepartmentDefaultRow = { id: string; department_name: string };
type DepartmentSubmissionInitialRow = {
  id: string;
  department_id: string;
  week_start_date: string;
  status: "draft" | "submitted_to_division" | "division_approved" | "division_rejected";
  finalized_at: string | null;
  department_weekly_contents: DepartmentSubmissionEditorInitialSubmission["department_weekly_contents"];
};
type DepartmentVacancyDbRow = Omit<DepartmentVacancyRecordValue, "center_name"> & {
  center_masters: { center_name: string } | null;
};
type AdminProfileRow = { id: string };
type OpenRequestDepartmentContentRow = {
  section_type: "common" | "facility" | "vacancy" | "holiday_work";
  current_importance: Importance;
  current_work_category_id: string | null;
  current_week_content: string;
  next_importance: Importance;
  next_work_category_id: string | null;
  next_week_content: string;
};
type DepartmentOpenRequestQueryRow = MeetingReportItemRequest & {
  deleted_at?: string | null;
  weekly_client_report_items?: {
    id: string;
    item_period: "current" | "next";
    title: string | null;
    content: string;
    importance: Importance;
    work_category_id: string;
    sort_order: number;
    work_categories: { category_name: string } | null;
    weekly_client_reports: {
      id: string;
      department_id: string;
      client_id: string;
      report_year: number;
      report_month: number;
      week_of_month: number;
      deleted_at: string | null;
      departments: { department_name: string } | null;
      clients: { client_name: string } | null;
    } | null;
  } | null;
  department_weekly_submissions?: {
    id: string;
    department_id: string;
    report_year: number;
    report_month: number;
    week_of_month: number;
    deleted_at: string | null;
    departments: { department_name: string } | null;
    department_weekly_contents: OpenRequestDepartmentContentRow[];
  } | null;
};

type DepartmentReportsSearchParams = {
  department_id?: string;
  client_id?: string;
  report_year?: string;
  report_month?: string;
  week_of_month?: string;
  week_start_date?: string;
  tab?: string;
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

const DEPARTMENT_TAB_VALUES: DepartmentTabValue[] = ["common", "volume", "facility", "vacancy", "holiday_work", "data_collection"];
const CLIENT_REVIEW_LIMIT = 300;
const OPEN_REQUEST_LIMIT = 200;
const OPEN_REQUEST_FIELDS =
  "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,deleted_at";
const DepartmentSubmissionEditor = dynamic(
  () => import("@/components/reports/DepartmentSubmissionEditor").then((mod) => mod.DepartmentSubmissionEditor),
  {
    loading: () => (
      <div className="sketch-panel flex min-h-64 items-center justify-center p-4 text-sm font-black text-slate-500">
        부서자료 화면을 불러오는 중입니다.
      </div>
    )
  }
);
const DepartmentVolumeBoard = dynamic(
  () => import("@/components/reports/DepartmentVolumeBoard").then((mod) => mod.DepartmentVolumeBoard),
  {
    loading: () => (
      <div className="rounded-2xl border border-dashed border-[#d3c6b0] px-4 py-6 text-center text-sm font-bold text-slate-500">
        물동량 현황을 불러오는 중입니다.
      </div>
    )
  }
);

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

function resolveWeek(params: DepartmentReportsSearchParams) {
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

function resolveActiveTab(params: DepartmentReportsSearchParams) {
  return DEPARTMENT_TAB_VALUES.find((value) => value === params.tab) ?? null;
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

function summarizeVolumeByUnit(reports: SummaryReportRow[], volumeType: VolumeType) {
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

function getImportanceStats(reports: SummaryReportRow[]) {
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

function mapVacancyRow(row: DepartmentVacancyDbRow): DepartmentVacancyRecordValue {
  return {
    id: row.id,
    department_id: row.department_id,
    center_master_id: row.center_master_id,
    center_name: row.center_masters?.center_name ?? "-",
    week_start_date: row.week_start_date,
    week_end_date: row.week_end_date,
    report_year: row.report_year,
    report_month: row.report_month,
    week_of_month: row.week_of_month,
    operating_area: Number(row.operating_area),
    simple_storage_area: Number(row.simple_storage_area),
    vacancy_area: Number(row.vacancy_area),
    total_area: Number(row.total_area),
    simple_storage_note: row.simple_storage_note,
    vacancy_note: row.vacancy_note,
    updated_at: row.updated_at
  };
}

function buildVacancyTrend(rows: DepartmentVacancyRecordValue[]): DepartmentVacancyTrendPointValue[] {
  const pointMap = rows.reduce((map, row) => {
    const key = `${row.center_master_id}:${row.week_start_date}`;
    const current = map.get(key) ?? {
      center_master_id: row.center_master_id,
      center_name: row.center_name,
      week_start_date: row.week_start_date,
      label: row.week_start_date.slice(5).replace("-", "/"),
      simple_storage_area: 0,
      vacancy_area: 0
    };
    current.simple_storage_area += row.simple_storage_area;
    current.vacancy_area += row.vacancy_area;
    map.set(key, current);
    return map;
  }, new Map<string, DepartmentVacancyTrendPointValue>());
  return Array.from(pointMap.values()).sort((left, right) => left.week_start_date.localeCompare(right.week_start_date));
}

function makeDepartmentOpenRequestItems(
  rows: DepartmentOpenRequestQueryRow[],
  categories: CategoryOption[],
  adminCreatorIds: Set<string>
): DepartmentOpenRequestItem[] {
  const categoryNameMap = new Map(categories.map((category) => [category.id, category.category_name]));
  const requestsByTarget = rows.reduce((map, request) => {
    const targetRequests = map.get(request.target_key) ?? [];
    targetRequests.push(request);
    map.set(request.target_key, targetRequests);
    return map;
  }, new Map<string, MeetingReportItemRequest[]>());

  return rows
    .filter((request) => adminCreatorIds.has(request.created_by) && !request.closed_at && !request.deleted_at)
    .map((request): DepartmentOpenRequestItem | null => {
      const targetRequests = requestsByTarget.get(request.target_key) ?? [request];
      if (request.target_type === "client_item") {
        const item = request.weekly_client_report_items;
        const report = item?.weekly_client_reports;
        if (!item || !report || report.deleted_at) {
          return null;
        }
        const clientName = report.clients?.client_name ?? "-";
        const departmentName = report.departments?.department_name ?? "-";
        const title = item.title?.trim() || item.content.split("\n")[0]?.trim() || "제목 없음";
        const categoryName = item.work_categories?.category_name ?? "기타";
        return {
          requestId: request.id,
          requestCreatedAt: request.created_at,
          weekLabel: `${report.report_year}.${String(report.report_month).padStart(2, "0")} ${report.week_of_month}주차 · ${item.item_period === "current" ? "금주" : "차주"}`,
          sourceLabel: clientName,
          categoryName,
          title,
          requestContent: request.request_content,
          resultContent: request.result_content,
          selection: {
            reportId: report.id,
            clientName,
            departmentName,
            isCommon: false,
            item: {
              id: item.id,
              item_period: item.item_period,
              title,
              content: item.content,
              importance: item.importance,
              work_categories: { category_name: categoryName },
              weekly_report_item_requests: targetRequests,
              request_target_key: request.target_key,
              request_target_type: "client_item",
              request_department_submission_id: null,
              request_item_sort_order: null
            }
          }
        };
      }

      const submission = request.department_weekly_submissions;
      if (
        request.target_type !== "department_common" ||
        !submission ||
        submission.deleted_at ||
        !request.item_period ||
        typeof request.item_sort_order !== "number"
      ) {
        return null;
      }
      const commonContent = submission.department_weekly_contents.find((content) => content.section_type === "common");
      if (!commonContent) {
        return null;
      }
      const commonItems = parseDepartmentCommonContentItems(
        request.item_period === "current" ? commonContent.current_week_content : commonContent.next_week_content,
        request.item_period === "current" ? commonContent.current_importance : commonContent.next_importance,
        (request.item_period === "current" ? commonContent.current_work_category_id : commonContent.next_work_category_id) ?? "",
        "공통사항"
      );
      const commonItem = commonItems.find((item) => item.sort_order === request.item_sort_order) ?? commonItems[0];
      const departmentName = submission.departments?.department_name ?? "-";
      const title = commonItem?.title?.trim() || commonItem?.content.split("\n")[0]?.trim() || "제목 없음";
      const content = commonItem?.content ?? "-";
      const categoryName = commonItem?.work_category_id
        ? categoryNameMap.get(commonItem.work_category_id) ?? "기타"
        : "기타";
      return {
        requestId: request.id,
        requestCreatedAt: request.created_at,
        weekLabel: `${submission.report_year}.${String(submission.report_month).padStart(2, "0")} ${submission.week_of_month}주차 · ${request.item_period === "current" ? "금주" : "차주"}`,
        sourceLabel: "부서 공통사항",
        categoryName,
        title,
        requestContent: request.request_content,
        resultContent: request.result_content,
        selection: {
          reportId: submission.id,
          clientName: "공통사항",
          departmentName,
          isCommon: true,
          item: {
            id: request.target_key,
            item_period: request.item_period,
            title,
            content,
            importance:
              commonItem?.importance ??
              (request.item_period === "current" ? commonContent.current_importance : commonContent.next_importance),
            work_categories: { category_name: categoryName },
            weekly_report_item_requests: targetRequests,
            request_target_key: request.target_key,
            request_target_type: "department_common",
            request_department_submission_id: submission.id,
            request_item_sort_order: request.item_sort_order
          }
        }
      };
    })
    .filter((request): request is DepartmentOpenRequestItem => Boolean(request))
    .sort((left, right) => right.requestCreatedAt.localeCompare(left.requestCreatedAt));
}

export default async function DepartmentReportsPage({
  searchParams
}: {
  searchParams: Promise<DepartmentReportsSearchParams>;
}) {
  const params = await searchParams;
  const searchFilters = parseClientReportSearchFilters(params);
  const hasSearchFilters = hasClientReportSearchFilters(searchFilters);
  const hasDateRangeFilter = Boolean(searchFilters.dateFrom || searchFilters.dateTo);
  const { profile } = await getCurrentUserProfile();
  const supabase = await createSupabaseServerClient();
  let departments: DepartmentOption[] = [];
  let categories: CategoryOption[] = [];
  let summaryReports: SummaryReportRow[] = [];
  let reviewReports: ClientReviewRow[] = [];
  let volumeReports: DepartmentVolumeReport[] = [];
  let holidayClientOptions: HolidayClientOption[] = [];
  let holidayWorkerOptions: HolidayWorkerOption[] = [];
  let centerOptions: CenterOption[] = [];
  let initialVacancyRecords: DepartmentVacancyRecordValue[] = [];
  let initialVacancyTrend: DepartmentVacancyTrendPointValue[] = [];
  let clientCount = 0;
  let initialSubmission: DepartmentSubmissionEditorInitialSubmission | null = null;
  let departmentOpenRequests: DepartmentOpenRequestItem[] = [];
  let initialLookupDepartmentId: string | null = null;
  let dataCollectionItems: DepartmentCollectionItem[] = [];
  let dataCollectionEntries: Record<string, DepartmentCollectionEntry> = {};
  let canEditDataCollection = false;
  const currentWeek = resolveWeek(params);
  const activeTab = resolveActiveTab(params);
  if (supabase && profile) {
    let dataClient = supabase;
    try {
      dataClient = createSupabaseAdminClient();
    } catch {
      dataClient = supabase;
    }
    let adminDefaultDepartmentId: string | undefined;
    if (isAdmin(profile) && !params.department_id) {
      const { data: defaultDepartments } = await dataClient
        .from("departments")
        .select("id,department_name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("department_name", { ascending: true });
      adminDefaultDepartmentId = pickDefaultDepartmentId((defaultDepartments ?? []) as DepartmentDefaultRow[], profile.app_role) || undefined;
    }
    const departmentFilter = isAdmin(profile) ? params.department_id ?? adminDefaultDepartmentId : profile.department_id;
    // 부서 범위를 확정하지 못한 비관리자는 전 부서 자료가 새지 않도록 조회 자체를 막는다.
    const isDepartmentScopeBlocked = !isAdmin(profile) && !departmentFilter;
    const selectedClientFilter = params.client_id;
    initialLookupDepartmentId = departmentFilter ?? null;
    const [
      { data: departmentData },
      { data: categoryData },
      { data: reportData, error: reportError },
      { count },
      { data: submissionData },
      { data: holidayClientData },
      { data: holidayWorkerData },
      { data: centerData },
      { data: volumeReportData, error: volumeReportError },
      { data: vacancyMonthData },
      { data: vacancyTrendData },
      { data: adminProfileData },
      { data: clientOpenRequestData },
      { data: commonOpenRequestData },
      { data: summaryReportData, error: summaryReportError },
      // 자료취합 탭: 진행 중 취합건과 이 부서의 작성 내용. 별도 순차 await로 두면
      // 페이지 렌더마다 DB 왕복이 한 번 더 붙으므로 반드시 이 Promise.all 안에서 함께 조회한다.
      { data: collectionData },
      { data: collectionEntryData }
    ] = await Promise.all([
      (() => {
        if (isDepartmentScopeBlocked) {
          return Promise.resolve({ data: [], error: null });
        }
        let query = dataClient.from("departments").select("id,department_name").eq("is_active", true).order("sort_order");
        if (!isAdmin(profile) && departmentFilter) {
          query = query.eq("id", departmentFilter);
        }
        return query;
      })(),
      dataClient.from("work_categories").select("id,category_name,icon_key").eq("is_active", true).order("sort_order"),
      (() => {
        if (isDepartmentScopeBlocked) {
          return Promise.resolve({ data: [], error: null });
        }
        let query = dataClient
          .from("weekly_client_reports")
          .select("id,created_by,report_year,report_month,week_of_month,week_start_date,status,updated_at,clients(client_name),weekly_client_report_items(id,item_period,importance,work_category_id,title,content,sort_order,original_title,original_content,admin_edited_at,work_categories(category_name,icon_key)),weekly_volumes(volume_type,quantity,unit)")
          .is("deleted_at", null)
          .order("week_start_date", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(CLIENT_REVIEW_LIMIT);
        if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        if (selectedClientFilter) {
          query = query.eq("client_id", selectedClientFilter);
        }
        if (searchFilters.dateFrom || searchFilters.dateTo) {
          if (searchFilters.dateFrom) {
            query = query.gte("week_start_date", searchFilters.dateFrom);
          }
          if (searchFilters.dateTo) {
            query = query.lte("week_start_date", searchFilters.dateTo);
          }
        } else {
          query = query.eq("week_start_date", currentWeek.weekStartDate);
        }
        return query;
      })(),
      (() => {
        if (isDepartmentScopeBlocked) {
          return Promise.resolve({ count: 0 });
        }
        let query = dataClient
          .from("department_client_links")
          .select("client_id", { count: "exact", head: true })
          .eq("is_active", true);
        if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        if (selectedClientFilter) {
          query = query.eq("client_id", selectedClientFilter);
        }
        return query;
      })(),
      departmentFilter
          ? dataClient
            .from("department_weekly_submissions")
            .select(
              "id,department_id,week_start_date,status,finalized_at,department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content)"
            )
            .eq("department_id", departmentFilter)
            .eq("week_start_date", currentWeek.weekStartDate)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      departmentFilter
          ? dataClient
            .from("department_client_links")
            .select("clients(id,client_name)")
            .eq("department_id", departmentFilter)
            .eq("is_active", true)
            .order("client_id", { ascending: true })
        : Promise.resolve({ data: [] }),
      departmentFilter
          ? dataClient
            .from("profiles")
            .select("id,full_name,is_active")
            .eq("department_id", departmentFilter)
            .order("full_name", { ascending: true })
        : Promise.resolve({ data: [] }),
      dataClient.from("center_masters").select("id,center_name").eq("is_active", true).order("center_name", { ascending: true }),
      departmentFilter
          ? dataClient
            .from("weekly_client_reports")
            .select("id,client_id,week_of_month,clients(client_name),weekly_volumes(volume_type,quantity,unit,note)")
            .eq("department_id", departmentFilter)
            .eq("report_year", currentWeek.year)
            .eq("report_month", currentWeek.month)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
      Promise.resolve({ data: [] }),
      Promise.resolve({ data: [] }),
      isDepartmentScopeBlocked
        ? Promise.resolve({ data: [] })
        : dataClient.from("profiles").select("id").eq("app_role", "admin"),
      departmentFilter
        ? dataClient
          .from("weekly_report_item_requests")
          .select(
            `${OPEN_REQUEST_FIELDS},weekly_client_report_items!inner(id,item_period,title,content,importance,work_category_id,sort_order,work_categories(category_name),weekly_client_reports!inner(id,department_id,client_id,report_year,report_month,week_of_month,deleted_at,departments(department_name),clients(client_name)))`
          )
          .eq("target_type", "client_item")
          .eq("weekly_client_report_items.weekly_client_reports.department_id", departmentFilter)
          .is("weekly_client_report_items.weekly_client_reports.deleted_at", null)
          .is("deleted_at", null)
          .is("closed_at", null)
          .order("created_at", { ascending: false })
          .limit(OPEN_REQUEST_LIMIT)
        : Promise.resolve({ data: [] }),
      departmentFilter
        ? dataClient
          .from("weekly_report_item_requests")
          .select(
            `${OPEN_REQUEST_FIELDS},department_weekly_submissions!inner(id,department_id,report_year,report_month,week_of_month,deleted_at,departments(department_name),department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content))`
          )
          .eq("target_type", "department_common")
          .eq("department_weekly_submissions.department_id", departmentFilter)
          .is("department_weekly_submissions.deleted_at", null)
          .is("deleted_at", null)
          .is("closed_at", null)
          .order("created_at", { ascending: false })
          .limit(OPEN_REQUEST_LIMIT)
        : Promise.resolve({ data: [] }),
      // 요약 카드는 검색 조건과 무관하게 선택 주차만 집계한다. 기간 검색이 없으면 목록 조회와 범위가 같아 재사용한다.
      hasDateRangeFilter && !isDepartmentScopeBlocked
        ? (() => {
            let query = dataClient
              .from("weekly_client_reports")
              .select("created_by,week_start_date,weekly_client_report_items(importance),weekly_volumes(volume_type,quantity,unit)")
              .eq("week_start_date", currentWeek.weekStartDate)
              .is("deleted_at", null)
              .limit(CLIENT_REVIEW_LIMIT);
            if (departmentFilter) {
              query = query.eq("department_id", departmentFilter);
            }
            if (selectedClientFilter) {
              query = query.eq("client_id", selectedClientFilter);
            }
            return query;
          })()
        : Promise.resolve({ data: [], error: null }),
      departmentFilter
        ? dataClient
          .from("data_collections")
          .select("id,title,description,example,image_url,entry_mode,link_url,template,created_at")
          .is("deleted_at", null)
          .is("closed_at", null)
          .order("created_at", { ascending: false })
          .limit(50)
        : Promise.resolve({ data: [] }),
      departmentFilter
        ? dataClient
          .from("data_collection_entries")
          .select("collection_id,rows,is_completed")
          .eq("department_id", departmentFilter)
        : Promise.resolve({ data: [] })
    ]);
    dataCollectionItems = ((collectionData ?? []) as {
      id: string;
      title: string;
      description: string;
      example: string;
      image_url: string | null;
      entry_mode: string;
      link_url: string | null;
      template: Json;
      created_at: string;
    }[]).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      example: row.example,
      imageUrl: row.image_url,
      columns: normalizeCollectionColumns(row.template),
      widths: normalizeCollectionWidths(row.template, normalizeCollectionColumns(row.template).length),
      options: normalizeCollectionOptions(row.template, normalizeCollectionColumns(row.template).length),
      entryMode: row.entry_mode === "link" ? ("link" as const) : ("grid" as const),
      linkUrl: row.link_url,
      createdAt: row.created_at
    }));
    const columnCountById = new Map(dataCollectionItems.map((item) => [item.id, item.columns.length]));
    dataCollectionEntries = Object.fromEntries(
      ((collectionEntryData ?? []) as { collection_id: string; rows: Json; is_completed: boolean }[]).map((row) => [
        row.collection_id,
        { rows: normalizeEntryRows(row.rows, columnCountById.get(row.collection_id) ?? 0), isCompleted: row.is_completed }
      ])
    );
    canEditDataCollection = Boolean(departmentFilter && profile && (isAdmin(profile) || profile.department_id === departmentFilter));
    departments = (departmentData ?? []) as DepartmentOption[];
    categories = (categoryData ?? []) as CategoryOption[];
    centerOptions = (centerData ?? []) as CenterOption[];
    holidayClientOptions = ((holidayClientData ?? []) as unknown as HolidayClientLinkRow[])
      .filter((link) => link.clients)
      .map((link) => ({
        id: link.clients?.id ?? "",
        client_name: link.clients?.client_name ?? ""
      }))
      .sort((left, right) => left.client_name.localeCompare(right.client_name, "ko"));
    const profileRows = (holidayWorkerData ?? []) as ProfileNameRow[];
    holidayWorkerOptions = profileRows.filter((worker) => worker.is_active).map(({ id, full_name }) => ({ id, full_name }));
    const reportRows = reportError ? [] : ((reportData ?? []) as unknown as ClientReviewRow[]);
    const creatorNameMap = new Map(profileRows.map((creator) => [creator.id, creator.full_name]));
    const namedReports = reportRows.map((report) => ({
      ...report,
      profiles: { full_name: creatorNameMap.get(report.created_by) ?? "-" }
    }));
    const summaryRows = summaryReportError ? [] : ((summaryReportData ?? []) as unknown as SummaryReportRow[]);
    summaryReports = hasDateRangeFilter
      ? summaryRows
      : namedReports.filter((report) => report.week_start_date === currentWeek.weekStartDate);
    reviewReports = hasSearchFilters
      ? namedReports.flatMap((report) => {
          const matchingItems = filterClientReportSearchItems(report, searchFilters);
          return matchingItems.length > 0
            ? [{ ...report, weekly_client_report_items: matchingItems }]
            : [];
        })
      : namedReports;
    volumeReports = volumeReportError ? [] : ((volumeReportData ?? []) as unknown as DepartmentVolumeReport[]);
    clientCount = count ?? 0;
    initialSubmission = submissionData ? (submissionData as unknown as DepartmentSubmissionInitialRow) : null;
    const adminCreatorIds = new Set(((adminProfileData ?? []) as AdminProfileRow[]).map((adminProfile) => adminProfile.id));
    if (isAdmin(profile)) {
      adminCreatorIds.add(profile.id);
    }
    departmentOpenRequests = makeDepartmentOpenRequestItems(
      [...(clientOpenRequestData ?? []), ...(commonOpenRequestData ?? [])] as unknown as DepartmentOpenRequestQueryRow[],
      categories,
      adminCreatorIds
    );
    initialVacancyRecords = ((vacancyMonthData ?? []) as unknown as DepartmentVacancyDbRow[]).map(mapVacancyRow);
    initialVacancyTrend = buildVacancyTrend(((vacancyTrendData ?? []) as unknown as DepartmentVacancyDbRow[]).map(mapVacancyRow));
  }
  const missingCount = Math.max(clientCount - summaryReports.length, 0);
  const inboundVolumeSummary = summarizeVolumeByUnit(summaryReports, "inbound");
  const outboundVolumeSummary = summarizeVolumeByUnit(summaryReports, "outbound");
  const importanceStats = getImportanceStats(summaryReports);
  const commonSubmissionContent = initialSubmission?.department_weekly_contents.find(
    (content) => content.section_type === "common"
  );
  const departmentCommonMatchesSearch = Boolean(
    hasSearchFilters &&
      initialSubmission &&
      commonSubmissionContent &&
      filterDepartmentCommonSearchItems(
        {
          week_start_date: initialSubmission.week_start_date,
          current_importance: commonSubmissionContent.current_importance ?? "medium",
          current_work_category_id: commonSubmissionContent.current_work_category_id ?? categories[0]?.id ?? "",
          current_week_content: commonSubmissionContent.current_week_content ?? "",
          next_importance: commonSubmissionContent.next_importance ?? "medium",
          next_work_category_id: commonSubmissionContent.next_work_category_id ?? categories[0]?.id ?? "",
          next_week_content: commonSubmissionContent.next_week_content ?? ""
        },
        searchFilters
      ).length > 0
  );
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
        centerOptions={centerOptions}
        initialVacancyRecords={initialVacancyRecords}
        initialVacancyTrend={initialVacancyTrend}
        initialSubmission={initialSubmission}
        initialLookupDepartmentId={initialLookupDepartmentId}
        initialLookupWeekStartDate={currentWeek.weekStartDate}
        initialActiveTab={activeTab}
        commonSearchFilters={searchFilters}
        requireExplicitDepartmentSelection={false}
        volumeSlot={<DepartmentVolumeBoard clients={holidayClientOptions} reports={volumeReports} />}
        dataCollectionSlot={
          initialLookupDepartmentId ? (
            <DepartmentCollectionWorkspace
              departmentId={initialLookupDepartmentId}
              collections={dataCollectionItems}
              initialEntries={dataCollectionEntries}
              canEdit={canEditDataCollection}
            />
          ) : undefined
        }
        dataCollectionHasNew={dataCollectionItems.some((item) => !dataCollectionEntries[item.id])}
        commonRequestSlot={
          profile ? (
            <DepartmentOpenRequestBoard
              requests={departmentOpenRequests}
              currentUserId={profile.id}
              canManageAllRequests={isAdmin(profile)}
            />
          ) : null
        }
        commonSearchSlot={
          <DepartmentCommonSearchToolbar
            key={Object.values(searchFilters).join("|")}
            categories={categories}
            filters={searchFilters}
            resultCount={reviewReports.length + (departmentCommonMatchesSearch ? 1 : 0)}
            unifiedDataSearch
            showQuickReset
          />
        }
        reviewSlot={
          <ClientReviewTable
            reports={reviewReports}
            canAdminEdit={canReviewClientReport(profile)}
            hasSearchFilters={hasSearchFilters}
          />
        }
      >
        <div className="grid auto-rows-fr gap-3 xl:grid-cols-[0.9fr_1.3fr_1fr]">
          <section className="kpi-card flex h-full min-h-[112px] flex-col p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[11px] font-black text-slate-500">작성현황</h2>
                <p className="mt-1.5 text-[15px] leading-none tabular-nums text-[#012241]" style={{ fontWeight: 850 }}>
                  {summaryReports.length}<span className="ml-1 text-[11px] font-bold text-slate-400">/ {clientCount}</span>
                </p>
              </div>
              <span className="icon-badge icon-badge-green" aria-hidden="true">
                <ClipboardCheck className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-auto grid grid-cols-3 gap-1 pt-2.5">
              {[
                { label: "전체", value: clientCount, labelClassName: "text-slate-500", valueClassName: "text-[#012241]" },
                { label: "작성", value: summaryReports.length, labelClassName: "text-[#007050]", valueClassName: "text-[#007050]" },
                { label: "미작성", value: missingCount, labelClassName: "text-rose-600", valueClassName: "text-rose-600" }
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-xl bg-[#faf6ef] px-2 py-1.5 text-center">
                  <p className={cn("text-[11px] font-black leading-none", item.labelClassName)}>{item.label}</p>
                  <p className={cn("mt-1.5 text-base font-black leading-none tabular-nums", item.valueClassName)}>{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="kpi-card flex h-full min-h-[112px] flex-col p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[11px] font-black text-slate-500">내용건수</h2>
                <p className="mt-1.5 text-[15px] leading-none tabular-nums text-[#012241]" style={{ fontWeight: 850 }}>
                  {importanceStats.total}<span className="ml-0.5 text-[11px] font-bold text-slate-400">건</span>
                </p>
              </div>
              <span className="icon-badge icon-badge-amber" aria-hidden="true">
                <ListChecks className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-2.5 flex h-1.5 shrink-0 overflow-hidden rounded-full bg-slate-100">
              {importanceStats.rows.map((row) => (
                <span
                  key={row.importance}
                  className={row.barClassName}
                  style={{ width: `${row.ratio}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="mt-auto grid grid-cols-4 gap-1 pt-2">
              {importanceStats.rows.map((row) => (
                <div key={row.importance} className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#faf6ef] px-1.5 py-1.5">
                  <span className={cn("inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-black leading-4", row.badgeClassName)}>
                    {row.label}
                  </span>
                  <span className="whitespace-nowrap text-xs font-black tabular-nums text-[#012241]">
                    {row.count}<span className="ml-1 text-[10px] font-bold text-slate-400">{row.ratio}%</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="kpi-card flex h-full min-h-[112px] flex-col p-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[11px] font-black text-slate-500">물동량</h2>
              <span className="icon-badge icon-badge-navy" aria-hidden="true">
                <Boxes className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-auto grid grid-cols-2 gap-1 pt-2.5">
              <div className="min-w-0 rounded-xl bg-[#faf6ef] px-2.5 py-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-black leading-none text-emerald-700">
                  <span className="u-dot u-dot-green" aria-hidden="true" />
                  입고
                </p>
                <p className="mt-1.5 break-words text-[15px] leading-none tabular-nums text-[#012241]" style={{ fontWeight: 850 }}>
                  {inboundVolumeSummary}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-[#faf6ef] px-2.5 py-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-black leading-none text-[#007050]">
                  <span className="u-dot" style={{ background: "#007050" }} aria-hidden="true" />
                  출고
                </p>
                <p className="mt-1.5 break-words text-[15px] leading-none tabular-nums text-[#012241]" style={{ fontWeight: 850 }}>
                  {outboundVolumeSummary}
                </p>
              </div>
            </div>
          </section>
        </div>
      </DepartmentSubmissionEditor>
    </>
  );
}
