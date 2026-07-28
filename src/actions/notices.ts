"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { parseNoticeContent, serializeNoticeContent, type NoticeCollectionStatus } from "@/lib/notices/content";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { noticeSchema } from "@/lib/validations/common";
import { formDataToObject, safeErrorMessage, type ActionResult } from "@/lib/utils/form";

export async function saveNoticeAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!isAdmin(profile)) {
    return { ok: false, message: "공지사항 등록·수정은 관리자만 가능합니다." };
  }
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }
  const parsed = noticeSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: "입력값을 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { id, ...payload } = parsed.data;
  const request = id
    ? supabase.from("notices").update({ ...payload, updated_by: profile.id }).eq("id", id)
    : supabase.from("notices").insert({ ...payload, created_by: profile.id, updated_by: profile.id });
  const { error } = await request;
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  revalidatePath("/notices");
  return { ok: true, message: "공지사항을 저장했습니다." };
}

export async function deleteNoticeAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!isAdmin(profile)) {
    return { ok: false, message: "공지사항 삭제는 관리자만 가능합니다." };
  }
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }
  const id = String(formData.get("id") ?? "");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { error } = await supabase
    .from("notices")
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id, is_active: false })
    .eq("id", id);
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  revalidatePath("/notices");
  return { ok: true, message: "공지사항을 삭제했습니다." };
}

export async function incrementNoticeView(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return;
  }
  await supabase.rpc("increment_notice_view", { notice_id: id });
}

export async function saveNoticeCollectionStatusAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }
  if (!profile.department_id || !profile.department_name) {
    return { ok: false, message: "소속 부서가 지정된 사용자만 완료여부를 입력할 수 있습니다." };
  }

  const noticeId = String(formData.get("notice_id") ?? "");
  const isCompleted = formData.get("is_completed") === "true";
  const confirmerName = String(formData.get("confirmer_name") ?? "").trim();
  if (!noticeId) {
    return { ok: false, message: "공지사항을 확인할 수 없습니다." };
  }
  if (isCompleted && !confirmerName) {
    return { ok: false, message: "완료 처리 시 확인자를 입력하세요." };
  }

  const serverClient = await createSupabaseServerClient();
  if (!serverClient) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { data: notice, error: noticeError } = await serverClient
    .from("notices")
    .select("id,notice_type,content")
    .eq("id", noticeId)
    .eq("notice_type", "urgent")
    .is("deleted_at", null)
    .maybeSingle();

  if (noticeError || !notice) {
    return { ok: false, message: "자료취합 공지사항을 찾을 수 없습니다." };
  }

  const parsedContent = parseNoticeContent(String(notice.content ?? ""));
  const nextStatuses = parsedContent.collectionStatuses.filter((row) => row.department_id !== profile.department_id);
  const nextRow: NoticeCollectionStatus = {
    department_id: profile.department_id,
    department_name: profile.department_name,
    is_completed: isCompleted,
    confirmer_name: isCompleted ? confirmerName : "",
    updated_at: new Date().toISOString()
  };
  nextStatuses.push(nextRow);

  try {
    const adminClient = createSupabaseAdminClient();
    const { error } = await adminClient
      .from("notices")
      .update({
        content: serializeNoticeContent({ ...parsedContent, collectionStatuses: nextStatuses }),
        updated_by: profile.id
      })
      .eq("id", noticeId)
      .eq("notice_type", "urgent");

    if (error) {
      return { ok: false, message: safeErrorMessage(error.message) };
    }
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }

  revalidatePath("/notices");
  return { ok: true, message: "자료취합 완료여부를 저장했습니다." };
}
