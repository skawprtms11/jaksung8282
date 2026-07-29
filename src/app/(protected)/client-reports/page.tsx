import { type ClientReportTableRow } from "@/components/reports/ClientReportsTable";
import { ClientReportsWorkspace } from "@/components/reports/ClientReportsWorkspace";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClientReportStatus, VolumeType, VolumeUnit } from "@/types/enums";

type DepartmentOption = { id: string; department_name: string };
type ClientOption = { id: string; client_name: string; department_id: string };
type ClientLinkRow = { department_id: string; clients: { id: string; client_name: string } | null };
type ClientAssignmentRow = { client_id: string };
type CategoryOption = { id: string; category_name: string; icon_key: string };
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

const REPORT_LIST_LIMIT = 100;
const CLIENT_REPORT_SELECT =
  "id,created_by,department_id,client_id,report_year,report_month,week_of_month,week_start_date,week_end_date,status,submitted_at,updated_at,departments(department_name),clients(client_name),weekly_client_report_items(item_period,importance,work_category_id,title,content,sort_order,work_categories(category_name,icon_key)),weekly_volumes(volume_type,quantity,unit,custom_unit,note,sort_order)";

export default async function ClientReportsPage({
  searchParams
}: {
  searchParams: Promise<{
	    department_id?: string;
	    client_id?: string;
	    status?: ClientReportStatus;
	  }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentUserProfile();
  const supabase = await createSupabaseServerClient();
  let departments: DepartmentOption[] = [];
  let clients: ClientOption[] = [];
  let editorClients: ClientOption[] = [];
  let categories: CategoryOption[] = [];
  let reports: ReportRow[] = [];
  let defaultDepartmentId = params.department_id ?? null;

  if (supabase && profile) {
    let dataClient = supabase;
    try {
      dataClient = createSupabaseAdminClient();
    } catch {
      dataClient = supabase;
    }
    let adminDefaultDepartmentId: string | undefined;
    if (isAdmin(profile) && !params.department_id) {
      const { data: firstDepartment } = await dataClient
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
    defaultDepartmentId = departmentFilter ?? null;
    const [{ data: departmentData }, { data: categoryData }, { data: clientData }, { data: assignmentData }, { data: reportData, error: reportError }] = await Promise.all([
      (() => {
        let query = dataClient.from("departments").select("id,department_name").eq("is_active", true).order("sort_order");
        if (!isAdmin(profile) && departmentFilter) {
          query = query.eq("id", departmentFilter);
        }
        return query;
      })(),
      dataClient.from("work_categories").select("id,category_name,icon_key").eq("is_active", true).order("sort_order"),
      (() => {
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
      profile.app_role === "client_owner"
        ? dataClient.from("client_assignments").select("client_id").eq("user_id", profile.id).eq("is_active", true)
        : Promise.resolve({ data: [] }),
      (() => {
        let query = dataClient
          .from("weekly_client_reports")
          .select(CLIENT_REPORT_SELECT)
          .is("deleted_at", null)
          .order("week_start_date", { ascending: false })
          .limit(REPORT_LIST_LIMIT);
        if (params.department_id) {
          query = query.eq("department_id", params.department_id);
        } else if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        if (params.client_id) {
          query = query.eq("client_id", params.client_id);
        }
        if (params.status) {
          query = query.eq("status", params.status);
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
    const assignedClientIds = new Set(((assignmentData ?? []) as ClientAssignmentRow[]).map((assignment) => assignment.client_id));
    editorClients = profile.app_role === "client_owner" ? clients.filter((client) => assignedClientIds.has(client.id)) : clients;
    const reportRows = reportError ? [] : ((reportData ?? []) as unknown as ReportRow[]);
    if (reportRows.length > 0) {
      const creatorIds = Array.from(new Set(reportRows.map((report) => report.created_by)));
      const { data: creatorData } = await dataClient.from("profiles").select("id,full_name").in("id", creatorIds);
      const creatorNameMap = new Map((creatorData ?? []).map((creator) => [creator.id, creator.full_name]));
      reports = reportRows.map((report) => ({
        ...report,
        profiles: { full_name: creatorNameMap.get(report.created_by) ?? "-" }
      }));
    }
  }
  const tableRows: ClientReportTableRow[] = reports.map((report) => ({
    id: report.id,
    clientId: report.client_id,
    clientName: report.clients?.client_name ?? "-",
    authorName: report.profiles?.full_name ?? "-",
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
      id: report.id,
      department_id: report.department_id,
      client_id: report.client_id,
      week_start_date: report.week_start_date,
      items: report.weekly_client_report_items
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
      volumes: report.weekly_volumes
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
  }));

  return (
    <>
      <ClientReportsWorkspace
        key={`client-reports-${defaultDepartmentId ?? "department"}-${params.client_id ?? "all"}-${params.status ?? "all"}`}
        departments={departments}
        clients={editorClients}
        categories={categories}
        defaultDepartmentId={defaultDepartmentId}
        defaultClientId={params.client_id}
        reports={tableRows}
      />
    </>
  );
}
