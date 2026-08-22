"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeAuthRedirect } from "@/lib/auth/redirect";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { employeeNoSchema, idSchema } from "@/lib/validations/common";
import type { ActionResult } from "@/lib/utils/form";

// 가입 요청 레이트리밋 임계값(공유 저장소 = Supabase). 가입 화면에서만 동작하므로 주요 흐름 속도와 무관하다.
const REGISTRATION_IP_LIMIT = 10; // 10분당 IP별
const REGISTRATION_EMAIL_LIMIT = 5; // 1시간당 이메일별
const REGISTRATION_IP_WINDOW_MS = 10 * 60 * 1000;
const REGISTRATION_EMAIL_WINDOW_MS = 60 * 60 * 1000;

async function getClientIpHash() {
  const headerStore = await headers();
  const raw =
    headerStore.get("x-nf-client-connection-ip") ||
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    "";
  return raw ? createHash("sha256").update(raw).digest("hex") : null;
}

const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
    passwordConfirm: z.string().min(1, "비밀번호 확인을 입력하세요.")
  })
  .refine((value) => value.password === value.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "비밀번호가 일치하지 않습니다."
  });

const registrationRequestSchema = z
  .object({
    email: z.string().trim().email("회사 이메일 주소를 입력하세요."),
    password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
    passwordConfirm: z.string().min(1, "비밀번호 확인을 입력하세요."),
    employee_no: employeeNoSchema,
    full_name: z.string().trim().min(1, "성함을 입력하세요.").max(100),
    department_id: idSchema
  })
  .refine((value) => value.password === value.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "비밀번호가 일치하지 않습니다."
  });

export async function signInAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = normalizeAuthRedirect(formData.get("redirectTo"));
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: "이메일 또는 비밀번호를 확인하세요." };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", user.id).maybeSingle();
    if (!profile?.is_active) {
      await supabase.auth.signOut();
      return { ok: false, message: "비활성화된 사용자입니다. 관리자에게 문의하세요." };
    }
  }

  redirect(redirectTo);
}

export async function requestUserRegistrationAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = registrationRequestSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
    employee_no: String(formData.get("employee_no") ?? ""),
    full_name: String(formData.get("full_name") ?? ""),
    department_id: String(formData.get("department_id") ?? "")
  });
  if (!parsed.success) {
    return { ok: false, message: "가입 요청 정보를 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "사용자 가입 요청을 위해 서버에 SUPABASE_SERVICE_ROLE_KEY를 설정하세요." };
  }

  // 계정 열거(enumeration) 방지: 이메일·사번의 존재 여부가 응답으로 드러나지 않도록
  // 부서 불일치·기존 계정·대기 요청 등 모든 사후 분기를 동일한 접수 메시지로 통일한다.
  // 내부적으로는 중복 계정을 만들지 않고 조용히 종료한다.
  const REGISTRATION_ACK = {
    ok: true as const,
    message: "가입 요청이 접수되었습니다. 관리자 또는 부서 승인 후 로그인할 수 있습니다."
  };

  // 레이트리밋: 같은 IP/이메일의 최근 시도 횟수를 확인해 자동화 남용·대량 선점을 차단한다.
  // 존재 여부와 무관하게 시도량 기준이라 열거 오라클을 만들지 않는다.
  const ipHash = await getClientIpHash();
  const nowMs = Date.now();
  const ipWindowStart = new Date(nowMs - REGISTRATION_IP_WINDOW_MS).toISOString();
  const emailWindowStart = new Date(nowMs - REGISTRATION_EMAIL_WINDOW_MS).toISOString();
  const [{ count: ipAttemptCount }, { count: emailAttemptCount }] = await Promise.all([
    ipHash
      ? admin
          .from("registration_attempts")
          .select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash)
          .gte("created_at", ipWindowStart)
      : Promise.resolve({ count: 0 }),
    admin
      .from("registration_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", parsed.data.email)
      .gte("created_at", emailWindowStart)
  ]);
  if ((ipAttemptCount ?? 0) >= REGISTRATION_IP_LIMIT || (emailAttemptCount ?? 0) >= REGISTRATION_EMAIL_LIMIT) {
    return { ok: false, message: "가입 요청이 너무 많습니다. 잠시 후 다시 시도하세요." };
  }
  await admin.from("registration_attempts").insert({ ip_hash: ipHash, email: parsed.data.email });
  // 오래된 기록은 정리해 테이블이 무한정 커지지 않게 한다(실패는 무시).
  await admin
    .from("registration_attempts")
    .delete()
    .lt("created_at", new Date(nowMs - REGISTRATION_EMAIL_WINDOW_MS).toISOString());

  const { data: department } = await admin
    .from("departments")
    .select("id")
    .eq("id", parsed.data.department_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!department) {
    return REGISTRATION_ACK;
  }

  const [
    { data: activeEmailProfiles },
    { data: activeEmployeeNoProfiles },
    { data: pendingEmailRequests },
    { data: pendingEmployeeNoRequests }
  ] = await Promise.all([
    admin.from("profiles").select("id").eq("email", parsed.data.email).eq("is_active", true).limit(1),
    admin.from("profiles").select("id").eq("employee_no", parsed.data.employee_no).eq("is_active", true).limit(1),
    admin
      .from("user_registration_requests")
      .select("id")
      .eq("email", parsed.data.email)
      .eq("status", "pending")
      .limit(1),
    admin
      .from("user_registration_requests")
      .select("id")
      .eq("employee_no", parsed.data.employee_no)
      .eq("status", "pending")
      .limit(1)
  ]);
  if (
    (activeEmailProfiles?.length ?? 0) > 0 ||
    (activeEmployeeNoProfiles?.length ?? 0) > 0 ||
    (pendingEmailRequests?.length ?? 0) > 0 ||
    (pendingEmployeeNoRequests?.length ?? 0) > 0
  ) {
    // 이미 존재하는 계정/요청은 새로 만들지 않고 동일한 접수 메시지를 반환한다.
    return REGISTRATION_ACK;
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.full_name,
      employee_no: parsed.data.employee_no
    }
  });
  if (authError || !authData.user) {
    // 계정 생성 실패(대개 이미 등록된 이메일)도 존재 여부를 노출하지 않도록 동일 메시지로 응답한다.
    console.error("requestUserRegistrationAction: createUser failed", authError?.message);
    return REGISTRATION_ACK;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: authData.user.id,
    email: parsed.data.email,
    employee_no: parsed.data.employee_no,
    full_name: parsed.data.full_name,
    department_id: parsed.data.department_id,
    app_role: "client_owner",
    notes: "사용자 가입 요청 승인 대기",
    is_active: false
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { ok: false, message: "가입 요청 프로필 생성에 실패했습니다." };
  }

  const { error: requestError } = await admin.from("user_registration_requests").insert({
    auth_user_id: authData.user.id,
    email: parsed.data.email,
    employee_no: parsed.data.employee_no,
    full_name: parsed.data.full_name,
    department_id: parsed.data.department_id,
    status: "pending"
  });
  if (requestError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { ok: false, message: "Supabase SQL 014번을 실행한 뒤 다시 가입 요청하세요." };
  }

  return REGISTRATION_ACK;
}

export async function signOutAction(formData: FormData) {
  const redirectTo = normalizeAuthRedirect(formData.get("redirectTo"), "");
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  if (redirectTo.startsWith("/mobile")) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}&mode=mobile`);
  }
  redirect("/login");
}

export async function resetPasswordAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`
  });

  if (error) {
    return { ok: false, message: "비밀번호 재설정 메일 발송에 실패했습니다." };
  }
  return { ok: true, message: "비밀번호 재설정 메일을 발송했습니다." };
}

export async function updatePasswordAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = updatePasswordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? "")
  });
  if (!parsed.success) {
    return { ok: false, message: "비밀번호를 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "재설정 링크가 만료되었거나 유효하지 않습니다. 메일을 다시 발송하세요." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, message: "비밀번호 변경에 실패했습니다. 재설정 링크를 다시 발급하세요." };
  }

  await supabase.auth.signOut();
  return { ok: true, message: "비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요." };
}
