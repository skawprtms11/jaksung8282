"use server";

import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveClientIp, toRateLimitIpKey, UNKNOWN_IP_BUCKET } from "@/lib/auth/client-ip";
import { getLoginHashKey, hashLoginEmail, hashLoginIp } from "@/lib/auth/login-hash";
import { loginLockMessage } from "@/lib/auth/login-lock";
import { isRecoverySession, mustChangePassword } from "@/lib/auth/password-change";
import { PASSWORD_RESET_ACK_MESSAGE, shouldSendPasswordReset } from "@/lib/auth/password-reset-limit";
import { normalizeAuthRedirect } from "@/lib/auth/redirect";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { employeeNoSchema, idSchema } from "@/lib/validations/common";
import type { ActionResult } from "@/lib/utils/form";

// 가입 요청 레이트리밋 임계값(공유 저장소 = Supabase). 가입 화면에서만 동작하므로 주요 흐름 속도와 무관하다.
const REGISTRATION_IP_LIMIT = 10; // 10분당 IP별
// IP 헤더가 없는 요청은 하나의 'unknown' 버킷으로 묶어 더 엄격하게 제한한다(헤더 제거로 제한 우회 방지).
const REGISTRATION_UNKNOWN_IP_LIMIT = 3;
const REGISTRATION_EMAIL_LIMIT = 5; // 1시간당 이메일별
const REGISTRATION_IP_WINDOW_MS = 10 * 60 * 1000;
const REGISTRATION_EMAIL_WINDOW_MS = 60 * 60 * 1000;

// 가입 요청 제한 전용 IP 해시(평문 sha256). 운영 registration_attempts 기록과 호환되도록 방식을 유지한다.
// 헤더 우선순위와 사유는 resolveClientIp(src/lib/auth/client-ip.ts) 참고. IPv6 는 /64 대역 단위로 묶는다.
async function getClientIpHash() {
  const raw = resolveClientIp(await headers());
  return raw ? createHash("sha256").update(toRateLimitIpKey(raw)).digest("hex") : UNKNOWN_IP_BUCKET;
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
// 로그인 실패 제한 키. 이메일·IP 모두 서버 전용 키로 HMAC 한 값이며, IP 헤더가 없으면 'unknown' 버킷이다.
type LoginLock = { admin: AdminClient; emailHash: string; ipHash: string };

// 서비스 키가 없으면 제한을 적용하지 못한 채 진행한다(fail-open, 원인은 서버 로그).
async function getLoginLock(email: string): Promise<LoginLock | null> {
  const key = getLoginHashKey();
  if (!key) {
    return null;
  }
  let admin: AdminClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    console.error("로그인 실패 제한: 서비스 키가 없어 제한을 적용하지 못했습니다.");
    return null;
  }
  return {
    admin,
    emailHash: hashLoginEmail(key, email),
    ipHash: hashLoginIp(key, resolveClientIp(await headers()))
  };
}

// 판정과 실패 선기록을 DB 함수 하나로 처리한다(같은 이메일 직렬화로 동시 요청이 임계값을 넘지 못함).
// 차단이면 문구, 통과면 null. 이후 확인에 실패하면 선기록이 그대로 실패 1회로 남는다.
// 함수가 없거나(마이그레이션 20261031130000 미적용) 호출이 실패하면 로그인 자체를 막지 않는다.
// 제한을 못 거는 것보다 전 사용자가 잠기는 쪽이 피해가 크기 때문이다(fail-open). 원인은 서버 로그로만 남긴다.
async function reserveLoginAttempt(lock: LoginLock | null) {
  if (!lock) {
    return null;
  }
  const { data, error } = await lock.admin.rpc("reserve_login_attempt", {
    p_email_hash: lock.emailHash,
    p_ip_hash: lock.ipHash
  });
  if (error) {
    console.error("로그인 실패 제한 판정 실패(reserve_login_attempt)", error.code);
    return null;
  }
  return loginLockMessage(data?.[0]);
}

// 성공한 이메일·IP 의 기록(선기록 포함)을 지우고 성공 1행을 남긴다(신뢰 IP 판정용, 'unknown' 은 남기지 않음).
async function recordLoginSuccess(lock: LoginLock | null) {
  if (!lock) {
    return;
  }
  const { error } = await lock.admin.rpc("record_login_success", {
    p_email_hash: lock.emailHash,
    p_ip_hash: lock.ipHash
  });
  if (error) {
    console.error("로그인 성공 기록 실패(record_login_success)", error.code);
  }
}

// 현재 비밀번호 확인 전용. 쿠키 세션을 건드리지 않도록 저장하지 않는 별도 클라이언트로 로그인해 보고 바로 폐기한다.
async function verifyCurrentPassword(email: string, password: string) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return false;
  }
  const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  if (error) {
    return false;
  }
  await verifier.auth.signOut({ scope: "local" });
  return true;
}

const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72, "비밀번호는 72자 이하로 입력하세요."),
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
  if (!email || !password || email.length > 320) {
    return { ok: false, message: "이메일 또는 비밀번호를 확인하세요." };
  }

  // 계정 존재 여부와 무관하게 입력 이메일(+IP) 기준으로 실패를 세고, 차단 문구도 동일하게 보여준다.
  const lock = await getLoginLock(email);
  const lockedMessage = await reserveLoginAttempt(lock);
  if (lockedMessage) {
    return { ok: false, message: lockedMessage };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: "이메일 또는 비밀번호를 확인하세요." };
  }
  await recordLoginSuccess(lock);

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
  // 대소문자만 바꾼 같은 이메일로 제한을 우회하지 못하게 소문자로 센다.
  const attemptEmail = parsed.data.email.toLowerCase();
  const ipLimit = ipHash === UNKNOWN_IP_BUCKET ? REGISTRATION_UNKNOWN_IP_LIMIT : REGISTRATION_IP_LIMIT;
  const nowMs = Date.now();
  const ipWindowStart = new Date(nowMs - REGISTRATION_IP_WINDOW_MS).toISOString();
  const emailWindowStart = new Date(nowMs - REGISTRATION_EMAIL_WINDOW_MS).toISOString();
  const [{ count: ipAttemptCount }, { count: emailAttemptCount }] = await Promise.all([
    admin
      .from("registration_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", ipWindowStart),
    admin
      .from("registration_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", attemptEmail)
      .gte("created_at", emailWindowStart)
  ]);
  if ((ipAttemptCount ?? 0) >= ipLimit || (emailAttemptCount ?? 0) >= REGISTRATION_EMAIL_LIMIT) {
    return { ok: false, message: "가입 요청이 너무 많습니다. 잠시 후 다시 시도하세요." };
  }
  await admin.from("registration_attempts").insert({ ip_hash: ipHash, email: attemptEmail });
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

  const ack: ActionResult = { ok: true, message: PASSWORD_RESET_ACK_MESSAGE };
  if (!(await reservePasswordReset(email))) {
    return ack;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`
  });
  // 오류도 성공과 같은 응답으로 돌려 계정 존재 여부를 숨긴다. 서버 로그에는 오류 코드만 남긴다(이메일 원문 금지).
  if (error) {
    console.error("비밀번호 재설정 메일 발송 실패", error.code);
  }
  return ack;
}

// 발송 제한 판정과 기록을 DB 함수 하나로 처리한다(같은 이메일·IP 직렬화). 발송해도 되면 true.
// 해시 키·admin 클라이언트·함수가 없으면 발송을 막지 않는다(fail-open, 원인은 서버 로그).
async function reservePasswordReset(email: string) {
  const lock = await getLoginLock(email);
  if (!lock) {
    return true;
  }
  const result = await lock.admin.rpc("reserve_password_reset", {
    p_email_hash: lock.emailHash,
    p_ip_hash: lock.ipHash
  });
  if (result.error) {
    console.error("재설정 메일 발송 제한 판정 실패(reserve_password_reset)", result.error.code);
  }
  return shouldSendPasswordReset(result);
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

  const [
    {
      data: { user }
    },
    { data: claimsData }
  ] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  if (!user) {
    return { ok: false, message: "재설정 링크가 만료되었거나 유효하지 않습니다. 메일을 다시 발송하세요." };
  }

  // 재설정 메일 링크 세션만 현재 비밀번호 없이 바꿀 수 있다.
  // 관리자 초기화(강제 변경) 계정을 포함한 그 외 로그인 세션은, 탈취된 세션으로 비밀번호를 바꿔
  // 계정을 가로채지 못하게 현재(강제 변경이면 관리자에게 받은 임시) 비밀번호를 확인한다.
  const claims = claimsData?.claims;
  const isRecovery = isRecoverySession(claims);
  // 변경 요구 여부는 토큰(만료 전 이전 값일 수 있음)이 아니라 Auth 서버의 현재 사용자 정보로 판정한다.
  const isForcedChange = mustChangePassword(user);
  if (!isRecovery) {
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const missingMessage = isForcedChange ? "관리자에게 받은 임시 비밀번호를 입력하세요." : "현재 비밀번호를 입력하세요.";
    if (!currentPassword || !user.email) {
      return { ok: false, message: missingMessage, fieldErrors: { currentPassword: [missingMessage] } };
    }
    const lock = await getLoginLock(user.email);
    const lockedMessage = await reserveLoginAttempt(lock);
    if (lockedMessage) {
      return { ok: false, message: lockedMessage };
    }
    if (!(await verifyCurrentPassword(user.email, currentPassword))) {
      return {
        ok: false,
        message: isForcedChange ? "임시 비밀번호가 올바르지 않습니다." : "현재 비밀번호가 올바르지 않습니다."
      };
    }
    // 현재 비밀번호 확인 성공은 로그인 성공과 같게 기록한다(실패 기록 정리 + 신뢰 IP 등록).
    await recordLoginSuccess(lock);
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, message: "비밀번호 변경에 실패했습니다. 재설정 링크를 다시 발급하세요." };
  }
  if (isRecovery && user.email) {
    // 재설정 메일로 본인 확인을 마친 것이므로 이 IP 를 신뢰 IP 로 등록한다. 이메일 전체 잠금에 걸린
    // 처음 쓰는 기기·바뀐 모바일 IP 도 이후 로그인할 수 있게 하기 위해서다('unknown' 은 DB 함수가 제외).
    await recordLoginSuccess(await getLoginLock(user.email));
  }

  if (isForcedChange) {
    let admin: AdminClient;
    try {
      admin = createSupabaseAdminClient();
    } catch {
      return { ok: false, message: "비밀번호는 변경했지만 변경 요구 해제에 실패했습니다. 관리자에게 문의하세요." };
    }
    const { error: flagError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { must_change_password: false }
    });
    if (flagError) {
      console.error("비밀번호 변경 요구 해제 실패", flagError.status);
      return { ok: false, message: "비밀번호는 변경했지만 변경 요구 해제에 실패했습니다. 관리자에게 문의하세요." };
    }
    if (!isRecovery) {
      // 플래그가 남은 기존 토큰을 새 토큰으로 바꿔야 미들웨어가 다시 변경 화면으로 돌려보내지 않는다.
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        await supabase.auth.signOut();
        return { ok: true, message: "비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요." };
      }
      redirect("/");
    }
  }

  await supabase.auth.signOut();
  return { ok: true, message: "비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요." };
}
