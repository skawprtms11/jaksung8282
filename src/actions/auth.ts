"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeAuthRedirect } from "@/lib/auth/redirect";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validations/common";
import type { ActionResult } from "@/lib/utils/form";

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
    employee_no: z.string().trim().min(1, "사번을 입력하세요.").max(50),
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

  const { data: department } = await admin
    .from("departments")
    .select("id")
    .eq("id", parsed.data.department_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!department) {
    return { ok: false, message: "소속 부서를 확인하세요." };
  }

  const [{ data: existingProfile }, { data: existingRequest }] = await Promise.all([
    admin
      .from("profiles")
      .select("id,is_active")
      .or(`email.eq.${parsed.data.email},employee_no.eq.${parsed.data.employee_no}`)
      .maybeSingle(),
    admin
      .from("user_registration_requests")
      .select("id,status")
      .or(`email.eq.${parsed.data.email},employee_no.eq.${parsed.data.employee_no}`)
      .maybeSingle()
  ]);
  if (existingProfile?.is_active) {
    return { ok: false, message: "이미 사용 중인 이메일 또는 사번입니다." };
  }
  if (existingRequest?.status === "pending") {
    return { ok: false, message: "이미 승인 대기 중인 가입 요청이 있습니다." };
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
    return { ok: false, message: "가입 요청 계정 생성에 실패했습니다. 이메일이 이미 등록되어 있는지 확인하세요." };
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

  return { ok: true, message: "사용자 등록 요청이 접수되었습니다. 관리자 또는 부서 승인 후 로그인할 수 있습니다." };
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
