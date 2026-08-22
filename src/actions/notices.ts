"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { parseNoticeContent, serializeNoticeContent, type NoticeCollectionStatus } from "@/lib/notices/content";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { idSchema, noticeCommentSchema, noticeSchema } from "@/lib/validations/common";
import { formDataToObject, safeErrorMessage, type ActionResult } from "@/lib/utils/form";

export type NoticeCommentActionRow = {
  id: string;
  notice_id: string;
  parent_id: string | null;
  content: string;
  author_name: string;
  author_department_name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export async function saveNoticeAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }
  if (!profile.is_active) {
    return { ok: false, message: "비활성 사용자는 게시글을 저장할 수 없습니다." };
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
  if (!id && !isAdmin(profile)) {
    return { ok: false, message: "공지사항 등록은 관리자만 가능합니다." };
  }
  if (id) {
    const { data: target, error: targetError } = await supabase
      .from("notices")
      .select("id,created_by")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (targetError) {
      return { ok: false, message: safeErrorMessage(targetError.message) };
    }
    if (!target) {
      return { ok: false, message: "수정할 게시글을 찾을 수 없습니다." };
    }
    if (!isAdmin(profile) && target.created_by !== profile.id) {
      return { ok: false, message: "본인이 작성한 게시글만 수정할 수 있습니다." };
    }
  }
  let request;
  if (id && !isAdmin(profile)) {
    try {
      request = createSupabaseAdminClient()
        .from("notices")
        .update({ ...payload, updated_by: profile.id })
        .eq("id", id)
        .is("deleted_at", null);
    } catch {
      return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
    }
  } else {
    request = id
      ? supabase.from("notices").update({ ...payload, updated_by: profile.id }).eq("id", id)
      : supabase.from("notices").insert({ ...payload, created_by: profile.id, updated_by: profile.id });
  }
  const { error } = await request;
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  revalidatePath("/notices");
  return { ok: true, message: "공지사항을 저장했습니다." };
}

export async function deleteNoticeAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }
  if (!profile.is_active) {
    return { ok: false, message: "비활성 사용자는 게시글을 삭제할 수 없습니다." };
  }
  const noticeIds = Array.from(new Set(formData.getAll("id").map((value) => String(value)).filter(Boolean)));
  if (noticeIds.length === 0) {
    return { ok: false, message: "삭제할 게시글을 선택하세요." };
  }
  const parsedIds = noticeIds.map((noticeId) => idSchema.safeParse(noticeId));
  if (parsedIds.some((result) => !result.success)) {
    return { ok: false, message: "삭제할 게시글을 확인하세요." };
  }
  const ids = parsedIds.map((result) => (result.success ? result.data : ""));
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { error: rpcError } = await supabase.rpc("soft_delete_notices_atomic", { p_notice_ids: ids });
  if (rpcError) {
    if (!rpcError.message.includes("soft_delete_notices_atomic") && !rpcError.message.includes("schema cache")) {
      return { ok: false, message: safeErrorMessage(rpcError.message) };
    }

    const { data: targets, error: targetError } = await supabase
      .from("notices")
      .select("id,created_by")
      .in("id", ids)
      .is("deleted_at", null);
    if (targetError) {
      return { ok: false, message: safeErrorMessage(targetError.message) };
    }
    if ((targets ?? []).length !== ids.length) {
      return { ok: false, message: "선택한 게시글 중 삭제할 수 없는 게시글이 있습니다." };
    }
    const unauthorizedTarget = (targets ?? []).find((target) => !isAdmin(profile) && target.created_by !== profile.id);
    if (unauthorizedTarget) {
      return { ok: false, message: "본인이 작성한 게시글만 삭제할 수 있습니다." };
    }

    try {
      const adminClient = createSupabaseAdminClient();
      const { error } = await adminClient
        .from("notices")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: profile.id,
          is_active: false,
          updated_by: profile.id
        })
        .in("id", ids)
        .is("deleted_at", null);
      if (error) {
        return { ok: false, message: safeErrorMessage(error.message) };
      }
    } catch {
      return { ok: false, message: "Supabase SQL 028번을 실행하거나 관리자 환경변수를 확인하세요." };
    }
  }
  return { ok: true, message: "게시글을 삭제했습니다." };
}

export async function incrementNoticeView(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return;
  }
  await supabase.rpc("increment_notice_view", { notice_id: id });
}

export async function loadNoticeCommentsAction(noticeId: string): Promise<ActionResult<NoticeCommentActionRow[]>> {
  const parsed = idSchema.safeParse(noticeId);
  if (!parsed.success) {
    return { ok: false, message: "댓글을 불러올 게시글을 확인하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  const { data, error } = await supabase
    .from("notice_comments")
    .select("id,notice_id,parent_id,content,author_name,author_department_name,created_by,created_at,updated_at")
    .eq("notice_id", parsed.data)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  return { ok: true, message: "댓글을 불러왔습니다.", data: (data ?? []) as NoticeCommentActionRow[] };
}

export async function saveNoticeCollectionStatusAction(formData: FormData): Promise<ActionResult<NoticeCollectionStatus>> {
  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }
  if (!profile.is_active) {
    return { ok: false, message: "비활성 사용자는 완료여부를 입력할 수 없습니다." };
  }
  if (!profile.department_id || !profile.department_name) {
    return { ok: false, message: "소속 부서가 지정된 사용자만 완료여부를 입력할 수 있습니다." };
  }

  const noticeId = String(formData.get("notice_id") ?? "");
  const isCompleted = formData.get("is_completed") === "true";
  if (!noticeId) {
    return { ok: false, message: "공지사항을 확인할 수 없습니다." };
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
    confirmer_name: isCompleted ? profile.full_name : "",
    updated_at: isCompleted ? new Date().toISOString() : undefined
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
  return { ok: true, message: "자료취합 완료여부를 저장했습니다.", data: nextRow };
}

export async function saveNoticeCommentAction(formData: FormData): Promise<ActionResult<NoticeCommentActionRow>> {
  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }
  if (!profile.is_active) {
    return { ok: false, message: "비활성 사용자는 댓글을 등록할 수 없습니다." };
  }

  const parsed = noticeCommentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: "댓글 내용을 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { id, notice_id: noticeId, parent_id: parentId, content } = parsed.data;
  const { data: notice } = await supabase
    .from("notices")
    .select("id")
    .eq("id", noticeId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!notice) {
    return { ok: false, message: "댓글을 등록할 게시글을 찾을 수 없습니다." };
  }

  if (parentId) {
    const { data: parentComment } = await supabase
      .from("notice_comments")
      .select("id,notice_id")
      .eq("id", parentId)
      .eq("notice_id", noticeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!parentComment) {
      return { ok: false, message: "답글을 등록할 댓글을 찾을 수 없습니다." };
    }
  }

  if (id) {
    const { data: target } = await supabase
      .from("notice_comments")
      .select("id,created_by")
      .eq("id", id)
      .eq("notice_id", noticeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!target) {
      return { ok: false, message: "수정할 댓글을 찾을 수 없습니다." };
    }
    if (!isAdmin(profile) && target.created_by !== profile.id) {
      return { ok: false, message: "본인이 작성한 댓글만 수정할 수 있습니다." };
    }

    const { data, error } = await supabase
      .from("notice_comments")
      .update({ content })
      .eq("id", id)
      .select("id,notice_id,parent_id,content,author_name,author_department_name,created_by,created_at,updated_at")
      .single();
    if (error) {
      return { ok: false, message: safeErrorMessage(error.message) };
    }
    revalidatePath("/notices");
    return { ok: true, message: "댓글을 수정했습니다.", data: data as NoticeCommentActionRow };
  }

  const { data, error } = await supabase
    .from("notice_comments")
    .insert({
      notice_id: noticeId,
      parent_id: parentId ?? null,
      content,
      author_name: profile.full_name,
      author_department_name: profile.department_name ?? null,
      created_by: profile.id
    })
    .select("id,notice_id,parent_id,content,author_name,author_department_name,created_by,created_at,updated_at")
    .single();
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidatePath("/notices");
  return { ok: true, message: "댓글을 등록했습니다.", data: data as NoticeCommentActionRow };
}

export async function deleteNoticeCommentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  const parsed = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!parsed.success) {
    return { ok: false, message: "삭제할 댓글을 확인하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { data: target } = await supabase
    .from("notice_comments")
    .select("id,created_by")
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!target) {
    return { ok: false, message: "삭제할 댓글을 찾을 수 없습니다." };
  }
  if (!isAdmin(profile) && target.created_by !== profile.id) {
    return { ok: false, message: "본인이 작성한 댓글만 삭제할 수 있습니다." };
  }

  const { error } = await supabase
    .from("notice_comments")
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id })
    .eq("id", parsed.data);
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidatePath("/notices");
  return { ok: true, message: "댓글을 삭제했습니다.", data: { id: parsed.data } };
}
