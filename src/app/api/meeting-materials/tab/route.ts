import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { canViewMeetingMaterials } from "@/lib/auth/permissions";
import {
  getCurrentWeekOption,
  getReportMonthByThursday,
  getWeekEndDate,
  getWeekOfMonth,
  resolveWeekFromSelection,
  type WeekOption
} from "@/lib/dates/week";
import {
  buildMeetingTabData,
  isMeetingMaterialsPayload,
  type MeetingSearchParams,
  type MeetingTab,
  type OpenRequestQueryRow
} from "@/lib/reports/meeting-materials-tab-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const REPORT_LIMIT = 500;
const OPEN_REQUEST_SELECT =
  "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,deleted_at,weekly_client_report_items(id,item_period,title,content,importance,work_categories(category_name),weekly_client_reports(id,department_id,client_id,week_start_date,report_year,report_month,week_of_month,departments(department_name),clients(client_name))),department_weekly_submissions(id,department_id,week_start_date,report_year,report_month,week_of_month,departments(department_name),department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content))";
const validTabs = new Set<MeetingTab>(["collection", "materials", "volumes", "holiday", "facility"]);

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
  const week = Number(params.week_of_month);
  if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(week)) {
    try {
      return resolveWeekFromSelection(year, month, week);
    } catch {
      return getCurrentWeekOption();
    }
  }
  return getCurrentWeekOption();
}

function paramsFromRequest(request: NextRequest): MeetingSearchParams {
  return Object.fromEntries(request.nextUrl.searchParams.entries()) as MeetingSearchParams;
}

async function getCompatibilityRequests(tab: MeetingTab, params: MeetingSearchParams, resolvedDepartmentId: string | null) {
  if (tab !== "collection" && tab !== "materials") return undefined;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("weekly_report_item_requests")
      .select(OPEN_REQUEST_SELECT)
      .is("deleted_at", null)
      .is("closed_at", null)
      .order("created_at", { ascending: false })
      .limit(REPORT_LIMIT);
    if (error) return undefined;
    return ((data ?? []) as unknown as OpenRequestQueryRow[]).filter((request) => {
      if (request.target_type === "client_item") {
        const report = request.weekly_client_report_items?.weekly_client_reports;
        return Boolean(report && (!resolvedDepartmentId || report.department_id === resolvedDepartmentId) && (!params.client_id || report.client_id === params.client_id));
      }
      const submission = request.department_weekly_submissions;
      return Boolean(!params.client_id && submission && (!resolvedDepartmentId || submission.department_id === resolvedDepartmentId));
    });
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const params = paramsFromRequest(request);
  const tab = validTabs.has(params.tab as MeetingTab) ? (params.tab as MeetingTab) : "collection";
  const selectedWeek = getSelectedWeek(params);
  const { profile } = await getCurrentUserProfile();
  if (!profile || !canViewMeetingMaterials(profile)) {
    return NextResponse.json({ error: "회의자료 접근 권한이 없습니다." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "데이터 연결을 확인할 수 없습니다." }, { status: 503 });
  }
  const { data, error } = await supabase.rpc("get_meeting_materials_payload", {
    p_tab: tab,
    p_week_start_date: selectedWeek.weekStartDate,
    p_report_year: selectedWeek.year,
    p_report_month: selectedWeek.month,
    p_week_of_month: selectedWeek.weekOfMonth,
    p_department_id: params.department_id ?? null,
    p_client_id: params.client_id ?? null
  });
  if (error || !isMeetingMaterialsPayload(data)) {
    return NextResponse.json({ error: error?.message ?? "회의자료 응답 형식이 올바르지 않습니다.", fallback: true }, { status: 503 });
  }

  const compatibilityRequests = await getCompatibilityRequests(tab, params, data.resolvedDepartmentId);
  const tabData = buildMeetingTabData({
    tab,
    payload: data,
    params,
    selectedWeek,
    openRequests: compatibilityRequests ?? data.openRequests
  });
  return NextResponse.json(tabData, {
    headers: { "Cache-Control": "private, no-store", "Server-Timing": "meeting-tab;desc=meeting materials tab payload" }
  });
}
