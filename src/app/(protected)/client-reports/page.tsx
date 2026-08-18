import dynamic from "next/dynamic";
import { type ClientReportTableRow } from "@/components/reports/ClientReportsTable";
import { resolveOwnerClientIds } from "@/lib/auth/client-scope";
import { pickDefaultClientId, pickDefaultDepartmentId } from "@/lib/auth/default-scope";
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
import {
  filterClientReportSearchItems,
  hasClientReportSearchFilters,
  parseClientReportSearchFilters
} from "@/lib/reports/client-report-search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClientReportStatus, VolumeType, VolumeUnit } from "@/types/enums";

type DepartmentOption = { id: string; department_name: string };
type ClientOption = { id: string; client_name: string; department_id: string };
type ClientLinkRow = { department_id: string; clients: { id: string; client_name: string } | null };
type DefaultClientAssignmentRow = { client_id: string; clients: { id: string; client_name: string } | null };
type CategoryOption = { id: string; category_name: string; icon_key: string };
type ProfileNameRow = { id: string; full_name: string };
type ClientReportsSearchParams = {
  department_id?: string;
  client_id?: string;
  status?: ClientReportStatus;
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
type ReportRow = {
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
  submitted_at: string | null;
  updated_at: string;
  departments: { department_name: string } | null;
  clients: { client_name: string } | null;
  profiles: { full_name: string } | null;
  weekly_client_report_items: {
    item_period: "current" | "next";
    importance: "very_high" | "high" | "medium" | "low";
    work_category_id: string;
    title: string;
    content: string;
    sort_order: number;
    work_categories: { category_name: string; icon_key: string } | null;
  }[];
  weekly_volumes: {
    volume_type: VolumeType;
    quantity: number;
    unit: VolumeUnit;
    custom_unit?: string | null;
    note?: string | null;
    sort_order: number;
  }[];
};

const REPORT_LIST_LIMIT = 300;
const CLIENT_REPORT_SELECT =
  "id,created_by,department_id,client_id,report_year,report_month,week_of_month,week_start_date,week_end_date,status,submitted_at,updated_at,departments(department_name),clients(client_name),weekly_client_report_items(item_period,importance,work_category_id,title,content,sort_order,work_categories(category_name,icon_key)),weekly_volumes(volume_type,quantity,unit,custom_unit,note,sort_order)";
const ClientReportsWorkspace = dynamic(
  () => import("@/components/reports/ClientReportsWorkspace").then((mod) => mod.ClientReportsWorkspace),
  {
    loading: () => (
      <div className="sketch-panel flex min-h-64 items-center justify-center p-4 text-sm font-black text-slate-500">
        화주자료 화면을 불러오는 중입니다.
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
    label: `${year}년 ${month}월 ${weekOfMonth}주차`
  };
}

function getSelectedWeek(params: ClientReportsSearchParams) {
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

function toClientReportTableRow(report: ReportRow, editSource: ReportRow = report): ClientReportTableRow {
  return {
    id: report.id,
    clientId: report.client_id,
    clientName: report.clients?.client_name ?? "-",
    authorName: report.profiles?.full_name ?? "-",
    weekStartDate: report.week_start_date,
    weekLabel: `${report.report_year}.${String(report.report_month).padStart(2, "0")} ${report.week_of_month}주차`,
    submittedAt: report.submitted_at,
    currentItems: report.weekly_client_report_items
      .filter((item) => item.item_period === "current")
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((item) => ({
        importance: item.importance,
        title: item.title,
        content: item.content,
        categoryName: item.work_categories?.category_name ?? "기타"
      })),
    nextItems: report.weekly_client_report_items
      .filter((item) => item.item_period === "next")
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((item) => ({
        importance: item.importance,
        title: item.title,
        content: item.content,
        categoryName: item.work_categories?.category_name ?? "기타"
      })),
    volumes: report.weekly_volumes
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((volume) => ({
        volumeType: volume.volume_type,
        quantity: Number(volume.quantity),
        unit: volume.unit,
        customUnit: volume.custom_unit ?? null,
        note: volume.note ?? null
      })),
    status: report.status,
    editReport: {
      id: editSource.id,
      department_id: editSource.department_id,
      client_id: editSource.client_id,
      week_start_date: editSource.week_start_date,
      items: editSource.weekly_client_report_items
        .slice()
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((item) => ({
          item_period: item.item_period,
          importance: item.importance,
          work_category_id: item.work_category_id,
          title: item.title,
          content: item.content,
          sort_order: item.sort_order
        })),
      volumes: editSource.weekly_volumes
        .slice()
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((volume) => ({
          volume_type: volume.volume_type,
          quantity: Number(volume.quantity),
          unit: volume.unit,
          custom_unit: volume.custom_unit ?? null,
          note: volume.note ?? null,
          sort_order: volume.sort_order
        }))
    }
  };
}

export default async function ClientReportsPage({
  searchParams
}: {
  searchParams: Promise<ClientReportsSearchParams>;
}) {
  const params = await searchParams;
  const selectedWeek = getSelectedWeek(params);
  const searchFilters = parseClientReportSearchFilters(params);
  const hasSearchFilters = hasClientReportSearchFilters(searchFilters);
  const hasListScopeFilters = Boolean(searchFilters.dateFrom || searchFilters.dateTo || params.status);
  const { profile } = await getCurrentUserProfile();
  const supabase = await createSupabaseServerClient();
  let departments: DepartmentOption[] = [];
  let clients: ClientOption[] = [];
  let editorClients: ClientOption[] = [];
  let categories: CategoryOption[] = [];
  let reports: ReportRow[] = [];
  let reportSourceById = new Map<string, ReportRow>();
  let editorReport: ReportRow | null = null;
  let defaultDepartmentId = params.department_id ?? null;
  let defaultClientId: string | undefined;

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
      adminDefaultDepartmentId = pickDefaultDepartmentId((defaultDepartments ?? []) as DepartmentOption[], profile.app_role) || undefined;
    }
    const departmentFilter = isAdmin(profile) ? params.department_id ?? adminDefaultDepartmentId : profile.department_id;
    // 부서 범위를 확정하지 못한 비관리자는 전 부서 자료가 새지 않도록 조회 자체를 막는다.
    const isDepartmentScopeBlocked = !isAdmin(profile) && !departmentFilter;
    defaultDepartmentId = departmentFilter ?? null;
    const isClientOwner = profile.app_role === "client_owner";
    let assignedClients: { id: string; client_name: string }[] = [];
    if (isClientOwner && departmentFilter) {
      const { data: assignmentRows } = await dataClient
        .from("client_assignments")
        .select("client_id,clients(id,client_name)")
        .eq("user_id", profile.id)
        .eq("department_id", departmentFilter)
        .eq("is_active", true);
      assignedClients = ((assignmentRows ?? []) as unknown as DefaultClientAssignmentRow[])
        .filter((assignment) => assignment.clients)
        .map((assignment) => ({
          id: assignment.clients?.id ?? assignment.client_id,
          client_name: assignment.clients?.client_name ?? ""
        }))
        .filter((client) => client.id && client.client_name)
        .sort((left, right) => left.client_name.localeCompare(right.client_name, "ko"));
    }
    const assignedClientIds = new Set(assignedClients.map((client) => client.id));
    if (!params.client_id && departmentFilter) {
      if (isClientOwner) {
        defaultClientId = pickDefaultClientId(assignedClients, profile.app_role) || undefined;
      } else {
        const { data: defaultClientLinks } = await dataClient
          .from("department_client_links")
          .select("clients(id,client_name)")
          .eq("department_id", departmentFilter)
          .eq("is_active", true)
          .order("client_id", { ascending: true });
        const defaultClients = ((defaultClientLinks ?? []) as unknown as ClientLinkRow[])
          .filter((link) => link.clients)
          .map((link) => ({
            id: link.clients?.id ?? "",
            client_name: link.clients?.client_name ?? ""
          }))
          .filter((client) => client.id && client.client_name)
          .sort((left, right) => left.client_name.localeCompare(right.client_name, "ko"));
        defaultClientId = pickDefaultClientId(defaultClients, profile.app_role) || undefined;
      }
    }
    const requestedClientFilter = params.client_id ?? defaultClientId;
    const ownerClientIds = isClientOwner ? resolveOwnerClientIds(assignedClientIds, requestedClientFilter) : null;
    const isClientOutOfScope = Boolean(requestedClientFilter) && ownerClientIds?.length === 0;
    const selectedClientFilter = isClientOutOfScope ? undefined : requestedClientFilter;
    defaultClientId = selectedClientFilter;
    const [
      { data: departmentData },
      { data: categoryData },
      { data: clientData },
      { data: profileData },
      { data: reportData, error: reportError },
      { data: editorReportData, error: editorReportError }
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
          .from("department_client_links")
          .select("department_id,clients(id,client_name)")
          .eq("is_active", true)
          .order("department_id");
        if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        return query;
      })(),
      (() => {
        if (isDepartmentScopeBlocked) {
          return Promise.resolve({ data: [], error: null });
        }
        let query = dataClient.from("profiles").select("id,full_name");
        if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        return query;
      })(),
      (() => {
        if (isDepartmentScopeBlocked || ownerClientIds?.length === 0) {
          return Promise.resolve({ data: [], error: null });
        }
        let query = dataClient
          .from("weekly_client_reports")
          .select(CLIENT_REPORT_SELECT)
          .is("deleted_at", null)
          .order("week_start_date", { ascending: false })
          .limit(REPORT_LIST_LIMIT);
        if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        if (ownerClientIds) {
          query = query.in("client_id", ownerClientIds);
        } else if (selectedClientFilter) {
          query = query.eq("client_id", selectedClientFilter);
        }
        if (params.status) {
          query = query.eq("status", params.status);
        }
        if (searchFilters.dateFrom || searchFilters.dateTo) {
          if (searchFilters.dateFrom) {
            query = query.gte("week_start_date", searchFilters.dateFrom);
          }
          if (searchFilters.dateTo) {
            query = query.lte("week_start_date", searchFilters.dateTo);
          }
        } else {
          query = query.eq("week_start_date", selectedWeek.weekStartDate);
        }
        return query;
      })(),
      // 편집 폼 원본은 검색·상태 조건과 무관하게 선택 화주·주차 자료를 그대로 불러온다.
      // 목록 조회 범위가 선택 주차와 같을 때만 목록 결과를 재사용한다.
      (() => {
        if (isDepartmentScopeBlocked || !selectedClientFilter || !hasListScopeFilters) {
          return Promise.resolve({ data: [], error: null });
        }
        let query = dataClient
          .from("weekly_client_reports")
          .select(CLIENT_REPORT_SELECT)
          .eq("client_id", selectedClientFilter)
          .eq("week_start_date", selectedWeek.weekStartDate)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        return query;
      })()
    ]);
    departments = (departmentData ?? []) as DepartmentOption[];
    categories = (categoryData ?? []) as CategoryOption[];
    clients = ((clientData ?? []) as unknown as ClientLinkRow[])
      .filter((link) => link.clients)
      .map((link) => ({
        id: link.clients?.id ?? "",
        client_name: link.clients?.client_name ?? "",
        department_id: link.department_id
      }));
    editorClients = isClientOwner ? clients.filter((client) => assignedClientIds.has(client.id)) : clients;
    const reportRows = reportError ? [] : ((reportData ?? []) as unknown as ReportRow[]);
    const creatorNameMap = new Map(((profileData ?? []) as ProfileNameRow[]).map((creator) => [creator.id, creator.full_name]));
    const namedReports = reportRows.map((report) => ({
      ...report,
      profiles: { full_name: creatorNameMap.get(report.created_by) ?? "-" }
    }));
    reportSourceById = new Map(namedReports.map((report) => [report.id, report]));
    if (editorReportError) {
      console.error("client-reports: editor source lookup failed", editorReportError);
    }
    const editorReportRow = editorReportError
      ? null
      : (((editorReportData ?? []) as unknown as ReportRow[])[0] ?? null);
    if (!selectedClientFilter) {
      editorReport = null;
    } else if (hasListScopeFilters) {
      editorReport = editorReportRow
        ? { ...editorReportRow, profiles: { full_name: creatorNameMap.get(editorReportRow.created_by) ?? "-" } }
        : null;
    } else {
      editorReport = namedReports.find(
        (report) => report.client_id === selectedClientFilter && report.week_start_date === selectedWeek.weekStartDate
      ) ?? null;
    }
    reports = hasSearchFilters
      ? namedReports.flatMap((report) => {
          const matchingItems = filterClientReportSearchItems(report, searchFilters);
          return matchingItems.length > 0
            ? [{ ...report, weekly_client_report_items: matchingItems, weekly_volumes: [] }]
            : [];
        })
      : namedReports;
  }
  const tableRows = reports.map((report) => toClientReportTableRow(report, reportSourceById.get(report.id) ?? report));
  const editorTableRow = editorReport ? toClientReportTableRow(editorReport) : null;

  return (
    <>
      <ClientReportsWorkspace
        key={`client-reports-${defaultDepartmentId ?? "department"}-${defaultClientId ?? "all"}-${params.status ?? "all"}-${selectedWeek.weekStartDate}-${Object.values(searchFilters).join("|")}`}
        departments={departments}
        clients={editorClients}
        categories={categories}
        defaultDepartmentId={defaultDepartmentId}
        defaultClientId={defaultClientId}
        selectedWeekStartDate={selectedWeek.weekStartDate}
        searchFilters={searchFilters}
        hasSearchFilters={hasSearchFilters}
        editorReport={editorTableRow}
        reports={tableRows}
      />
    </>
  );
}
