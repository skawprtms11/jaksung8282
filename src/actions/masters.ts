"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { getInitialPassword } from "@/lib/auth/initial-password";
import { canRegisterDepartmentClients, isAdmin } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLaborSupabaseClient } from "@/lib/supabase/labor";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientSchema, departmentClientSchema, departmentSchema, idSchema, userSchema } from "@/lib/validations/common";
import { formDataToObject, safeErrorMessage, type ActionResult } from "@/lib/utils/form";
import type { Json } from "@/types/database";

const HEADER_FILTER_CACHE_TAG = "header-filter-options";

function revalidateMasterPath(path: string) {
  revalidatePath(path);
  revalidateTag(HEADER_FILTER_CACHE_TAG, { expire: 0 });
}

async function requireAdmin() {
  const { profile } = await getCurrentUserProfile();
  if (!isAdmin(profile)) {
    return { profile: null, error: "관리자만 처리할 수 있습니다." };
  }
  return { profile, error: null };
}

export async function importLaborCentersAction(state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  void state;
  void formData;
  const { profile, error: authError } = await requireAdmin();
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  let labor;
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    labor = createLaborSupabaseClient();
    admin = createSupabaseAdminClient();
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Supabase 환경변수를 확인하세요." };
  }

  const { data: centers, error } = await labor
    .from("centers")
    .select("id,name,code,address,memo,status,latitude,longitude")
    .eq("status", "active")
    .order("name");

  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  const payload = (centers ?? [])
    .filter((center) => center.id && center.name?.trim())
    .map((center) => ({
      source_center_id: center.id,
      center_name: center.name.trim(),
      address: center.address?.trim() || null,
      notes: center.memo?.trim() || null,
      source_status: center.status ?? null,
      latitude: center.latitude,
      longitude: center.longitude,
      is_active: center.status === "active",
      last_synced_at: new Date().toISOString(),
      updated_by: profile.id
    }));

  if (payload.length === 0) {
    return { ok: false, message: "불러올 활성 센터 데이터가 없습니다." };
  }

  const { error: upsertError } = await admin
    .from("center_masters")
    .upsert(payload, { onConflict: "source_center_id" });

  if (upsertError?.message.includes("center_masters")) {
    return { ok: false, message: "센터마스터 테이블이 없습니다. Supabase SQL 030_center_masters.sql을 먼저 실행하세요." };
  }
  if (upsertError) {
    return { ok: false, message: safeErrorMessage(upsertError.message) };
  }

  revalidateMasterPath("/admin/centers");
  return { ok: true, message: `센터 ${payload.length}건을 불러왔습니다.` };
}

async function resolveDefaultClientDepartmentId(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  profile: NonNullable<Awaited<ReturnType<typeof requireAdmin>>["profile"]>
) {
  if (profile.department_id) {
    return profile.department_id;
  }

  const { data: fallbackDepartment } = await supabase
    .from("departments")
    .select("id")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  if (fallbackDepartment?.id) {
    return fallbackDepartment.id;
  }

  const { data: anyDepartment } = await supabase
    .from("departments")
    .select("id")
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  if (anyDepartment?.id) {
    return anyDepartment.id;
  }

  const { data: createdDepartment } = await supabase
    .from("departments")
    .insert({
      department_code: "TPL",
      department_name: "TPL사업부",
      is_active: true,
      sort_order: 0,
      created_by: profile.id,
      updated_by: profile.id
    })
    .select("id")
    .single();

  return createdDepartment?.id ?? "";
}

export async function saveDepartmentAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile, error: authError } = await requireAdmin();
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }
  const rawDepartment = formDataToObject(formData);
  if (!rawDepartment.department_code) {
    rawDepartment.department_code = `DEPT-${Date.now().toString(36).toUpperCase()}`;
  }
  const parsed = departmentSchema.safeParse(rawDepartment);
  if (!parsed.success) {
    return { ok: false, message: "입력값을 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { id, ...payload } = parsed.data;
  const headUserId = String(formData.get("department_head_id") ?? "").trim();
  const managerUserIds: string[] = [];
  const leaderUserIds = [headUserId, ...managerUserIds].filter(Boolean);
  const parsedLeaderIds = z.array(idSchema).safeParse(leaderUserIds);
  if (!parsedLeaderIds.success) {
    return { ok: false, message: "부서장 정보를 확인하세요." };
  }

  const request = id
    ? supabase.from("departments").update({ ...payload, updated_by: profile.id }).eq("id", id).select("id").single()
    : supabase.from("departments").insert({ ...payload, created_by: profile.id, updated_by: profile.id }).select("id").single();
  const { data: savedDepartment, error } = await request;
  let savedDepartmentId = savedDepartment?.id ?? id ?? "";
  if (error?.message.includes("notes")) {
    const payloadWithoutNotes = { ...payload };
    delete payloadWithoutNotes.notes;
    const retry = id
      ? await supabase.from("departments").update({ ...payloadWithoutNotes, updated_by: profile.id }).eq("id", id).select("id").single()
      : await supabase.from("departments").insert({ ...payloadWithoutNotes, created_by: profile.id, updated_by: profile.id }).select("id").single();
    if (retry.error) {
      return { ok: false, message: safeErrorMessage(retry.error.message) };
    }
    savedDepartmentId = retry.data?.id ?? id ?? "";
    const leaderError = await updateDepartmentLeaders(savedDepartmentId, headUserId, managerUserIds);
    if (leaderError) {
      return { ok: false, message: leaderError };
    }
    revalidateMasterPath("/admin/departments");
    return { ok: true, message: "부서 정보를 저장했습니다. 비고 저장은 Supabase notes 컬럼 추가 후 적용됩니다." };
  }
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  const leaderError = await updateDepartmentLeaders(savedDepartmentId, headUserId, managerUserIds);
  if (leaderError) {
    return { ok: false, message: leaderError };
  }
  revalidateMasterPath("/admin/departments");
  return { ok: true, message: "부서 정보를 저장했습니다." };
}

export async function deleteDepartmentsAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile, error: authError } = await requireAdmin();
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const departmentIds = String(formData.get("department_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsed = z.array(idSchema).min(1, "삭제할 부서를 선택하세요.").safeParse(departmentIds);
  if (!parsed.success) {
    return { ok: false, message: "삭제할 부서를 선택하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { error } = await supabase
    .from("departments")
    .update({ is_active: false, updated_by: profile.id })
    .in("id", parsed.data);
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidateMasterPath("/admin/departments");
  return { ok: true, message: "선택한 부서를 삭제했습니다." };
}

async function updateDepartmentLeaders(departmentId: string, headUserId: string, managerUserIds: string[]) {
  if (!departmentId || (!headUserId && managerUserIds.length === 0)) {
    return null;
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return "부서장·매니저 지정을 위해 SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요.";
  }

  const selectedUserIds = [headUserId, ...managerUserIds].filter(Boolean);
  const { data: users, error: userError } = await admin
    .from("profiles")
    .select("id,is_active")
    .in("id", selectedUserIds)
    .eq("is_active", true);

  if (userError) {
    return safeErrorMessage(userError.message);
  }
  if ((users ?? []).length !== selectedUserIds.length) {
    return "활성 사용자만 부서장 또는 매니저로 지정할 수 있습니다.";
  }

  if (headUserId) {
    const { error } = await admin
      .from("profiles")
      .update({ department_id: departmentId, app_role: "department_head" })
      .eq("id", headUserId);
    if (error) {
      return safeErrorMessage(error.message);
    }
  }

  if (managerUserIds.length > 0) {
    const { error } = await admin
      .from("profiles")
      .update({ department_id: departmentId, app_role: "manager" })
      .in("id", managerUserIds);
    if (error) {
      return safeErrorMessage(error.message);
    }
  }

  return null;
}

export async function saveClientAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile, error: authError } = await requireAdmin();
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const object = formDataToObject(formData);
  const parsed = clientSchema.safeParse(object);
  if (!parsed.success) {
    return { ok: false, message: "화주코드, 화주명, 비고를 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { id, ...payload } = parsed.data;
  const request = id
    ? supabase.from("clients").update({ ...payload, updated_by: profile.id }).eq("id", id)
    : supabase.from("clients").insert({ ...payload, created_by: profile.id, updated_by: profile.id });
  const { error } = await request;
  if (error?.message.includes("notes")) {
    const payloadWithoutNotes = { ...payload };
    delete payloadWithoutNotes.notes;
    const retry = id
      ? await supabase.from("clients").update({ ...payloadWithoutNotes, updated_by: profile.id }).eq("id", id)
      : await supabase.from("clients").insert({ ...payloadWithoutNotes, created_by: profile.id, updated_by: profile.id });
    if (retry.error) {
      if (retry.error.message.includes("department_id") || retry.error.message.includes("null value")) {
        return { ok: false, message: "화주마스터 단독 등록을 위해 Supabase SQL 009번을 먼저 실행하세요. department_id 선택사항 적용이 필요합니다." };
      }
      return { ok: false, message: safeErrorMessage(retry.error.message) };
    }
    revalidateMasterPath("/admin/clients");
    return { ok: true, message: "화주 정보를 저장했습니다. 비고 저장은 Supabase notes 컬럼 추가 후 적용됩니다." };
  }
  if (error?.message.includes("department_id") || error?.message.includes("null value")) {
    return { ok: false, message: "화주마스터 단독 등록을 위해 Supabase SQL 009번을 먼저 실행하세요. department_id 선택사항 적용이 필요합니다." };
  }
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  revalidateMasterPath("/admin/clients");
  return { ok: true, message: "화주 정보를 저장했습니다." };
}

export async function saveDepartmentClientAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!canRegisterDepartmentClients(profile)) {
    return { ok: false, message: "부서 화주 등록 권한이 없습니다." };
  }
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
  }
  const object = formDataToObject(formData);
  const requestedDepartmentId = typeof object.department_id === "string" ? object.department_id : "";
  const departmentId = isAdmin(profile)
    ? requestedDepartmentId || (await resolveDefaultClientDepartmentId(supabase, profile))
    : profile?.department_id;

  if (!departmentId) {
    return { ok: false, message: "소속 부서 정보를 확인하세요." };
  }

  if (!isAdmin(profile) && requestedDepartmentId && requestedDepartmentId !== departmentId) {
    return { ok: false, message: "소속 부서 화주만 등록할 수 있습니다." };
  }

  object.department_id = departmentId;
  object.is_active = "true";
  object.sort_order = object.sort_order || "0";

  const parsed = departmentClientSchema.safeParse(object);
  if (!parsed.success) {
    return { ok: false, message: "화주코드, 화주명, 비고를 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const selectedUserIds = String(formData.get("user_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const primaryUserId = String(formData.get("primary_user_id") ?? "").trim();

  let validUserIds: string[] = [];
  if (selectedUserIds.length > 0) {
    const { data: users, error: userError } = await admin
      .from("profiles")
      .select("id")
      .in("id", selectedUserIds)
      .eq("department_id", departmentId)
      .eq("is_active", true);

    if (userError) {
      return { ok: false, message: safeErrorMessage(userError.message) };
    }

    validUserIds = (users ?? []).map((user) => user.id);
    if (validUserIds.length !== selectedUserIds.length) {
      return { ok: false, message: "소속 부서의 활성 사용자만 담당자로 지정할 수 있습니다." };
    }
  }

  const payload = { ...parsed.data };
  delete payload.id;
  const { data: client, error } = await admin
    .from("clients")
    .insert({ ...payload, created_by: profile.id, updated_by: profile.id })
    .select("id")
    .single();

  if (error?.message.includes("notes")) {
    const payloadWithoutNotes = { ...payload };
    delete payloadWithoutNotes.notes;
    const retry = await admin
      .from("clients")
      .insert({ ...payloadWithoutNotes, created_by: profile.id, updated_by: profile.id })
      .select("id")
      .single();
    if (retry.error || !retry.data) {
      return { ok: false, message: safeErrorMessage(retry.error?.message) };
    }
    const retryLinkError = await upsertDepartmentClientLinks(admin, departmentId, [retry.data.id], profile.id);
    if (retryLinkError) {
      return { ok: false, message: retryLinkError };
    }
    const retryAssignmentError = await insertClientAssignments(admin, departmentId, retry.data.id, validUserIds, primaryUserId, profile.id);
    if (retryAssignmentError) {
      return { ok: false, message: retryAssignmentError };
    }
    revalidateMasterPath("/admin/departments");
    return { ok: true, message: "화주를 등록했습니다. 비고 저장은 Supabase notes 컬럼 추가 후 적용됩니다." };
  }

  if (error || !client) {
    return { ok: false, message: safeErrorMessage(error?.message) };
  }

  const linkError = await upsertDepartmentClientLinks(admin, departmentId, [client.id], profile.id);
  if (linkError) {
    return { ok: false, message: linkError };
  }

  const assignmentError = await insertClientAssignments(admin, departmentId, client.id, validUserIds, primaryUserId, profile.id);
  if (assignmentError) {
    return { ok: false, message: assignmentError };
  }

  revalidateMasterPath("/admin/departments");
  return { ok: true, message: "화주와 담당자를 등록했습니다." };
}

async function resolveWritableDepartmentId(requestedDepartmentId: string) {
  const { profile } = await getCurrentUserProfile();
  if (!canRegisterDepartmentClients(profile)) {
    return { profile: null, departmentId: "", error: "부서 화주 등록 권한이 없습니다." };
  }
  if (!profile) {
    return { profile: null, departmentId: "", error: "로그인이 필요합니다." };
  }
  const departmentId = isAdmin(profile) ? requestedDepartmentId : profile.department_id;
  if (!departmentId) {
    return { profile: null, departmentId: "", error: "소속 부서 정보를 확인하세요." };
  }
  if (!isAdmin(profile) && requestedDepartmentId !== departmentId) {
    return { profile: null, departmentId: "", error: "소속 부서만 처리할 수 있습니다." };
  }
  return { profile, departmentId, error: null };
}

export async function saveDepartmentClientLinksAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const departmentIdRaw = String(formData.get("department_id") ?? "");
  const departmentIdParsed = idSchema.safeParse(departmentIdRaw);
  if (!departmentIdParsed.success) {
    return { ok: false, message: "부서를 확인하세요." };
  }

  const { profile, departmentId, error: authError } = await resolveWritableDepartmentId(departmentIdParsed.data);
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const clientIds = String(formData.get("client_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsedClientIds = z.array(idSchema).min(1, "등록할 화주를 선택하세요.").safeParse(clientIds);
  if (!parsedClientIds.success) {
    return { ok: false, message: "등록할 화주를 선택하세요." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
  }

  const { data: clients, error: clientError } = await admin
    .from("clients")
    .select("id,is_active")
    .in("id", parsedClientIds.data)
    .eq("is_active", true);

  if (clientError) {
    return { ok: false, message: safeErrorMessage(clientError.message) };
  }
  if ((clients ?? []).length !== parsedClientIds.data.length) {
    return { ok: false, message: "사용 가능한 화주만 등록할 수 있습니다." };
  }

  const rows = parsedClientIds.data.map((clientId) => ({
    department_id: departmentId,
    client_id: clientId,
    is_active: true,
    created_by: profile.id,
    updated_by: profile.id
  }));
  const { error } = await admin
    .from("department_client_links")
    .upsert(rows, { onConflict: "department_id,client_id" });

  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidateMasterPath("/admin/departments");
  return { ok: true, message: "선택한 화주를 부서에 등록했습니다." };
}

export async function removeDepartmentClientLinksAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const departmentIdRaw = String(formData.get("department_id") ?? "");
  const departmentIdParsed = idSchema.safeParse(departmentIdRaw);
  if (!departmentIdParsed.success) {
    return { ok: false, message: "부서를 확인하세요." };
  }

  const { profile, departmentId, error: authError } = await resolveWritableDepartmentId(departmentIdParsed.data);
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const clientIds = String(formData.get("client_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsedClientIds = z.array(idSchema).min(1, "삭제할 화주를 선택하세요.").safeParse(clientIds);
  if (!parsedClientIds.success) {
    return { ok: false, message: "삭제할 화주를 선택하세요." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
  }

  const { data: links, error: linkError } = await admin
    .from("department_client_links")
    .select("client_id")
    .eq("department_id", departmentId)
    .eq("is_active", true)
    .in("client_id", parsedClientIds.data);

  if (linkError) {
    return { ok: false, message: safeErrorMessage(linkError.message) };
  }
  if ((links ?? []).length !== parsedClientIds.data.length) {
    return { ok: false, message: "해당 부서에 등록된 화주만 삭제할 수 있습니다." };
  }

  const { error } = await admin
    .from("department_client_links")
    .update({ is_active: false, updated_by: profile.id })
    .eq("department_id", departmentId)
    .in("client_id", parsedClientIds.data);

  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  const { error: assignmentError } = await admin
    .from("client_assignments")
    .update({ is_active: false })
    .eq("department_id", departmentId)
    .in("client_id", parsedClientIds.data);

  if (assignmentError) {
    return { ok: false, message: safeErrorMessage(assignmentError.message) };
  }

  revalidateMasterPath("/admin/departments");
  return { ok: true, message: "선택한 화주를 부서 등록 목록에서 삭제했습니다." };
}

export async function saveDepartmentClientSelectionAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const departmentIdParsed = idSchema.safeParse(String(formData.get("department_id") ?? ""));
  if (!departmentIdParsed.success) {
    return { ok: false, message: "부서를 확인하세요." };
  }

  const { profile, departmentId, error: authError } = await resolveWritableDepartmentId(departmentIdParsed.data);
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const registeredClientIds = String(formData.get("registered_client_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsedRegisteredClientIds = z.array(idSchema).safeParse(registeredClientIds);
  if (!parsedRegisteredClientIds.success) {
    return { ok: false, message: "등록할 화주 목록을 확인하세요." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
  }

  const targetClientIds = Array.from(new Set(parsedRegisteredClientIds.data));
  const { data: currentLinks, error: currentError } = await admin
    .from("department_client_links")
    .select("client_id")
    .eq("department_id", departmentId)
    .eq("is_active", true);

  if (currentError) {
    return { ok: false, message: safeErrorMessage(currentError.message) };
  }

  if (targetClientIds.length > 0) {
    const { data: targetClients, error: targetError } = await admin
      .from("clients")
      .select("id,is_active")
      .in("id", targetClientIds)
      .eq("is_active", true);

    if (targetError) {
      return { ok: false, message: safeErrorMessage(targetError.message) };
    }
    if ((targetClients ?? []).length !== targetClientIds.length) {
      return { ok: false, message: "사용 가능한 화주만 등록할 수 있습니다." };
    }
  }

  const currentClientIds = (currentLinks ?? []).map((link) => link.client_id);
  const addClientIds = targetClientIds.filter((clientId) => !currentClientIds.includes(clientId));
  const removeClientIds = currentClientIds.filter((clientId) => !targetClientIds.includes(clientId));

  if (addClientIds.length > 0) {
    const rows = addClientIds.map((clientId) => ({
      department_id: departmentId,
      client_id: clientId,
      is_active: true,
      created_by: profile.id,
      updated_by: profile.id
    }));
    const { error } = await admin
      .from("department_client_links")
      .upsert(rows, { onConflict: "department_id,client_id" });
    if (error) {
      return { ok: false, message: safeErrorMessage(error.message) };
    }
  }

  if (removeClientIds.length > 0) {
    const { error } = await admin
      .from("department_client_links")
      .update({ is_active: false, updated_by: profile.id })
      .eq("department_id", departmentId)
      .in("client_id", removeClientIds);
    if (error) {
      return { ok: false, message: safeErrorMessage(error.message) };
    }

    const { error: assignmentError } = await admin
      .from("client_assignments")
      .update({ is_active: false })
      .eq("department_id", departmentId)
      .in("client_id", removeClientIds);
    if (assignmentError) {
      return { ok: false, message: safeErrorMessage(assignmentError.message) };
    }
  }

  revalidateMasterPath("/admin/departments");
  return { ok: true, message: "화주 등록 목록을 저장했습니다." };
}

export async function saveDepartmentClientAssignmentsAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const departmentIdParsed = idSchema.safeParse(String(formData.get("department_id") ?? ""));
  const clientIdParsed = idSchema.safeParse(String(formData.get("client_id") ?? ""));
  if (!departmentIdParsed.success || !clientIdParsed.success) {
    return { ok: false, message: "부서 또는 화주 정보를 확인하세요." };
  }

  const { profile, departmentId, error: authError } = await resolveWritableDepartmentId(departmentIdParsed.data);
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const selectedUserIds = String(formData.get("user_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const primaryUserId = String(formData.get("primary_user_id") ?? "").trim();
  const parsedUserIds = z.array(idSchema).safeParse(selectedUserIds);
  if (!parsedUserIds.success) {
    return { ok: false, message: "담당자 정보를 확인하세요." };
  }
  const primaryUserIdParsed = primaryUserId ? idSchema.safeParse(primaryUserId) : null;
  if (primaryUserIdParsed && !primaryUserIdParsed.success) {
    return { ok: false, message: "대표 담당자 정보를 확인하세요." };
  }
  if (primaryUserId && !parsedUserIds.data.includes(primaryUserId)) {
    return { ok: false, message: "대표 담당자는 선택한 담당자 중에서 지정하세요." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
  }

  const { data: link, error: linkError } = await admin
    .from("department_client_links")
    .select("client_id")
    .eq("department_id", departmentId)
    .eq("client_id", clientIdParsed.data)
    .eq("is_active", true)
    .maybeSingle();

  if (linkError) {
    return { ok: false, message: safeErrorMessage(linkError.message) };
  }
  if (!link) {
    return { ok: false, message: "해당 부서에 등록된 화주만 담당자를 지정할 수 있습니다." };
  }

  let validUserIds: string[] = [];
  if (parsedUserIds.data.length > 0) {
    const { data: users, error: userError } = await admin
      .from("profiles")
      .select("id")
      .in("id", parsedUserIds.data)
      .eq("department_id", departmentId)
      .eq("app_role", "client_owner")
      .eq("is_active", true);

    if (userError) {
      return { ok: false, message: safeErrorMessage(userError.message) };
    }
    validUserIds = (users ?? []).map((user) => user.id);
    if (validUserIds.length !== parsedUserIds.data.length) {
      return { ok: false, message: "해당 부서의 활성 화주담당자만 지정할 수 있습니다." };
    }
  }

  const { error: deactivateError } = await admin
    .from("client_assignments")
    .update({ is_active: false })
    .eq("department_id", departmentId)
    .eq("client_id", clientIdParsed.data);

  if (deactivateError) {
    return { ok: false, message: safeErrorMessage(deactivateError.message) };
  }

  if (validUserIds.length > 0) {
    const rows = validUserIds.map((userId, index) => ({
      department_id: departmentId,
      client_id: clientIdParsed.data,
      user_id: userId,
      is_primary: primaryUserId ? userId === primaryUserId : index === 0,
      is_active: true,
      assigned_by: profile.id
    }));
    const { error } = await admin.from("client_assignments").upsert(rows, { onConflict: "department_id,client_id,user_id" });
    if (error) {
      return { ok: false, message: safeErrorMessage(error.message) };
    }
  }

  revalidateMasterPath("/admin/departments");
  return { ok: true, message: "화주 담당자를 저장했습니다." };
}

async function insertClientAssignments(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  departmentId: string,
  clientId: string,
  userIds: string[],
  primaryUserId: string,
  actorId: string | null
) {
  if (userIds.length === 0) {
    return null;
  }

  const rows = userIds.map((userId, index) => ({
    department_id: departmentId,
    client_id: clientId,
    user_id: userId,
    is_primary: primaryUserId ? userId === primaryUserId : index === 0,
    is_active: true,
    assigned_by: actorId
  }));

  const { error } = await admin.from("client_assignments").insert(rows);
  return error ? safeErrorMessage(error.message) : null;
}

async function upsertDepartmentClientLinks(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  departmentId: string,
  clientIds: string[],
  actorId: string | null
) {
  if (clientIds.length === 0) {
    return null;
  }

  const rows = clientIds.map((clientId) => ({
    department_id: departmentId,
    client_id: clientId,
    is_active: true,
    created_by: actorId,
    updated_by: actorId
  }));
  const { error } = await admin.from("department_client_links").upsert(rows, { onConflict: "department_id,client_id" });
  return error ? safeErrorMessage(error.message) : null;
}

const bulkClientImportRowSchema = z.object({
  client_code: z.string().trim().min(1, "화주코드를 입력하세요.").max(30),
  client_name: z.string().trim().min(1, "화주명을 입력하세요.").max(100),
  notes: z.string().trim().optional().nullable()
});

export async function saveClientsBulkImportAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile, error: authError } = await requireAdmin();
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const rawRows = String(formData.get("rows") ?? "[]");
  let rows: unknown;
  try {
    rows = JSON.parse(rawRows);
  } catch {
    return { ok: false, message: "일괄등록 데이터를 확인하세요." };
  }

  const parsed = z.array(bulkClientImportRowSchema).min(1, "등록할 화주가 없습니다.").max(2000, "한 번에 2000건까지 등록할 수 있습니다.").safeParse(rows);
  if (!parsed.success) {
    return { ok: false, message: "화주코드, 화주명, 비고를 확인하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const importRows = parsed.data.map((row) => ({
    client_code: row.client_code,
    client_name: row.client_name,
    notes: row.notes?.trim() || null
  }));

  const { data, error } = await supabase.rpc("bulk_import_clients_atomic", {
    p_rows: importRows as unknown as Json
  });
  if (error) {
    if (error.message.includes("bulk_import_clients_atomic")) {
      return { ok: false, message: "Supabase SQL 019번을 먼저 실행하세요. 화주 일괄등록 저장 함수가 아직 DB에 없습니다." };
    }
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  const result = data as {
    total_count?: number;
    inserted_count?: number;
    updated_count?: number;
    duplicate_count?: number;
  } | null;
  const totalCount = result?.total_count ?? importRows.length;
  const insertedCount = result?.inserted_count ?? 0;
  const updatedCount = result?.updated_count ?? 0;
  const duplicateCount = result?.duplicate_count ?? 0;

  revalidateMasterPath("/admin/clients");
  return { ok: true, message: `화주 ${totalCount}건을 일괄등록했습니다. 신규 ${insertedCount}건, 업데이트 ${updatedCount}건${duplicateCount > 0 ? `, 중복 입력 ${duplicateCount}건은 마지막 값으로 반영` : ""}.` };
}

export async function deleteClientsAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile, error: authError } = await requireAdmin();
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const clientIds = String(formData.get("client_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const parsed = z.array(idSchema).min(1, "삭제할 화주를 선택하세요.").safeParse(clientIds);
  if (!parsed.success) {
    return { ok: false, message: "삭제할 화주를 선택하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { error } = await supabase
    .from("clients")
    .update({ is_active: false, updated_by: profile.id })
    .in("id", parsed.data);

  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidateMasterPath("/admin/clients");
  return { ok: true, message: "선택한 화주를 삭제했습니다." };
}

export async function saveClientAssignmentsAction(): Promise<ActionResult> {
  const { error: authError } = await requireAdmin();
  if (authError) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }
  return { ok: false, message: "담당자는 부서마스터의 화주등록 화면에서 부서별로 지정하세요." };
}

export async function saveUserAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin();
  if (authError) {
    return { ok: false, message: authError };
  }
  const parsed = userSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: "입력값을 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  let authUserId = parsed.data.id;
  if (!authUserId) {
    try {
      const admin = createSupabaseAdminClient();
      const { data, error } = parsed.data.invite
        ? await admin.auth.admin.inviteUserByEmail(parsed.data.email)
        : await admin.auth.admin.createUser({
            email: parsed.data.email,
            email_confirm: true,
            user_metadata: { full_name: parsed.data.full_name }
          });
      if (error || !data.user) {
        return { ok: false, message: "Auth 사용자 생성 또는 초대에 실패했습니다." };
      }
      authUserId = data.user.id;
    } catch {
      return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
    }
  }

  const { error } = await supabase.from("profiles").upsert({
    id: authUserId,
    email: parsed.data.email,
    employee_no: parsed.data.employee_no,
    full_name: parsed.data.full_name,
    department_id: parsed.data.department_id,
    app_role: parsed.data.app_role,
    notes: parsed.data.notes,
    is_active: parsed.data.is_active
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  revalidateMasterPath("/admin/users");
  return { ok: true, message: "사용자 정보를 저장했습니다." };
}

export async function deleteUsersAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile, error: authError } = await requireAdmin();
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const userIds = String(formData.get("user_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsed = z.array(idSchema).min(1, "삭제할 사용자를 선택하세요.").safeParse(userIds);
  if (!parsed.success) {
    return { ok: false, message: "삭제할 사용자를 선택하세요." };
  }
  if (parsed.data.includes(profile.id)) {
    return { ok: false, message: "현재 로그인한 사용자는 삭제할 수 없습니다." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .in("id", parsed.data);

  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidateMasterPath("/admin/users");
  return { ok: true, message: "선택한 사용자를 미사용 처리했습니다." };
}

export async function resetUserPasswordAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin();
  if (authError) {
    return { ok: false, message: authError };
  }

  const parsedUserId = idSchema.safeParse(String(formData.get("user_id") ?? "").trim());
  if (!parsedUserId.success) {
    return { ok: false, message: "비밀번호를 초기화할 사용자를 확인하세요." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
  }

  const { data: targetUser, error: targetError } = await admin
    .from("profiles")
    .select("id,employee_no")
    .eq("id", parsedUserId.data)
    .maybeSingle();
  if (targetError || !targetUser) {
    return { ok: false, message: "비밀번호를 초기화할 사용자 정보를 찾을 수 없습니다." };
  }

  const employeeNo = targetUser.employee_no.trim();
  if (!employeeNo) {
    return { ok: false, message: "등록된 사번이 없어 비밀번호를 초기화할 수 없습니다." };
  }

  const initialPassword = getInitialPassword(employeeNo);
  const { error } = await admin.auth.admin.updateUserById(targetUser.id, { password: initialPassword });
  if (error) {
    return {
      ok: false,
      message: error.message.toLowerCase().includes("password")
        ? "등록된 사번이 Supabase 비밀번호 정책을 충족하지 않습니다. 사번과 Auth 비밀번호 정책을 확인하세요."
        : "비밀번호 초기화에 실패했습니다. Auth 사용자 연결 상태를 확인하세요."
    };
  }

  return {
    ok: true,
    message: initialPassword === employeeNo
      ? "비밀번호를 등록된 사번으로 초기화했습니다."
      : "비밀번호를 사번 뒤에 0을 붙인 6자리 초기 비밀번호로 변경했습니다."
  };
}

async function requireUserRegistrationApprover(departmentId: string) {
  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { profile: null, error: "로그인이 필요합니다." };
  }
  if (profile.app_role === "admin") {
    return { profile, error: null };
  }
  if ((profile.app_role === "department_head" || profile.app_role === "manager") && profile.department_id === departmentId) {
    return { profile, error: null };
  }
  return { profile: null, error: "가입 요청 승인 권한이 없습니다." };
}

export async function approveUserRegistrationRequestAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const requestId = String(formData.get("request_id") ?? "");
  const parsed = idSchema.safeParse(requestId);
  if (!parsed.success) {
    return { ok: false, message: "승인할 요청을 선택하세요." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
  }

  const { data: request, error: requestError } = await admin
    .from("user_registration_requests")
    .select("id,auth_user_id,department_id,status")
    .eq("id", parsed.data)
    .maybeSingle();
  if (requestError || !request) {
    return { ok: false, message: "가입 요청을 찾을 수 없습니다." };
  }
  if (request.status !== "pending") {
    return { ok: false, message: "이미 처리된 가입 요청입니다." };
  }

  const { profile, error: authError } = await requireUserRegistrationApprover(request.department_id);
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }
  if (!request.auth_user_id) {
    return { ok: false, message: "가입 요청에 연결된 Auth 사용자가 없습니다." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ is_active: true, notes: null })
    .eq("id", request.auth_user_id);
  if (profileError) {
    return { ok: false, message: safeErrorMessage(profileError.message) };
  }

  const { error: updateError } = await admin
    .from("user_registration_requests")
    .update({
      status: "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_comment: "가입 승인"
    })
    .eq("id", request.id);
  if (updateError) {
    return { ok: false, message: safeErrorMessage(updateError.message) };
  }

  revalidateMasterPath("/admin/users");
  return { ok: true, message: "사용자 가입 요청을 승인했습니다." };
}

export async function rejectUserRegistrationRequestAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const requestId = String(formData.get("request_id") ?? "");
  const parsed = idSchema.safeParse(requestId);
  if (!parsed.success) {
    return { ok: false, message: "반려할 요청을 선택하세요." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
  }

  const { data: request, error: requestError } = await admin
    .from("user_registration_requests")
    .select("id,auth_user_id,department_id,status")
    .eq("id", parsed.data)
    .maybeSingle();
  if (requestError || !request) {
    return { ok: false, message: "가입 요청을 찾을 수 없습니다." };
  }
  if (request.status !== "pending") {
    return { ok: false, message: "이미 처리된 가입 요청입니다." };
  }

  const { profile, error: authError } = await requireUserRegistrationApprover(request.department_id);
  if (authError || !profile) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  if (request.auth_user_id) {
    await admin.from("profiles").update({ is_active: false, notes: "사용자 가입 요청 반려" }).eq("id", request.auth_user_id);
  }

  const { error: updateError } = await admin
    .from("user_registration_requests")
    .update({
      status: "rejected",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_comment: "가입 반려"
    })
    .eq("id", request.id);
  if (updateError) {
    return { ok: false, message: safeErrorMessage(updateError.message) };
  }

  revalidateMasterPath("/admin/users");
  return { ok: true, message: "사용자 가입 요청을 반려했습니다." };
}
