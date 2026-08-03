import type { SavedClientReportRow } from "@/actions/reports";
import { MobileAppShell, type MobileView } from "@/components/mobile/MobileAppShell";
import { MobileClientReports } from "@/components/mobile/MobileClientReports";
import { MobileDepartmentConfirmedReports } from "@/components/mobile/MobileDepartmentConfirmedReports";
import { MobileSettings } from "@/components/mobile/MobileSettings";
import { DepartmentSubmissionEditor, type DepartmentSubmissionEditorInitialSubmission } from "@/components/reports/DepartmentSubmissionEditor";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canSubmitDepartment, roleLabel } from "@/lib/auth/permissions";
import { getCurrentWeekOption, getReportMonthByThursday, getWeekEndDate, getWeekOfMonth, resolveWeekFromSelection } from "@/lib/dates/week";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClientReportStatus, Importance, VolumeType, VolumeUnit } from "@/types/enums";

type SearchParams = { view?: string; department_id?: string; client_id?: string; report_year?: string; report_month?: string; week_of_month?: string; week_start_date?: string };
type Department = { id: string; department_name: string };
type ClientLink = { department_id: string; clients: { id: string; client_name: string } | null };
type Assignment = { client_id: string };
type Category = { id: string; category_name: string; icon_key: string };
type ReportRow = {
  id: string; created_by: string; department_id: string; client_id: string; report_year: number; report_month: number; week_of_month: number;
  week_start_date: string; status: ClientReportStatus; submitted_at: string | null; clients: { client_name: string } | null;
  weekly_client_report_items: { item_period: "current" | "next"; importance: Importance; work_category_id: string; title: string; content: string; sort_order: number; work_categories: { category_name: string } | null }[];
  weekly_volumes: { volume_type: VolumeType; quantity: number; unit: VolumeUnit; custom_unit: string | null; note: string | null; sort_order: number }[];
};

const REPORT_SELECT = "id,created_by,department_id,client_id,report_year,report_month,week_of_month,week_start_date,status,submitted_at,clients(client_name),weekly_client_report_items(item_period,importance,work_category_id,title,content,sort_order,work_categories(category_name)),weekly_volumes(volume_type,quantity,unit,custom_unit,note,sort_order)";

function getSelectedWeek(params: SearchParams) {
  if (params.week_start_date && /^\d{4}-\d{2}-\d{2}$/.test(params.week_start_date)) {
    const reportMonth = getReportMonthByThursday(params.week_start_date);
    return { ...reportMonth, weekOfMonth: getWeekOfMonth(params.week_start_date), weekStartDate: params.week_start_date, weekEndDate: getWeekEndDate(params.week_start_date), label: "" };
  }
  const year = Number(params.report_year);
  const month = Number(params.report_month);
  const week = Number(params.week_of_month);
  if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(week)) {
    try { return resolveWeekFromSelection(year, month, week); } catch { return getCurrentWeekOption(); }
  }
  return getCurrentWeekOption();
}

function toSavedReport(report: ReportRow, authorName: string): SavedClientReportRow {
  const items = report.weekly_client_report_items.slice().sort((a, b) => a.sort_order - b.sort_order);
  const volumes = report.weekly_volumes.slice().sort((a, b) => a.sort_order - b.sort_order);
  return {
    id: report.id,
    clientId: report.client_id,
    clientName: report.clients?.client_name ?? "-",
    authorName,
    weekStartDate: report.week_start_date,
    weekLabel: `${report.report_year}.${String(report.report_month).padStart(2, "0")} ${report.week_of_month}주차`,
    submittedAt: report.submitted_at,
    currentItems: items.filter((item) => item.item_period === "current").map((item) => ({ importance: item.importance, title: item.title, content: item.content, categoryName: item.work_categories?.category_name ?? "기타" })),
    nextItems: items.filter((item) => item.item_period === "next").map((item) => ({ importance: item.importance, title: item.title, content: item.content, categoryName: item.work_categories?.category_name ?? "기타" })),
    volumes: volumes.map((volume) => ({ volumeType: volume.volume_type, quantity: Number(volume.quantity), unit: volume.unit, customUnit: volume.custom_unit, note: volume.note })),
    status: report.status,
    editReport: {
      id: report.id, department_id: report.department_id, client_id: report.client_id, week_start_date: report.week_start_date,
      items: items.map((item) => ({ item_period: item.item_period, importance: item.importance, work_category_id: item.work_category_id, title: item.title, content: item.content, sort_order: item.sort_order })),
      volumes: volumes.map((volume) => ({ volume_type: volume.volume_type, quantity: Number(volume.quantity), unit: volume.unit, custom_unit: volume.custom_unit, note: volume.note, sort_order: volume.sort_order }))
    }
  };
}

export default async function MobilePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const selectedWeek = getSelectedWeek(params);
  const { profile } = await getCurrentUserProfile();
  const supabase = await createSupabaseServerClient();
  if (!profile || !supabase) return null;

  let dataClient = supabase;
  try { dataClient = createSupabaseAdminClient(); } catch { dataClient = supabase; }

  let departmentOptions: Department[] = [];
  let departmentId = profile.department_id;
  if (profile.app_role === "admin") {
    const { data } = await dataClient.from("departments").select("id,department_name").eq("is_active", true).order("sort_order");
    departmentOptions = (data ?? []) as Department[];
    departmentId = departmentOptions.some((department) => department.id === params.department_id)
      ? params.department_id!
      : departmentOptions.some((department) => department.id === profile.department_id)
        ? profile.department_id
        : departmentOptions[0]?.id ?? null;
  }

  if (!departmentId) {
    return <main className="min-h-dvh bg-[#f4f7fb] px-5 py-16 text-center"><h1 className="text-lg font-black">소속부서를 확인할 수 없습니다.</h1><p className="mt-2 text-sm font-bold text-slate-500">관리자에게 소속부서 등록을 요청하세요.</p></main>;
  }

  const [{ data: departmentData }, { data: categoryData }, { data: linkData }, { data: assignmentData }] = await Promise.all([
    dataClient.from("departments").select("id,department_name").eq("id", departmentId).maybeSingle(),
    dataClient.from("work_categories").select("id,category_name,icon_key").eq("is_active", true).order("sort_order"),
    dataClient.from("department_client_links").select("department_id,clients(id,client_name)").eq("department_id", departmentId).eq("is_active", true),
    profile.app_role === "client_owner" ? dataClient.from("client_assignments").select("client_id").eq("user_id", profile.id).eq("department_id", departmentId).eq("is_active", true) : Promise.resolve({ data: [] })
  ]);
  const department = (departmentData as Department | null) ?? { id: departmentId, department_name: profile.department_name ?? "소속부서" };
  if (departmentOptions.length === 0) departmentOptions = [department];
  const categories = (categoryData ?? []) as Category[];
  const assignmentIds = new Set(((assignmentData ?? []) as Assignment[]).map((row) => row.client_id));
  const linkedClients = ((linkData ?? []) as unknown as ClientLink[]).filter((row) => row.clients).map((row) => ({ id: row.clients!.id, client_name: row.clients!.client_name, department_id: row.department_id })).sort((a, b) => a.client_name.localeCompare(b.client_name, "ko"));
  const clients = profile.app_role === "client_owner" ? linkedClients.filter((client) => assignmentIds.has(client.id)) : linkedClients;
  const selectedClientId = clients.some((client) => client.id === params.client_id) ? params.client_id! : clients[0]?.id ?? "";

  const [{ data: reportData }, { data: confirmedDepartmentReportData }, { data: submissionData }, { data: workerData }] = await Promise.all([
    selectedClientId ? dataClient.from("weekly_client_reports").select(REPORT_SELECT).eq("department_id", departmentId).eq("client_id", selectedClientId).eq("week_start_date", selectedWeek.weekStartDate).is("deleted_at", null).limit(1) : Promise.resolve({ data: [] }),
    dataClient.from("weekly_client_reports").select(REPORT_SELECT).eq("department_id", departmentId).eq("week_start_date", selectedWeek.weekStartDate).in("status", ["submitted", "approved"]).is("deleted_at", null).order("client_id"),
    dataClient.from("department_weekly_submissions").select("id,department_id,week_start_date,status,finalized_at,department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content)").eq("department_id", departmentId).eq("week_start_date", selectedWeek.weekStartDate).is("deleted_at", null).maybeSingle(),
    dataClient.from("profiles").select("id,full_name").eq("department_id", departmentId).eq("is_active", true).order("full_name")
  ]);
  const reports = ((reportData ?? []) as unknown as ReportRow[]).map((report) => toSavedReport(report, report.created_by === profile.id ? profile.full_name : "-") );
  const selectedReport = reports.find((report) => report.weekStartDate === selectedWeek.weekStartDate) ?? null;
  const confirmedDepartmentReports = ((confirmedDepartmentReportData ?? []) as unknown as ReportRow[]).map((report) => toSavedReport(report, report.created_by === profile.id ? profile.full_name : "-"));
  const canEditDepartment = profile.app_role === "admin" || profile.app_role === "department_head" || profile.app_role === "manager";
  const initialView = (["client", "department", "settings"] as MobileView[]).includes(params.view as MobileView) ? params.view as MobileView : "client";

  const departmentView = canEditDepartment ? (
    <DepartmentSubmissionEditor
      departments={[department]}
      categories={categories}
      defaultDepartmentId={departmentId}
      canSubmit={canSubmitDepartment(profile)}
      canEdit
      visibleTabs={["common", "holiday_work", "facility"]}
      mobileMode
      holidayClientOptions={linkedClients}
      holidayWorkerOptions={(workerData ?? []) as { id: string; full_name: string }[]}
      initialSubmission={(submissionData as unknown as DepartmentSubmissionEditorInitialSubmission | null) ?? null}
      initialLookupDepartmentId={departmentId}
      initialLookupWeekStartDate={selectedWeek.weekStartDate}
      reviewSlot={<MobileDepartmentConfirmedReports reports={confirmedDepartmentReports} />}
    />
  ) : (
    <section className="border-y border-[#d9e7f7] bg-white px-5 py-10 text-center"><BuildingLockNotice role={roleLabel(profile.app_role)} /></section>
  );

  return (
    <MobileAppShell
      initialView={initialView}
      departments={departmentOptions}
      clients={clients}
      selectedDepartmentId={departmentId}
      selectedClientId={selectedClientId}
      clientView={<MobileClientReports key={`${departmentId}-${selectedClientId}-${selectedWeek.weekStartDate}`} clients={clients} categories={categories} departmentId={departmentId} selectedClientId={selectedClientId} selectedWeekStartDate={selectedWeek.weekStartDate} selectedReport={selectedReport} />}
      departmentView={departmentView}
      settingsView={<MobileSettings profile={profile} departmentName={department.department_name} clients={clients} />}
    />
  );
}

function BuildingLockNotice({ role }: { role: string }) {
  return <><h2 className="text-base font-black">부서자료는 조회 전용입니다.</h2><p className="mt-2 text-sm font-bold leading-6 text-slate-500">현재 권한은 {role}입니다. 부서자료 작성은 부서장·매니저·관리자 권한에서 사용할 수 있습니다.</p></>;
}
