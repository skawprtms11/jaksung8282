"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUserProfile, requireActiveProfile } from "@/lib/auth/current-user";
import { generateTemporaryPassword } from "@/lib/auth/initial-password";
import { canRegisterDepartmentClients, isAdmin } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { idSchema, userSchema } from "@/lib/validations/common";
import { formDataToObject, safeErrorMessage, type ActionResult } from "@/lib/utils/form";

const HEADER_FILTER_CACHE_TAG = "header-filter-options";

function revalidateMasterPath(path: string) {
  revalidatePath(path);
  revalidateTag(HEADER_FILTER_CACHE_TAG, { expire: 0 });
}

async function requireAdmin() {
  const { profile } = await requireActiveProfile();
  if (!profile || !isAdmin(profile)) {
    return { profile: null, error: "관리자만 처리할 수 있습니다." };
  }
  return { profile, error: null };
}

// 부서 자체(public.departments)는 현황관리 가드 트리거로 쓰기가 막혀 있어 현황관리에서만 관리한다.
// 부서장 지정은 profiles 만 바꾸므로(가드 대상 아님) 주간자료에서 유지한다.
export async function saveDepartmentHeadAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin();
  if (authError) {
    return { ok: false, message: authError };
  }
  const departmentIdParsed = idSchema.safeParse(String(formData.get("department_id") ?? ""));
  const headUserIdParsed = idSchema.safeParse(String(formData.get("department_head_id") ?? "").trim());
  if (!departmentIdParsed.success) {
    return { ok: false, message: "부서를 확인하세요." };
  }
  if (!headUserIdParsed.success) {
    return { ok: false, message: "부서장을 선택하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { data: department, error: departmentError } = await supabase
    .from("departments")
    .select("id")
    .eq("id", departmentIdParsed.data)
    .eq("is_active", true)
    .maybeSingle();
  if (departmentError) {
    return { ok: false, message: safeErrorMessage(departmentError.message) };
  }
  if (!department) {
    return { ok: false, message: "사용 중인 부서만 부서장을 지정할 수 있습니다." };
  }

  const leaderError = await updateDepartmentLeaders(departmentIdParsed.data, headUserIdParsed.data, []);
  if (leaderError) {
    return { ok: false, message: leaderError };
  }
  revalidateMasterPath("/admin/departments");
  return { ok: true, message: "부서장을 지정했습니다." };
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

// 일시적 오류(네트워크·커넥션 풀)로 실패하는 경우가 있어 1회만 즉시 재시도한다.
async function revokeUserSessionsWithRetry(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const first = await admin.rpc("revoke_user_sessions", { p_user_id: userId });
  if (!first.error) {
    return true;
  }
  console.error("세션 종료 실패(재시도 예정)", first.error.code);
  const retry = await admin.rpc("revoke_user_sessions", { p_user_id: userId });
  if (retry.error) {
    console.error("세션 종료 재시도 실패", retry.error.code);
    return false;
  }
  return true;
}

// sessionRevokeFailed: 초기화는 끝났지만 기존 세션 종료에 실패한 경우(관리자 경고 표시용)
export type UserPasswordResetResult = { temporaryPassword: string; sessionRevokeFailed?: boolean };

// 임시 비밀번호는 응답으로 관리자에게 한 번만 전달하고 로그·DB 어디에도 남기지 않는다.
export async function resetUserPasswordAction(
  _: ActionResult<UserPasswordResetResult> | null,
  formData: FormData
): Promise<ActionResult<UserPasswordResetResult>> {
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
    .select("id")
    .eq("id", parsedUserId.data)
    .maybeSingle();
  if (targetError || !targetUser) {
    return { ok: false, message: "비밀번호를 초기화할 사용자 정보를 찾을 수 없습니다." };
  }

  const temporaryPassword = generateTemporaryPassword();
  // must_change_password 플래그로 다음 로그인 때 비밀번호 변경 화면을 강제한다(app_metadata 는 기존 키와 병합됨).
  const { error } = await admin.auth.admin.updateUserById(targetUser.id, {
    password: temporaryPassword,
    app_metadata: { must_change_password: true }
  });
  if (error) {
    return {
      ok: false,
      message: error.message.toLowerCase().includes("password")
        ? "임시 비밀번호가 Supabase 비밀번호 정책을 충족하지 않습니다. Auth 비밀번호 정책을 확인하세요."
        : "비밀번호 초기화에 실패했습니다. Auth 사용자 연결 상태를 확인하세요."
    };
  }

  // 탈취됐을 수 있는 기존 세션(리프레시 토큰 포함)을 모두 끊는다. 실패해도 초기화 자체는 끝났으므로 구분해 알린다.
  if (!(await revokeUserSessionsWithRetry(admin, targetUser.id))) {
    return {
      ok: true,
      message:
        "임시 비밀번호를 발급했지만 기존 로그인 세션 종료에 실패했습니다. 사용자는 첫 로그인 때 새 비밀번호로 변경해야 하며, 세션 종료를 다시 시도하거나 시스템 담당자에게 확인을 요청하세요.",
      data: { temporaryPassword, sessionRevokeFailed: true }
    };
  }

  return {
    ok: true,
    message: "임시 비밀번호를 발급하고 기존 로그인 세션을 모두 종료했습니다. 사용자는 첫 로그인 때 새 비밀번호로 변경해야 합니다.",
    data: { temporaryPassword }
  };
}

// 비밀번호 초기화 후 세션 종료가 실패했을 때 관리자가 팝업에서 다시 시도하는 용도.
export async function revokeUserSessionsAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  // requireAdmin 은 requireActiveProfile 을 거치므로 비활성·강제 변경 대기 관리자도 거부된다.
  const { error: authError } = await requireAdmin();
  if (authError) {
    return { ok: false, message: authError };
  }

  const parsedUserId = idSchema.safeParse(String(formData.get("user_id") ?? "").trim());
  if (!parsedUserId.success) {
    return { ok: false, message: "세션을 종료할 사용자를 확인하세요." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY를 서버 환경변수에 설정하세요." };
  }

  const { data: targetUser, error: targetError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", parsedUserId.data)
    .maybeSingle();
  if (targetError || !targetUser) {
    return { ok: false, message: "세션을 종료할 사용자 정보를 찾을 수 없습니다." };
  }

  if (!(await revokeUserSessionsWithRetry(admin, targetUser.id))) {
    return { ok: false, message: "기존 로그인 세션 종료에 다시 실패했습니다. 시스템 담당자에게 확인을 요청하세요." };
  }
  return { ok: true, message: "기존 로그인 세션을 모두 종료했습니다." };
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
