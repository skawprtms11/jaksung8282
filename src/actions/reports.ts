"use server";
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
import { clientReportSchema, departmentSubmissionSchema, idSchema } from "@/lib/validations/common";
import { formDataToObject, safeErrorMessage, type ActionResult } from "@/lib/utils/form";
import type { Json } from "@/types/database";
import type { ClientReportStatus, DepartmentSubmissionStatus, VolumeType, VolumeUnit } from "@/types/enums";

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
};

type SavedClientReportDbRow = {
  id: string;
  created_by: string;
  department_id: string;
  client_id: string;
  week_start_date: string;
  status: ClientReportStatus;
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

export type SavedClientReportRow = {
  id: string;
  clientId: string;
  clientName: string;
  authorName: string;
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
  "id,created_by,department_id,client_id,week_start_date,status,clients(client_name),weekly_client_report_items(item_period,importance,work_category_id,title,content,sort_order,work_categories(category_name)),weekly_volumes(volume_type,quantity,unit,custom_unit,note,sort_order)";

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

  const savedId =
    savedResult && typeof savedResult === "object" && !Array.isArray(savedResult) && "id" in savedResult
      ? String(savedResult.id ?? "")
      : "";
  if (!savedId) {
    return { ok: true, message: nextStatus === "submitted" ? "검토요청을 완료했습니다." : "화주별 자료를 저장했습니다." };
  }

  const { data: savedReport } = await supabase
    .from("weekly_client_reports")
    .select(SAVED_CLIENT_REPORT_SELECT)
    .eq("id", savedId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!savedReport) {
    return { ok: true, message: nextStatus === "submitted" ? "검토요청을 완료했습니다." : "화주별 자료를 저장했습니다." };
  }

  const { profile } = await getCurrentUserProfile();
  const report = savedReport as unknown as SavedClientReportDbRow;
  const sortedItems = report.weekly_client_report_items.slice().sort((left, right) => left.sort_order - right.sort_order);
  const sortedVolumes = report.weekly_volumes.slice().sort((left, right) => left.sort_order - right.sort_order);
  const row: SavedClientReportRow = {
    id: report.id,
    clientId: report.client_id,
    clientName: report.clients?.client_name ?? "-",
    authorName: profile?.id === report.created_by ? profile.full_name : "-",
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
      status: status === "submitted_to_division" ? "submitted_to_division" : status
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
    .select("id,department_id,status")
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

  try {
    const adminClient = createSupabaseAdminClient();
    const { error } = await adminClient
      .from("department_weekly_submissions")
      .update({
        status: "draft",
        finalized_by: null,
        finalized_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", submissionId)
      .eq("status", "submitted_to_division");

    if (error) {
      return { ok: false, message: safeErrorMessage(error.message) };
    }

    await adminClient.from("approval_history").insert({
      target_type: "department_submission",
      target_id: submissionId,
      action: "제출취소",
      previous_status: "submitted_to_division",
      next_status: "draft",
      comment: "부서 확정취소",
      actor_id: profile.id
    });
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }

  return {
    ok: true,
    message: "부서자료 확정을 취소했습니다.",
    data: {
      id: submissionId,
      status: "draft"
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
      "id,department_id,week_start_date,status,exception_reason,department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content)"
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
