"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import {
  canSubmitDepartment,
  canReviewClientReport,
  isAdmin,
  isAllowedClientTransition,
  isAllowedDepartmentTransition,
} from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  clientReportSchema,
  departmentSubmissionSchema,
  idSchema,
  reportItemRequestResultSchema,
  reportItemRequestSchema
} from "@/lib/validations/common";
import { formDataToObject, safeErrorMessage, type ActionResult } from "@/lib/utils/form";
import type { Json } from "@/types/database";
import type { ClientReportStatus, DepartmentSubmissionStatus, VolumeType, VolumeUnit } from "@/types/enums";

type DepartmentVacancyRecord = {
  id: string;
  department_id: string;
  center_master_id: string;
  center_name: string;
  week_start_date: string;
  week_end_date: string;
  report_year: number;
  report_month: number;
  week_of_month: number;
  operating_area: number;
  simple_storage_area: number;
  vacancy_area: number;
  total_area: number;
  simple_storage_note: string | null;
  vacancy_note: string | null;
  updated_at: string;
};

type DepartmentVacancyTrendPoint = {
  center_master_id: string;
  center_name: string;
  week_start_date: string;
  label: string;
  simple_storage_area: number;
  vacancy_area: number;
};

type DepartmentSubmissionContentPayload = {
  section_type: "common" | "facility" | "vacancy" | "holiday_work";
  current_importance: "very_high" | "high" | "medium" | "low";
  current_work_category_id: string | null;
  current_week_content: string;
  next_importance: "very_high" | "high" | "medium" | "low";
  next_work_category_id: string | null;
  next_week_content: string;
};

type DepartmentSubmissionLoadRow = {
  id: string;
  department_id: string;
  week_start_date: string;
  status: DepartmentSubmissionStatus;
  exception_reason: string | null;
  finalized_at: string | null;
  department_weekly_contents: DepartmentSubmissionContentPayload[];
};

type ClientHistoricalVolumeRow = {
  client_id: string;
  week_start_date: string;
  volume_type: VolumeType;
  quantity: number;
  unit: VolumeUnit;
};

type ClientHistoricalReportRow = {
  client_id: string;
  week_start_date: string;
  weekly_volumes: { volume_type: VolumeType; quantity: number; unit: VolumeUnit }[];
};

type SavedDepartmentSubmissionResult = {
  id?: string;
  status: DepartmentSubmissionStatus;
  finalized_at?: string | null;
};

type SavedClientReportDbRow = {
  id: string;
  created_by: string;
  department_id: string;
  client_id: string;
  report_year: number;
  report_month: number;
  week_of_month: number;
  week_start_date: string;
  status: ClientReportStatus;
  submitted_at: string | null;
  clients: { client_name: string } | null;
  weekly_client_report_items: {
    item_period: "current" | "next";
    importance: "very_high" | "high" | "medium" | "low";
    work_category_id: string;
    title: string;
    content: string;
    sort_order: number;
    work_categories: { category_name: string } | null;
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

type ReportItemAccessRow = {
  id: string;
  weekly_client_reports: {
    department_id: string;
    client_id: string;
  } | null;
};

type DepartmentSubmissionAccessRow = {
  id: string;
  department_id: string;
};

type ReportItemRequestTarget = {
  target_type: "client_item" | "department_common";
  report_item_id?: string | null;
  department_submission_id?: string | null;
  item_period?: "current" | "next" | null;
  item_sort_order?: number | null;
};

const vacancyRecordSchema = z.object({
  id: z.string().uuid().optional(),
  department_id: idSchema,
  center_master_id: idSchema,
  week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  week_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  report_year: z.coerce.number().int().min(2020).max(2100),
  report_month: z.coerce.number().int().min(1).max(12),
  week_of_month: z.coerce.number().int().min(1).max(6),
  operating_area: z.coerce.number().min(0, "운영면적은 0 이상이어야 합니다."),
  simple_storage_area: z.coerce.number().min(0, "단순보관은 0 이상이어야 합니다."),
  vacancy_area: z.coerce.number().min(0, "공실은 0 이상이어야 합니다."),
  total_area: z.coerce.number().min(0, "전체면적은 0 이상이어야 합니다."),
  simple_storage_note: z.string().trim().optional().nullable(),
  vacancy_note: z.string().trim().optional().nullable()
});

type ReportItemRequestActionRow = {
  id: string;
  target_type: "client_item" | "department_common";
  target_key: string;
  report_item_id: string | null;
  department_submission_id: string | null;
  section_type: "common" | "facility" | "vacancy" | "holiday_work" | null;
  item_period: "current" | "next" | null;
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

export type SavedClientReportRow = {
  id: string;
  clientId: string;
  clientName: string;
  authorName: string;
  weekStartDate: string;
  weekLabel: string;
  submittedAt: string | null;
  currentItems: {
    importance: "very_high" | "high" | "medium" | "low";
    title: string;
    content: string;
    categoryName: string;
  }[];
  nextItems: {
    importance: "very_high" | "high" | "medium" | "low";
    title: string;
    content: string;
    categoryName: string;
  }[];
  volumes: {
    volumeType: VolumeType;
    quantity: number;
    unit: VolumeUnit;
    customUnit?: string | null;
    note?: string | null;
  }[];
  status: ClientReportStatus;
  editReport: {
    id: string;
    department_id: string;
    client_id: string;
    week_start_date: string;
    items: {
      item_period: "current" | "next";
      importance: "very_high" | "high" | "medium" | "low";
      work_category_id: string;
      title: string;
      content: string;
      sort_order: number;
    }[];
    volumes: {
      volume_type: VolumeType;
      quantity: number;
      unit: VolumeUnit;
      custom_unit?: string | null;
      note?: string | null;
      sort_order: number;
    }[];
  };
};

const SAVED_CLIENT_REPORT_SELECT =
  "id,created_by,department_id,client_id,report_year,report_month,week_of_month,week_start_date,status,submitted_at,clients(client_name),weekly_client_report_items(item_period,importance,work_category_id,title,content,sort_order,work_categories(category_name)),weekly_volumes(volume_type,quantity,unit,custom_unit,note,sort_order)";

const REPORT_ITEM_REQUEST_SELECT =
  "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at";

function parseJsonField<T>(formData: FormData, key: string, fallback: T): T {
  const raw = formData.get(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function getSelectedReportIds(formData: FormData) {
  return Array.from(new Set(formData.getAll("report_ids").map((value) => String(value)).filter(Boolean)));
}

const CONFIRMATION_CANCEL_WINDOW_DAYS = 3;
const CONFIRMATION_CANCEL_WINDOW_MS = CONFIRMATION_CANCEL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function isPastConfirmationCancelWindow(confirmedAt: string | null | undefined) {
  if (!confirmedAt) {
    return false;
  }
  const confirmedTime = new Date(confirmedAt).getTime();
  if (!Number.isFinite(confirmedTime)) {
    return false;
  }
  return Date.now() - confirmedTime > CONFIRMATION_CANCEL_WINDOW_MS;
}

function makeReportItemRequestTargetKey(target: ReportItemRequestTarget) {
  if (target.target_type === "client_item") {
    return target.report_item_id ?? "";
  }
  return `${target.department_submission_id ?? ""}:common:${target.item_period ?? ""}:${target.item_sort_order ?? ""}`;
}

async function canAccessReportItemRequestTarget(target: ReportItemRequestTarget) {
  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false as const, message: "로그인이 필요합니다.", profile: null };
  }
  if (!profile.is_active) {
    return { ok: false as const, message: "비활성 사용자는 요청사항을 처리할 수 없습니다.", profile: null };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, message: "Supabase 환경변수를 먼저 설정하세요.", profile: null };
  }

  if (target.target_type === "client_item") {
    if (!target.report_item_id) {
      return { ok: false as const, message: "화주자료 항목을 확인하세요.", profile: null };
    }
    const { data, error } = await supabase
      .from("weekly_client_report_items")
      .select("id,weekly_client_reports!inner(department_id,client_id)")
      .eq("id", target.report_item_id)
      .is("weekly_client_reports.deleted_at", null)
      .maybeSingle();

    if (error) {
      return { ok: false as const, message: safeErrorMessage(error.message), profile: null };
    }

    const row = data as unknown as ReportItemAccessRow | null;
    if (!row?.weekly_client_reports) {
      return { ok: false as const, message: "화주자료 항목을 찾을 수 없습니다.", profile: null };
    }

    if (!isAdmin(profile) && row.weekly_client_reports.department_id !== profile.department_id) {
      return { ok: false as const, message: "소속 부서의 화주자료에만 요청사항을 등록할 수 있습니다.", profile: null };
    }

    return { ok: true as const, profile };
  }

  if (!target.department_submission_id || !target.item_period || typeof target.item_sort_order !== "number") {
    return { ok: false as const, message: "공통사항 항목을 확인하세요.", profile: null };
  }
  const { data, error } = await supabase
    .from("department_weekly_submissions")
    .select("id,department_id")
    .eq("id", target.department_submission_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    return { ok: false as const, message: safeErrorMessage(error.message), profile: null };
  }
  const row = data as DepartmentSubmissionAccessRow | null;
  if (!row) {
    return { ok: false as const, message: "부서 공통사항을 찾을 수 없습니다.", profile: null };
  }
  if (!isAdmin(profile) && row.department_id !== profile.department_id) {
    return { ok: false as const, message: "소속 부서의 공통사항에만 요청사항을 등록할 수 있습니다.", profile: null };
  }
  return { ok: true as const, profile };
}

async function softDeleteClientReports(reportIds: string[]) {
  if (reportIds.length === 0) {
    return { ok: false, message: "삭제할 화주별 자료를 선택하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { error } = await supabase.rpc("soft_delete_client_reports_atomic", {
    p_report_ids: reportIds
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  return { ok: true, message: "선택한 화주별 자료를 삭제했습니다." };
}

export async function saveClientReportAction(_: ActionResult<SavedClientReportRow> | null, formData: FormData): Promise<ActionResult<SavedClientReportRow>> {
  const object = {
    ...formDataToObject(formData),
    items: parseJsonField(formData, "items", []),
    volumes: parseJsonField(formData, "volumes", [])
  };
  const parsed = clientReportSchema.safeParse(object);
  if (!parsed.success) {
    return { ok: false, message: "입력값을 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { id, items, volumes, status } = parsed.data;
  const nextStatus: ClientReportStatus = status;
  if (nextStatus !== "draft" && nextStatus !== "submitted") {
    return { ok: false, message: "화주자료 작성 화면에서는 저장 또는 확정만 처리할 수 있습니다." };
  }
  const reportId = id ?? "";
  const profilePromise = getCurrentUserProfile();

  const { data: savedResult, error } = await supabase.rpc("save_client_report_atomic", {
    p_report_id: reportId || null,
    p_department_id: parsed.data.department_id,
    p_client_id: parsed.data.client_id,
    p_week_start_date: parsed.data.week_start_date,
    p_week_end_date: parsed.data.week_end_date,
    p_report_year: parsed.data.report_year,
    p_report_month: parsed.data.report_month,
    p_week_of_month: parsed.data.week_of_month,
    p_status: nextStatus,
    p_no_special_issue: parsed.data.no_special_issue,
    p_items: items as Json,
    p_volumes: volumes as Json
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidatePath("/department-reports");

  const savedId =
    savedResult && typeof savedResult === "object" && !Array.isArray(savedResult) && "id" in savedResult
      ? String(savedResult.id ?? "")
      : "";
  if (!savedId) {
    return { ok: true, message: nextStatus === "submitted" ? "검토요청을 완료했습니다." : "화주별 자료를 저장했습니다." };
  }

  const [{ data: savedReport }, { profile }] = await Promise.all([
    supabase
      .from("weekly_client_reports")
      .select(SAVED_CLIENT_REPORT_SELECT)
      .eq("id", savedId)
      .is("deleted_at", null)
      .maybeSingle(),
    profilePromise
  ]);
  if (!savedReport) {
    return { ok: true, message: nextStatus === "submitted" ? "검토요청을 완료했습니다." : "화주별 자료를 저장했습니다." };
  }

  const report = savedReport as unknown as SavedClientReportDbRow;
  const sortedItems = report.weekly_client_report_items.slice().sort((left, right) => left.sort_order - right.sort_order);
  const sortedVolumes = report.weekly_volumes.slice().sort((left, right) => left.sort_order - right.sort_order);
  const row: SavedClientReportRow = {
    id: report.id,
    clientId: report.client_id,
    clientName: report.clients?.client_name ?? "-",
    authorName: profile?.id === report.created_by ? profile.full_name : "-",
    weekStartDate: report.week_start_date,
    weekLabel: `${report.report_year}.${String(report.report_month).padStart(2, "0")} ${report.week_of_month}주차`,
    submittedAt: report.submitted_at,
    currentItems: sortedItems
      .filter((item) => item.item_period === "current")
      .map((item) => ({
        importance: item.importance,
        title: item.title,
        content: item.content,
        categoryName: item.work_categories?.category_name ?? "기타"
      })),
    nextItems: sortedItems
      .filter((item) => item.item_period === "next")
      .map((item) => ({
        importance: item.importance,
        title: item.title,
        content: item.content,
        categoryName: item.work_categories?.category_name ?? "기타"
      })),
    volumes: sortedVolumes.map((volume) => ({
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
      items: sortedItems.map((item) => ({
        item_period: item.item_period,
        importance: item.importance,
        work_category_id: item.work_category_id,
        title: item.title,
        content: item.content,
        sort_order: item.sort_order
      })),
      volumes: sortedVolumes.map((volume) => ({
        volume_type: volume.volume_type,
        quantity: Number(volume.quantity),
        unit: volume.unit,
        custom_unit: volume.custom_unit ?? null,
        note: volume.note ?? null,
        sort_order: volume.sort_order
      }))
    }
  };

  return {
    ok: true,
    message: nextStatus === "submitted" ? "검토요청을 완료했습니다." : "화주별 자료를 저장했습니다.",
    data: row
  };
}

export async function transitionClientReportAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const reportId = String(formData.get("report_id") ?? "");
  const nextStatus = String(formData.get("next_status") ?? "") as ClientReportStatus;
  const comment = String(formData.get("comment") ?? "").trim();
  if (nextStatus === "rejected" && !comment) {
    return { ok: false, message: "반려사유를 입력하세요." };
  }
  const { profile } = await getCurrentUserProfile();
  if (!canReviewClientReport(profile)) {
    return { ok: false, message: "화주자료 승인·반려 권한이 없습니다." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { data: report } = await supabase
    .from("weekly_client_reports")
    .select("status,department_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return { ok: false, message: "자료를 찾을 수 없습니다." };
  }
  if (!isAllowedClientTransition(report.status, nextStatus)) {
    return { ok: false, message: "허용되지 않은 상태 변경입니다." };
  }
  if (!isAdmin(profile) && profile?.department_id !== report.department_id) {
    return { ok: false, message: "소속 부서 자료만 검토할 수 있습니다." };
  }
  const { error } = await supabase.rpc("transition_client_report_status", {
    report_id: reportId,
    next_status: nextStatus,
    comment
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  return { ok: true, message: "상태를 변경했습니다." };
}

export async function deleteClientReportAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const reportId = String(formData.get("report_id") ?? "");
  return softDeleteClientReports(reportId ? [reportId] : []);
}

export async function submitSelectedClientReportsAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const reportIds = getSelectedReportIds(formData);
  if (reportIds.length === 0) {
    return { ok: false, message: "확정할 화주별 자료를 선택하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { error } = await supabase.rpc("submit_client_reports_atomic", {
    p_report_ids: reportIds
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  return { ok: true, message: "선택한 화주별 자료를 확정했습니다." };
}

export async function cancelSubmittedClientReportsAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const reportIds = getSelectedReportIds(formData);
  if (reportIds.length === 0) {
    return { ok: false, message: "확정취소할 화주별 자료를 선택하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { data: selectedReports, error: selectedReportsError } = await supabase
    .from("weekly_client_reports")
    .select("id,status,submitted_at")
    .in("id", reportIds)
    .is("deleted_at", null);
  if (selectedReportsError) {
    return { ok: false, message: safeErrorMessage(selectedReportsError.message) };
  }
  if ((selectedReports ?? []).some((report) => isPastConfirmationCancelWindow(report.submitted_at))) {
    return { ok: false, message: "확정 후 3일이 지난 화주자료는 확정취소할 수 없습니다." };
  }

  const { error } = await supabase.rpc("cancel_client_reports_submission_atomic", {
    p_report_ids: reportIds
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  return { ok: true, message: "선택한 화주별 자료를 확정취소했습니다." };
}

export async function deleteSelectedClientReportsAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const reportIds = getSelectedReportIds(formData);
  return softDeleteClientReports(reportIds);
}

export async function saveDepartmentSubmissionAction(
  _: ActionResult<SavedDepartmentSubmissionResult> | null,
  formData: FormData
): Promise<ActionResult<SavedDepartmentSubmissionResult>> {
  const object = {
    ...formDataToObject(formData),
    contents: parseJsonField(formData, "contents", [])
  };
  const parsed = departmentSubmissionSchema.safeParse(object);
  if (!parsed.success) {
    return { ok: false, message: "입력값을 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { id, contents, status } = parsed.data;
  const { data: savedResult, error } = await supabase.rpc("save_department_submission_atomic", {
    p_submission_id: id ?? null,
    p_department_id: parsed.data.department_id,
    p_week_start_date: parsed.data.week_start_date,
    p_week_end_date: parsed.data.week_end_date,
    p_report_year: parsed.data.report_year,
    p_report_month: parsed.data.report_month,
    p_week_of_month: parsed.data.week_of_month,
    p_status: status,
    p_exception_reason: parsed.data.exception_reason ?? null,
    p_contents: contents as Json
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  const saved =
    savedResult && typeof savedResult === "object" && !Array.isArray(savedResult)
      ? (savedResult as { id?: unknown; status?: unknown })
      : {};
  return {
    ok: true,
    message: status === "submitted_to_division" ? "사업부 검토요청을 완료했습니다." : "부서자료를 저장했습니다.",
    data: {
      id: typeof saved.id === "string" ? saved.id : id,
      status: status === "submitted_to_division" ? "submitted_to_division" : status,
      finalized_at: status === "submitted_to_division" ? new Date().toISOString() : null
    }
  };
}

export async function cancelDepartmentSubmissionAction(
  _: ActionResult<SavedDepartmentSubmissionResult> | null,
  formData: FormData
): Promise<ActionResult<SavedDepartmentSubmissionResult>> {
  const submissionId = String(formData.get("id") ?? "");
  if (!submissionId) {
    return { ok: false, message: "확정취소할 부서자료를 찾을 수 없습니다." };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "사용자 정보가 없거나 비활성화 상태입니다." };
  }
  if (!canSubmitDepartment(profile)) {
    return { ok: false, message: "확정취소는 부서장과 관리자만 가능합니다." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { data: submission, error: submissionError } = await supabase
    .from("department_weekly_submissions")
    .select("id,department_id,status,finalized_at")
    .eq("id", submissionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (submissionError) {
    return { ok: false, message: safeErrorMessage(submissionError.message) };
  }
  if (!submission) {
    return { ok: false, message: "확정취소할 부서자료를 찾을 수 없습니다." };
  }
  if (!isAdmin(profile) && profile.department_id !== submission.department_id) {
    return { ok: false, message: "소속 부서 자료만 확정취소할 수 있습니다." };
  }
  if (submission.status !== "submitted_to_division") {
    return { ok: false, message: "사업부 검토요청 상태의 부서자료만 확정취소할 수 있습니다." };
  }
  if (isPastConfirmationCancelWindow(submission.finalized_at)) {
    return { ok: false, message: "확정 후 3일이 지난 부서자료는 확정취소할 수 없습니다." };
  }

  const { error } = await supabase.rpc("cancel_department_submission_atomic", {
    p_submission_id: submissionId
  });
  if (error) {
    const isMissingRpc = error.message.includes("cancel_department_submission_atomic") || error.message.includes("function");
    if (!isMissingRpc) {
      return { ok: false, message: safeErrorMessage(error.message) };
    }

    try {
      const adminClient = createSupabaseAdminClient();
      const { error: fallbackError } = await adminClient
        .from("department_weekly_submissions")
        .update({
          status: "draft",
          finalized_by: null,
          finalized_at: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", submissionId)
        .eq("status", "submitted_to_division");

      if (fallbackError) {
        return { ok: false, message: safeErrorMessage(fallbackError.message) };
      }

      await adminClient.from("approval_history").insert({
        target_type: "department_submission",
        target_id: submissionId,
        action: "확정취소",
        previous_status: "submitted_to_division",
        next_status: "draft",
        comment: "부서 확정취소",
        actor_id: profile.id
      });
    } catch {
      return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
    }
  }

  return {
    ok: true,
    message: "부서자료 확정을 취소했습니다.",
    data: {
      id: submissionId,
      status: "draft",
      finalized_at: null
    }
  };
}

export async function loadDepartmentSubmissionAction({
  department_id,
  week_start_date
}: {
  department_id: string;
  week_start_date: string;
}): Promise<{
  ok: boolean;
  message?: string;
  submission: DepartmentSubmissionLoadRow | null;
}> {
  const parsedDepartmentId = idSchema.safeParse(department_id);
  if (!parsedDepartmentId.success || !/^\d{4}-\d{2}-\d{2}$/.test(week_start_date)) {
    return { ok: false, message: "조회 조건을 확인하세요.", submission: null };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "사용자 정보가 없거나 비활성화 상태입니다.", submission: null };
  }
  if (!isAdmin(profile) && profile.department_id !== department_id) {
    return { ok: false, message: "소속 부서 자료만 조회할 수 있습니다.", submission: null };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요.", submission: null };
  }

  const { data, error } = await supabase
    .from("department_weekly_submissions")
    .select(
      "id,department_id,week_start_date,status,exception_reason,finalized_at,department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content)"
    )
    .eq("department_id", department_id)
    .eq("week_start_date", week_start_date)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message), submission: null };
  }

  return { ok: true, submission: data ? (data as unknown as DepartmentSubmissionLoadRow) : null };
}

function canManageDepartmentData(profile: NonNullable<Awaited<ReturnType<typeof getCurrentUserProfile>>["profile"]>, departmentId: string) {
  return (
    isAdmin(profile) ||
    ((profile.app_role === "department_head" || profile.app_role === "manager") && profile.department_id === departmentId)
  );
}

async function ensureEditableDepartmentVacancySubmission(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  departmentId: string,
  weekStartDate: string
): Promise<ActionResult> {
  const { data: submission, error } = await supabase
    .from("department_weekly_submissions")
    .select("id,status")
    .eq("department_id", departmentId)
    .eq("week_start_date", weekStartDate)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  if (submission && submission.status !== "draft" && submission.status !== "division_rejected") {
    return { ok: false, message: "확정 또는 승인된 부서자료는 공실현황을 수정할 수 없습니다. 확정취소 후 다시 수정하세요." };
  }
  return { ok: true, message: "" };
}

function toVacancyRecord(row: unknown): DepartmentVacancyRecord {
  const value = row as {
    id: string;
    department_id: string;
    center_master_id: string;
    week_start_date: string;
    week_end_date: string;
    report_year: number;
    report_month: number;
    week_of_month: number;
    operating_area: number | string;
    simple_storage_area: number | string;
    vacancy_area: number | string;
    total_area: number | string;
    simple_storage_note: string | null;
    vacancy_note: string | null;
    updated_at: string;
    center_masters?: { center_name?: string | null } | null;
  };
  return {
    id: value.id,
    department_id: value.department_id,
    center_master_id: value.center_master_id,
    center_name: value.center_masters?.center_name ?? "-",
    week_start_date: value.week_start_date,
    week_end_date: value.week_end_date,
    report_year: value.report_year,
    report_month: value.report_month,
    week_of_month: value.week_of_month,
    operating_area: Number(value.operating_area),
    simple_storage_area: Number(value.simple_storage_area),
    vacancy_area: Number(value.vacancy_area),
    total_area: Number(value.total_area),
    simple_storage_note: value.simple_storage_note,
    vacancy_note: value.vacancy_note,
    updated_at: value.updated_at
  };
}

function buildVacancyTrend(rows: DepartmentVacancyRecord[]): DepartmentVacancyTrendPoint[] {
  const weeklyMap = rows.reduce((map, row) => {
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
  }, new Map<string, DepartmentVacancyTrendPoint>());
  return Array.from(weeklyMap.values()).sort((left, right) => left.week_start_date.localeCompare(right.week_start_date));
}

export async function loadDepartmentVacancyDataAction({
  department_id,
  report_year,
  report_month
}: {
  department_id: string;
  report_year: number;
  report_month: number;
}): Promise<{
  ok: boolean;
  message?: string;
  records: DepartmentVacancyRecord[];
  trend: DepartmentVacancyTrendPoint[];
}> {
  const parsedDepartmentId = idSchema.safeParse(department_id);
  const parsedYear = z.coerce.number().int().min(2020).max(2100).safeParse(report_year);
  const parsedMonth = z.coerce.number().int().min(1).max(12).safeParse(report_month);
  if (!parsedDepartmentId.success || !parsedYear.success || !parsedMonth.success) {
    return { ok: false, message: "조회 조건을 확인하세요.", records: [], trend: [] };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "사용자 정보가 없거나 비활성화 상태입니다.", records: [], trend: [] };
  }
  if (!isAdmin(profile) && profile.department_id !== department_id) {
    return { ok: false, message: "소속 부서 자료만 조회할 수 있습니다.", records: [], trend: [] };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요.", records: [], trend: [] };
  }

  const monthQuery = supabase
    .from("department_vacancy_records")
    .select("id,department_id,center_master_id,week_start_date,week_end_date,report_year,report_month,week_of_month,operating_area,simple_storage_area,vacancy_area,total_area,simple_storage_note,vacancy_note,updated_at,center_masters(center_name)")
    .eq("department_id", department_id)
    .eq("report_year", parsedYear.data)
    .eq("report_month", parsedMonth.data)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("week_of_month")
    .order("center_master_id");

  const trendStart = new Date(Date.UTC(parsedYear.data, parsedMonth.data - 13, 1)).toISOString().slice(0, 10);
  const trendEnd = new Date(Date.UTC(parsedYear.data, parsedMonth.data, 0)).toISOString().slice(0, 10);
  const trendQuery = supabase
    .from("department_vacancy_records")
    .select("id,department_id,center_master_id,week_start_date,week_end_date,report_year,report_month,week_of_month,operating_area,simple_storage_area,vacancy_area,total_area,simple_storage_note,vacancy_note,updated_at,center_masters(center_name)")
    .eq("department_id", department_id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .gte("week_start_date", trendStart)
    .lte("week_start_date", trendEnd)
    .order("week_start_date");

  const [{ data: monthData, error: monthError }, { data: trendData, error: trendError }] = await Promise.all([
    monthQuery,
    trendQuery
  ]);
  const error = monthError ?? trendError;
  if (error) {
    const message = error.message.includes("department_vacancy_records")
      ? "공실현황 테이블이 없습니다. Supabase SQL 031_department_vacancy_records.sql을 먼저 실행하세요."
      : safeErrorMessage(error.message);
    return { ok: false, message, records: [], trend: [] };
  }

  const records = (monthData ?? []).map(toVacancyRecord);
  const trend = buildVacancyTrend((trendData ?? []).map(toVacancyRecord));
  return { ok: true, records, trend };
}

export async function saveDepartmentVacancyRecordAction(formData: FormData): Promise<ActionResult<DepartmentVacancyRecord>> {
  const parsed = vacancyRecordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: "공실현황 입력값을 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "사용자 정보가 없거나 비활성화 상태입니다." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  let adminClient: ReturnType<typeof createSupabaseAdminClient>;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }

  const { id, ...payload } = parsed.data;
  if (id) {
    const { data: target, error: targetError } = await adminClient
      .from("department_vacancy_records")
      .select("id,department_id,week_start_date")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (targetError) {
      return { ok: false, message: safeErrorMessage(targetError.message) };
    }
    if (!target) {
      return { ok: false, message: "수정할 공실현황을 찾을 수 없습니다." };
    }
    if (target.department_id !== payload.department_id || target.week_start_date !== payload.week_start_date) {
      return { ok: false, message: "기존 공실현황의 부서와 주차는 변경할 수 없습니다." };
    }
  }
  if (!canManageDepartmentData(profile, payload.department_id)) {
    return { ok: false, message: "소속 부서 공실현황만 저장할 수 있습니다." };
  }
  const editableResult = await ensureEditableDepartmentVacancySubmission(supabase, payload.department_id, payload.week_start_date);
  if (!editableResult.ok) {
    return editableResult;
  }

  const requestPayload = {
    ...payload,
    simple_storage_note: payload.simple_storage_note?.trim() || null,
    vacancy_note: payload.vacancy_note?.trim() || null,
    is_active: true,
    updated_by: profile.id
  };
  let targetId = id;
  if (!targetId) {
    const { data: existing, error: existingError } = await adminClient
      .from("department_vacancy_records")
      .select("id")
      .eq("department_id", payload.department_id)
      .eq("center_master_id", payload.center_master_id)
      .eq("week_start_date", payload.week_start_date)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingError) {
      const message = existingError.message.includes("department_vacancy_records")
        ? "공실현황 테이블이 없습니다. Supabase SQL 031_department_vacancy_records.sql을 먼저 실행하세요."
        : safeErrorMessage(existingError.message);
      return { ok: false, message };
    }
    targetId = existing?.id;
  }

  const query = targetId
    ? adminClient
        .from("department_vacancy_records")
        .update(requestPayload)
        .eq("id", targetId)
        .eq("department_id", parsed.data.department_id)
        .is("deleted_at", null)
    : adminClient.from("department_vacancy_records").insert({ ...requestPayload, created_by: profile.id });

  const { data, error } = await query
    .select("id,department_id,center_master_id,week_start_date,week_end_date,report_year,report_month,week_of_month,operating_area,simple_storage_area,vacancy_area,total_area,simple_storage_note,vacancy_note,updated_at,center_masters(center_name)")
    .single();

  if (error) {
    const message = error.message.includes("department_vacancy_records")
      ? "공실현황 테이블이 없습니다. Supabase SQL 031_department_vacancy_records.sql을 먼저 실행하세요."
      : safeErrorMessage(error.message);
    return { ok: false, message };
  }

  return { ok: true, message: "공실현황을 저장했습니다.", data: toVacancyRecord(data) };
}

export async function deleteDepartmentVacancyRecordAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsedId = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!parsedId.success) {
    return { ok: false, message: "삭제할 공실현황을 확인하세요." };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "사용자 정보가 없거나 비활성화 상태입니다." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { data: target, error: targetError } = await supabase
    .from("department_vacancy_records")
    .select("id,department_id,week_start_date")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) {
    return { ok: false, message: safeErrorMessage(targetError.message) };
  }
  if (!target) {
    return { ok: false, message: "삭제할 공실현황을 찾을 수 없습니다." };
  }
  if (!canManageDepartmentData(profile, target.department_id)) {
    return { ok: false, message: "소속 부서 공실현황만 삭제할 수 있습니다." };
  }
  const editableResult = await ensureEditableDepartmentVacancySubmission(supabase, target.department_id, target.week_start_date);
  if (!editableResult.ok) {
    return editableResult;
  }

  try {
    const adminClient = createSupabaseAdminClient();
    const { error } = await adminClient
      .from("department_vacancy_records")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: profile.id,
        is_active: false,
        updated_by: profile.id
      })
      .eq("id", parsedId.data);
    if (error) {
      return { ok: false, message: safeErrorMessage(error.message) };
    }
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }

  return { ok: true, message: "공실현황을 삭제했습니다.", data: { id: parsedId.data } };
}

export async function loadClientHistoricalVolumesAction({
  client_id
}: {
  client_id: string;
}): Promise<{
  ok: boolean;
  message?: string;
  historicalVolumes: ClientHistoricalVolumeRow[];
}> {
  const parsedClientId = idSchema.safeParse(client_id);
  if (!parsedClientId.success) {
    return { ok: false, message: "조회할 화주를 확인하세요.", historicalVolumes: [] };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "사용자 정보가 없거나 비활성화 상태입니다.", historicalVolumes: [] };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요.", historicalVolumes: [] };
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", client_id)
    .eq("is_active", true)
    .maybeSingle();
  if (clientError) {
    return { ok: false, message: safeErrorMessage(clientError.message), historicalVolumes: [] };
  }
  if (!client) {
    return { ok: false, message: "화주 정보를 찾을 수 없습니다.", historicalVolumes: [] };
  }
  if (!isAdmin(profile)) {
    const { data: link, error: linkError } = await supabase
      .from("department_client_links")
      .select("client_id")
      .eq("client_id", client_id)
      .eq("department_id", profile.department_id ?? "")
      .eq("is_active", true)
      .maybeSingle();
    if (linkError) {
      return { ok: false, message: safeErrorMessage(linkError.message), historicalVolumes: [] };
    }
    if (!link) {
      return { ok: false, message: "소속 부서에 등록된 화주만 조회할 수 있습니다.", historicalVolumes: [] };
    }
  }

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoDate = oneYearAgo.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("weekly_client_reports")
    .select("client_id,week_start_date,weekly_volumes(volume_type,quantity,unit)")
    .eq("client_id", client_id)
    .is("deleted_at", null)
    .gte("week_start_date", oneYearAgoDate)
    .order("week_start_date", { ascending: true })
    .limit(100);
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message), historicalVolumes: [] };
  }

  const historicalVolumes = ((data ?? []) as unknown as ClientHistoricalReportRow[]).flatMap((report) =>
    report.weekly_volumes.map((volume) => ({
      client_id: report.client_id,
      week_start_date: report.week_start_date,
      volume_type: volume.volume_type,
      quantity: Number(volume.quantity),
      unit: volume.unit
    }))
  );

  return { ok: true, historicalVolumes };
}

export async function transitionDepartmentSubmissionAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const submissionId = String(formData.get("submission_id") ?? "");
  const nextStatus = String(formData.get("next_status") ?? "") as DepartmentSubmissionStatus;
  const comment = String(formData.get("comment") ?? "").trim();
  if (nextStatus === "division_rejected" && !comment) {
    return { ok: false, message: "반려사유를 입력하세요." };
  }
  const { profile } = await getCurrentUserProfile();
  if (!isAdmin(profile)) {
    return { ok: false, message: "사업부 최종 승인·반려는 관리자만 가능합니다." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { data: submission } = await supabase
    .from("department_weekly_submissions")
    .select("status")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) {
    return { ok: false, message: "자료를 찾을 수 없습니다." };
  }
  if (!isAllowedDepartmentTransition(submission.status, nextStatus)) {
    return { ok: false, message: "허용되지 않은 상태 변경입니다." };
  }
  const { error } = await supabase.rpc("transition_department_submission_status", {
    submission_id: submissionId,
    next_status: nextStatus,
    comment
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  return { ok: true, message: "부서자료 상태를 변경했습니다." };
}

export async function saveReportItemRequestAction(formData: FormData): Promise<ActionResult<ReportItemRequestActionRow>> {
  const parsed = reportItemRequestSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: "요청사항 내용을 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const requestTarget: ReportItemRequestTarget = {
    target_type: parsed.data.target_type,
    report_item_id: parsed.data.report_item_id ?? null,
    department_submission_id: parsed.data.department_submission_id ?? null,
    item_period: parsed.data.item_period ?? null,
    item_sort_order: parsed.data.item_sort_order ?? null
  };
  const access = await canAccessReportItemRequestTarget(requestTarget);
  if (!access.ok || !access.profile) {
    return { ok: false, message: access.message };
  }
  const targetKey = makeReportItemRequestTargetKey(requestTarget);

  let adminClient: ReturnType<typeof createSupabaseAdminClient>;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }

  if (parsed.data.id) {
    const { data: target, error: targetError } = await adminClient
      .from("weekly_report_item_requests")
      .select("id,created_by,target_key,closed_at")
      .eq("id", parsed.data.id)
      .eq("target_key", targetKey)
      .is("deleted_at", null)
      .maybeSingle();
    if (targetError) {
      return { ok: false, message: safeErrorMessage(targetError.message) };
    }
    if (!target) {
      return { ok: false, message: "수정할 요청사항을 찾을 수 없습니다." };
    }
    if (!isAdmin(access.profile) && target.created_by !== access.profile.id) {
      return { ok: false, message: "본인이 등록한 요청사항만 수정할 수 있습니다." };
    }
    if (target.closed_at) {
      return { ok: false, message: "종결된 요청사항은 수정할 수 없습니다." };
    }

    const { data, error } = await adminClient
      .from("weekly_report_item_requests")
      .update({ request_content: parsed.data.request_content })
      .eq("id", parsed.data.id)
      .select(REPORT_ITEM_REQUEST_SELECT)
      .single();
    if (error) {
      return { ok: false, message: safeErrorMessage(error.message) };
    }
    return { ok: true, message: "요청사항을 수정했습니다.", data: data as ReportItemRequestActionRow };
  }

  const { data, error } = await adminClient
    .from("weekly_report_item_requests")
    .insert({
      target_type: requestTarget.target_type,
      target_key: targetKey,
      report_item_id: requestTarget.target_type === "client_item" ? requestTarget.report_item_id ?? null : null,
      department_submission_id: requestTarget.target_type === "department_common" ? requestTarget.department_submission_id ?? null : null,
      section_type: requestTarget.target_type === "department_common" ? "common" : null,
      item_period: requestTarget.target_type === "department_common" ? requestTarget.item_period ?? null : null,
      item_sort_order: requestTarget.target_type === "department_common" ? requestTarget.item_sort_order ?? null : null,
      request_content: parsed.data.request_content,
      request_author_name: access.profile.full_name,
      request_author_department_name: access.profile.department_name ?? null,
      created_by: access.profile.id
    })
    .select(REPORT_ITEM_REQUEST_SELECT)
    .single();
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  return { ok: true, message: "요청사항을 등록했습니다.", data: data as ReportItemRequestActionRow };
}

export async function deleteReportItemRequestAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!parsed.success) {
    return { ok: false, message: "삭제할 요청사항을 확인하세요." };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  let adminClient: ReturnType<typeof createSupabaseAdminClient>;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }

  const { data: target, error: targetError } = await adminClient
    .from("weekly_report_item_requests")
    .select("id,target_type,report_item_id,department_submission_id,item_period,item_sort_order,created_by,closed_at")
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) {
    return { ok: false, message: safeErrorMessage(targetError.message) };
  }
  if (!target) {
    return { ok: false, message: "삭제할 요청사항을 찾을 수 없습니다." };
  }

  const access = await canAccessReportItemRequestTarget(target as ReportItemRequestTarget);
  if (!access.ok || !access.profile) {
    return { ok: false, message: access.message };
  }
  if (!isAdmin(access.profile) && target.created_by !== access.profile.id) {
    return { ok: false, message: "본인이 등록한 요청사항만 삭제할 수 있습니다." };
  }
  if (target.closed_at) {
    return { ok: false, message: "종결된 요청사항은 삭제할 수 없습니다." };
  }

  const { error } = await adminClient
    .from("weekly_report_item_requests")
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id })
    .eq("id", parsed.data);
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  return { ok: true, message: "요청사항을 삭제했습니다.", data: { id: parsed.data } };
}

export async function saveReportItemRequestResultAction(formData: FormData): Promise<ActionResult<ReportItemRequestActionRow>> {
  const parsed = reportItemRequestResultSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: "처리결과 내용을 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "사용자 정보가 없거나 비활성화 상태입니다." };
  }

  let adminClient: ReturnType<typeof createSupabaseAdminClient>;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }

  const { data: target, error: targetError } = await adminClient
    .from("weekly_report_item_requests")
    .select("id,target_type,report_item_id,department_submission_id,item_period,item_sort_order,result_created_by,closed_at")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) {
    return { ok: false, message: safeErrorMessage(targetError.message) };
  }
  if (!target) {
    return { ok: false, message: "처리결과를 등록할 요청사항을 찾을 수 없습니다." };
  }

  const access = await canAccessReportItemRequestTarget(target as ReportItemRequestTarget);
  if (!access.ok || !access.profile) {
    return { ok: false, message: access.message };
  }
  if (target.result_created_by && !isAdmin(access.profile) && target.result_created_by !== access.profile.id) {
    return { ok: false, message: "본인이 등록한 처리결과만 수정할 수 있습니다." };
  }
  if (target.closed_at) {
    return { ok: false, message: "종결된 요청사항은 처리결과를 수정할 수 없습니다." };
  }

  const now = new Date().toISOString();
  const resultUpdate = target.result_created_by
    ? {
        result_content: parsed.data.result_content,
        result_author_name: access.profile.full_name,
        result_author_department_name: access.profile.department_name ?? null,
        result_updated_at: now
      }
    : {
        result_content: parsed.data.result_content,
        result_author_name: access.profile.full_name,
        result_author_department_name: access.profile.department_name ?? null,
        result_created_by: access.profile.id,
        result_created_at: now,
        result_updated_at: now
      };
  const { data, error } = await adminClient
    .from("weekly_report_item_requests")
    .update(resultUpdate)
    .eq("id", parsed.data.id)
    .select(REPORT_ITEM_REQUEST_SELECT)
    .single();
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  return { ok: true, message: "처리결과를 저장했습니다.", data: data as ReportItemRequestActionRow };
}

export async function deleteReportItemRequestResultAction(formData: FormData): Promise<ActionResult<ReportItemRequestActionRow>> {
  const parsed = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!parsed.success) {
    return { ok: false, message: "삭제할 처리결과를 확인하세요." };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "사용자 정보가 없거나 비활성화 상태입니다." };
  }

  let adminClient: ReturnType<typeof createSupabaseAdminClient>;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }

  const { data: target, error: targetError } = await adminClient
    .from("weekly_report_item_requests")
    .select("id,target_type,report_item_id,department_submission_id,item_period,item_sort_order,result_created_by,closed_at")
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) {
    return { ok: false, message: safeErrorMessage(targetError.message) };
  }
  if (!target?.result_created_by) {
    return { ok: false, message: "삭제할 처리결과를 찾을 수 없습니다." };
  }

  const access = await canAccessReportItemRequestTarget(target as ReportItemRequestTarget);
  if (!access.ok || !access.profile) {
    return { ok: false, message: access.message };
  }
  if (!isAdmin(access.profile) && target.result_created_by !== access.profile.id) {
    return { ok: false, message: "본인이 등록한 처리결과만 삭제할 수 있습니다." };
  }
  if (target.closed_at) {
    return { ok: false, message: "종결된 요청사항은 처리결과를 삭제할 수 없습니다." };
  }

  const { data, error } = await adminClient
    .from("weekly_report_item_requests")
    .update({
      result_content: null,
      result_author_name: null,
      result_author_department_name: null,
      result_created_by: null,
      result_created_at: null,
      result_updated_at: null
    })
    .eq("id", parsed.data)
    .select(REPORT_ITEM_REQUEST_SELECT)
    .single();
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  return { ok: true, message: "처리결과를 삭제했습니다.", data: data as ReportItemRequestActionRow };
}

export async function closeReportItemRequestAction(formData: FormData): Promise<ActionResult<ReportItemRequestActionRow>> {
  const parsed = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!parsed.success) {
    return { ok: false, message: "종결할 요청사항을 확인하세요." };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "사용자 정보가 없거나 비활성화 상태입니다." };
  }

  let adminClient: ReturnType<typeof createSupabaseAdminClient>;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }

  const { data: target, error: targetError } = await adminClient
    .from("weekly_report_item_requests")
    .select("id,target_type,report_item_id,department_submission_id,item_period,item_sort_order,created_by,result_content,result_created_by,closed_at")
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) {
    return { ok: false, message: safeErrorMessage(targetError.message) };
  }
  if (!target) {
    return { ok: false, message: "종결할 요청사항을 찾을 수 없습니다." };
  }
  if (target.closed_at) {
    return { ok: false, message: "이미 종결된 요청사항입니다." };
  }
  if (!target.result_content) {
    return { ok: false, message: "처리결과가 등록된 요청사항만 종결할 수 있습니다." };
  }

  const access = await canAccessReportItemRequestTarget(target as ReportItemRequestTarget);
  if (!access.ok || !access.profile) {
    return { ok: false, message: access.message };
  }
  const canClose =
    isAdmin(access.profile) || target.created_by === access.profile.id || target.result_created_by === access.profile.id;
  if (!canClose) {
    return { ok: false, message: "요청 등록자 또는 처리결과 등록자만 종결할 수 있습니다." };
  }

  const { data, error } = await adminClient
    .from("weekly_report_item_requests")
    .update({
      closed_by: access.profile.id,
      closed_author_name: access.profile.full_name,
      closed_author_department_name: access.profile.department_name ?? null,
      closed_at: new Date().toISOString()
    })
    .eq("id", parsed.data)
    .select(REPORT_ITEM_REQUEST_SELECT)
    .single();
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  return { ok: true, message: "요청사항을 종결했습니다.", data: data as ReportItemRequestActionRow };
}
