import type { VolumeChartRow } from "@/components/charts/VolumeComparisonChart";
import type { MeetingDepartmentVolumeRow, MeetingDepartmentVolumeValue } from "@/components/reports/MeetingDepartmentVolumeBoard";
import type { MeetingOpenRequestItem, MeetingPriorityItem } from "@/components/reports/MeetingPriorityPanel";
import type { DepartmentOpenRequestItem } from "@/components/reports/DepartmentOpenRequestBoard";
import type { MeetingMaterialsReport, MeetingReportItemRequest } from "@/components/reports/MeetingMaterialsTable";
import {
  filterClientReportSearchItems,
  hasClientReportSearchFilters,
  parseClientReportSearchFilters,
  parseDepartmentCommonContentItems,
  type ClientReportSearchFilters
} from "@/lib/reports/client-report-search";
import type { WeekOption } from "@/lib/dates/week";
import type { DepartmentSubmissionStatus, Importance, ItemPeriod, VolumeType, VolumeUnit } from "@/types/enums";

export type MeetingTab = "collection" | "materials" | "volumes" | "holiday" | "facility";

export type MeetingSearchParams = {
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

export type DepartmentRow = { id: string; department_name: string };
export type ClientSummaryRow = { id: string; department_id: string };
export type WorkCategoryRow = { id: string; category_name: string };

export type ReportItemRequestRow = {
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

export type MeetingReportRow = MeetingMaterialsReport & {
  weekly_volumes: { volume_type: VolumeType; quantity: number; unit: VolumeUnit }[];
};

export type VolumeTrendReportRow = Pick<MeetingReportRow, "id" | "department_id" | "client_id" | "weekly_volumes"> & {
  week_of_month: number;
};

export type DepartmentContentRow = {
  section_type: "common" | "facility" | "vacancy" | "holiday_work";
  current_importance: Importance;
  current_work_category_id: string | null;
  current_week_content: string;
  next_importance: Importance;
  next_work_category_id: string | null;
  next_week_content: string;
};

export type SubmissionRow = {
  id: string;
  status: DepartmentSubmissionStatus;
  department_id: string;
  week_start_date: string;
  finalized_at: string | null;
  departments?: { department_name: string } | null;
  department_weekly_contents: DepartmentContentRow[];
};

export type OpenRequestQueryRow = ReportItemRequestRow & {
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

export type MeetingMaterialsPayload = {
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

export type CollectionTabData = {
  tab: "collection";
  departments: DepartmentRow[];
  submissions: SubmissionRow[];
  priorityItems: MeetingPriorityItem[];
  openRequestItems: MeetingOpenRequestItem[];
  clientCounts: Record<string, number>;
  writtenClientCounts: Record<string, number>;
};

export type MaterialsTabData = {
  tab: "materials";
  reports: MeetingReportRow[];
  confirmationRequestItems: DepartmentOpenRequestItem[];
  workCategories: WorkCategoryRow[];
  filters: ClientReportSearchFilters;
  hasSearchFilters: boolean;
};

export type VolumesTabData = {
  tab: "volumes";
  chartRows: VolumeChartRow[];
  departmentRows: MeetingDepartmentVolumeRow[];
};

export type DepartmentBoardTabData = {
  tab: "holiday" | "facility";
  departments: DepartmentRow[];
  submissions: SubmissionRow[];
  selectedWeek: WeekOption;
};

export type MeetingTabData = CollectionTabData | MaterialsTabData | VolumesTabData | DepartmentBoardTabData;

export function isMeetingMaterialsPayload(value: unknown): value is MeetingMaterialsPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<MeetingMaterialsPayload>;
  return [
    payload.departments,
    payload.clients,
    payload.reports,
    payload.openRequests,
    payload.submissions,
    payload.workCategories,
    payload.commonMaterialRequests,
    payload.volumeTrendReports,
    payload.previousVolumeTrendReports
  ].every(Array.isArray);
}

function normalizeReports(rows: MeetingReportRow[]) {
  return rows.map((report) => ({
    ...report,
    weekly_client_report_items: (report.weekly_client_report_items ?? []).map((item) => ({
      ...item,
      weekly_report_item_requests: (item.weekly_report_item_requests ?? [])
        .filter((request) => !(request as ReportItemRequestRow).deleted_at)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
      request_target_key: item.id,
      request_target_type: "client_item" as const,
      request_department_submission_id: null,
      request_item_sort_order: null
    })),
    weekly_volumes: report.weekly_volumes ?? []
  }));
}

function attachCommonRequests(rows: MeetingReportRow[], requests: ReportItemRequestRow[]) {
  const requestMap = new Map<string, ReportItemRequestRow[]>();
  requests.forEach((request) => requestMap.set(request.target_key, [...(requestMap.get(request.target_key) ?? []), request]));
  return rows.map((report) => ({
    ...report,
    weekly_client_report_items: report.weekly_client_report_items.map((item) => ({
      ...item,
      weekly_report_item_requests: requestMap.get(item.request_target_key) ?? []
    }))
  }));
}

function makeCommonRows(submissions: SubmissionRow[], departments: DepartmentRow[], categories: WorkCategoryRow[]): MeetingReportRow[] {
  const departmentNames = new Map(departments.map((row) => [row.id, row.department_name]));
  const categoryNames = new Map(categories.map((row) => [row.id, row.category_name]));
  return submissions.flatMap((submission) => {
    const content = submission.department_weekly_contents.find((row) => row.section_type === "common");
    if (!content) return [];
    const makeItems = (period: ItemPeriod) =>
      parseDepartmentCommonContentItems(
        period === "current" ? content.current_week_content : content.next_week_content,
        period === "current" ? content.current_importance : content.next_importance,
        (period === "current" ? content.current_work_category_id : content.next_work_category_id) ?? "",
        "공통사항"
      ).map((item) => ({
        id: `${submission.id}:common:${period}:${item.sort_order}`,
        item_period: period,
        title: item.title,
        content: item.content,
        importance: item.importance,
        work_categories: { category_name: item.work_category_id ? categoryNames.get(item.work_category_id) ?? "기타" : "기타" },
        weekly_report_item_requests: [],
        request_target_key: `${submission.id}:common:${period}:${item.sort_order}`,
        request_target_type: "department_common" as const,
        request_department_submission_id: submission.id,
        request_item_sort_order: item.sort_order
      }));
    const items = [...makeItems("current"), ...makeItems("next")];
    if (items.length === 0) return [];
    return [{
      id: `${submission.id}-common`,
      department_id: submission.department_id,
      client_id: "common",
      departments: { department_name: departmentNames.get(submission.department_id) ?? submission.departments?.department_name ?? "-" },
      clients: { client_name: "공통사항" },
      weekly_client_report_items: items,
      weekly_volumes: []
    }];
  });
}

function makePriorityItems(reports: MeetingReportRow[]): MeetingPriorityItem[] {
  return reports.flatMap((report) => report.weekly_client_report_items
    .filter((item) => item.importance === "very_high" || item.importance === "high")
    .map((item) => ({
      id: item.id,
      title: item.title?.trim() || item.content.split("\n")[0]?.trim() || "제목 없음",
      content: item.content,
      importance: item.importance as "very_high" | "high",
      period: item.item_period,
      categoryName: item.work_categories?.category_name ?? "기타",
      departmentName: report.departments?.department_name ?? "-",
      clientName: report.clients?.client_name ?? "-"
    })))
    .sort((left, right) => left.importance === right.importance
      ? left.departmentName.localeCompare(right.departmentName, "ko")
      : left.importance === "very_high" ? -1 : 1);
}

export function makeConfirmationRequestItems(
  rows: OpenRequestQueryRow[],
  categories: WorkCategoryRow[],
  departmentFilter?: string,
  clientFilter?: string
): DepartmentOpenRequestItem[] {
  const categoryNames = new Map(categories.map((row) => [row.id, row.category_name]));
  const requestsByTarget = rows.reduce((map, request) => {
    const targetRequests = map.get(request.target_key) ?? [];
    targetRequests.push(request);
    map.set(request.target_key, targetRequests);
    return map;
  }, new Map<string, MeetingReportItemRequest[]>());

  return rows
    .filter((request) => !request.closed_at && !request.deleted_at)
    .map((request): DepartmentOpenRequestItem | null => {
      const targetRequests = requestsByTarget.get(request.target_key) ?? [request];
      if (request.target_type === "client_item") {
        const item = request.weekly_client_report_items;
        const report = item?.weekly_client_reports;
        if (!item || !report || (departmentFilter && report.department_id !== departmentFilter) || (clientFilter && report.client_id !== clientFilter)) {
          return null;
        }
        const departmentName = report.departments?.department_name ?? "-";
        const clientName = report.clients?.client_name ?? "-";
        const categoryName = item.work_categories?.category_name ?? "기타";
        const title = item.title?.trim() || item.content.split("\n")[0]?.trim() || "제목 없음";
        return {
          requestId: request.id,
          requestCreatedAt: request.created_at,
          weekLabel: `${report.report_year}.${String(report.report_month).padStart(2, "0")} ${report.week_of_month}주차 · ${item.item_period === "current" ? "금주" : "차주"}`,
          sourceLabel: `${departmentName} · ${clientName}`,
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
        clientFilter ||
        (departmentFilter && submission.department_id !== departmentFilter) ||
        !request.item_period ||
        typeof request.item_sort_order !== "number"
      ) {
        return null;
      }
      const content = submission.department_weekly_contents.find((row) => row.section_type === "common");
      if (!content) return null;
      const items = parseDepartmentCommonContentItems(
        request.item_period === "current" ? content.current_week_content : content.next_week_content,
        request.item_period === "current" ? content.current_importance : content.next_importance,
        (request.item_period === "current" ? content.current_work_category_id : content.next_work_category_id) ?? "",
        "공통사항"
      );
      const item = items.find((row) => row.sort_order === request.item_sort_order) ?? items[0];
      const departmentName = submission.departments?.department_name ?? "-";
      const categoryName = item?.work_category_id ? categoryNames.get(item.work_category_id) ?? "기타" : "기타";
      const title = item?.title?.trim() || item?.content.split("\n")[0]?.trim() || "제목 없음";
      return {
        requestId: request.id,
        requestCreatedAt: request.created_at,
        weekLabel: `${submission.report_year}.${String(submission.report_month).padStart(2, "0")} ${submission.week_of_month}주차 · ${request.item_period === "current" ? "금주" : "차주"}`,
        sourceLabel: `${departmentName} · 부서 공통사항`,
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
            content: item?.content ?? "-",
            importance: item?.importance ?? (request.item_period === "current" ? content.current_importance : content.next_importance),
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

export function makePriorityOpenRequestItems(items: DepartmentOpenRequestItem[]): MeetingOpenRequestItem[] {
  return items.map((request) => {
    const weekMatch = /^(\d{4})\.(\d{2})\s+(\d+)주차/.exec(request.weekLabel);
    return {
      id: request.requestId,
      requestDate: request.requestCreatedAt,
      monthLabel: weekMatch ? `${weekMatch[1].slice(2)}/${weekMatch[2]}` : "-",
      weekLabel: weekMatch ? `${weekMatch[3]}주차` : request.weekLabel,
      departmentName: request.selection.departmentName,
      clientName: request.selection.clientName,
      categoryName: request.categoryName,
      title: request.title,
      content: request.selection.item.content,
      requestContent: request.requestContent,
      resultContent: request.resultContent
    };
  });
}

function makeChartRows(reports: VolumeTrendReportRow[], lastWeek: number): VolumeChartRow[] {
  const rows = Array.from({ length: Math.max(1, Math.min(lastWeek, 6)) }, (_, index) => ({ name: `${index + 1}주차`, inbound: 0, outbound: 0, total: 0 }));
  let hasVolume = false;
  reports.forEach((report) => (report.weekly_volumes ?? []).forEach((volume) => {
    const row = rows[report.week_of_month - 1];
    if (!row || (volume.volume_type !== "inbound" && volume.volume_type !== "outbound")) return;
    const quantity = Number(volume.quantity);
    row[volume.volume_type] += quantity;
    row.total += quantity;
    hasVolume = true;
  }));
  return hasVolume ? rows : [];
}

function createVolumeValue(): MeetingDepartmentVolumeValue { return { inbound: 0, outbound: 0, total: 0 }; }
function addVolumes(target: MeetingDepartmentVolumeValue, volumes: MeetingReportRow["weekly_volumes"]) {
  volumes.forEach((volume) => {
    if (volume.volume_type !== "inbound" && volume.volume_type !== "outbound") return;
    const quantity = Number(volume.quantity);
    target[volume.volume_type] += quantity;
    target.total += quantity;
  });
}
function makeDepartmentRows(departments: DepartmentRow[], current: VolumeTrendReportRow[], previous: VolumeTrendReportRow[]) {
  const rows = new Map<string, MeetingDepartmentVolumeRow>();
  departments.forEach((department) => rows.set(department.id, { departmentId: department.id, departmentName: department.department_name,
    weeks: Array.from({ length: 5 }, createVolumeValue), totals: createVolumeValue(), previousTotals: createVolumeValue() }));
  current.forEach((report) => {
    const row = rows.get(report.department_id);
    const week = row?.weeks[report.week_of_month - 1];
    if (!row || !week) return;
    addVolumes(week, report.weekly_volumes ?? []);
    addVolumes(row.totals, report.weekly_volumes ?? []);
  });
  previous.forEach((report) => {
    const row = rows.get(report.department_id);
    if (row && report.week_of_month >= 1 && report.week_of_month <= 5) addVolumes(row.previousTotals, report.weekly_volumes ?? []);
  });
  return Array.from(rows.values());
}

function filterMaterialRows(reports: MeetingReportRow[], weekStartDate: string, filters: ClientReportSearchFilters, categories: WorkCategoryRow[]) {
  const categoryIds = new Map(categories.map((row) => [row.category_name, row.id]));
  return reports.map((report) => {
    const items = filterClientReportSearchItems({ week_start_date: weekStartDate, weekly_client_report_items: report.weekly_client_report_items.map((item) => ({
      source: item, item_period: item.item_period, importance: item.importance,
      work_category_id: categoryIds.get(item.work_categories?.category_name ?? "") ?? "", title: item.title ?? "", content: item.content
    })) }, filters);
    return items.length ? { ...report, weekly_client_report_items: items.map((item) => item.source) } : null;
  }).filter((report): report is MeetingReportRow => Boolean(report));
}

export function buildMeetingTabData({ tab, payload, params, selectedWeek, openRequests = payload.openRequests }: {
  tab: MeetingTab; payload: MeetingMaterialsPayload; params: MeetingSearchParams; selectedWeek: WeekOption; openRequests?: OpenRequestQueryRow[];
}): MeetingTabData {
  const departments = payload.departments;
  const submissions = payload.submissions.map((row) => ({ ...row, department_weekly_contents: row.department_weekly_contents ?? [] }));
  const reports = normalizeReports(payload.reports);
  if (tab === "collection") {
    const clientCounts: Record<string, number> = {};
    const written = new Map<string, Set<string>>();
    payload.clients.forEach((client) => { clientCounts[client.department_id] = (clientCounts[client.department_id] ?? 0) + 1; });
    reports.forEach((report) => written.set(report.department_id, new Set([...(written.get(report.department_id) ?? []), report.client_id])));
    const confirmationRequests = makeConfirmationRequestItems(openRequests, payload.workCategories, payload.resolvedDepartmentId ?? undefined, params.client_id);
    return { tab, departments, submissions, priorityItems: makePriorityItems(reports),
      openRequestItems: makePriorityOpenRequestItems(confirmationRequests),
      clientCounts, writtenClientCounts: Object.fromEntries(Array.from(written, ([key, value]) => [key, value.size])) };
  }
  if (tab === "materials") {
    const filters = parseClientReportSearchFilters(params);
    const common = attachCommonRequests(makeCommonRows(submissions, departments, payload.workCategories), payload.commonMaterialRequests);
    const materialRows = [...common, ...reports];
    return { tab, reports: hasClientReportSearchFilters(filters) ? filterMaterialRows(materialRows, selectedWeek.weekStartDate, filters, payload.workCategories) : materialRows,
      confirmationRequestItems: makeConfirmationRequestItems(openRequests, payload.workCategories, payload.resolvedDepartmentId ?? undefined, params.client_id),
      workCategories: payload.workCategories, filters, hasSearchFilters: hasClientReportSearchFilters(filters) };
  }
  if (tab === "volumes") return { tab, chartRows: makeChartRows(payload.volumeTrendReports, selectedWeek.weekOfMonth),
    departmentRows: makeDepartmentRows(departments, payload.volumeTrendReports, payload.previousVolumeTrendReports) };
  return { tab, departments, submissions, selectedWeek };
}
