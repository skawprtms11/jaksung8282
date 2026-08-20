"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeErrorMessage, type ActionResult } from "@/lib/utils/form";
import type { Json } from "@/types/database";

const MAX_TEMPLATE_COLUMNS = 30;
const MAX_ENTRY_ROWS = 300;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type CollectionTemplate = {
  columns: string[];
};

const columnsSchema = z.array(z.string().trim().max(60)).max(MAX_TEMPLATE_COLUMNS);

const dataCollectionSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  title: z.string().trim().min(1, "제목을 입력하세요.").max(200, "제목은 200자 이하로 입력하세요."),
  description: z.string().trim().max(5000).default(""),
  example: z.string().trim().max(5000).default(""),
  image_url: z.string().trim().max(1000).default(""),
  columns: columnsSchema,
  widths: z.array(z.coerce.number().int().min(0).max(2000)).optional(),
  collection_type: z.enum(["regular", "adhoc"]).default("adhoc"),
  entry_mode: z.enum(["grid", "link"]).default("grid"),
  link_url: z.string().trim().max(1000).default("")
}).superRefine((value, ctx) => {
  if (value.entry_mode === "grid") {
    if (value.columns.length === 0 || value.columns.every((column) => !column.trim())) {
      ctx.addIssue({ code: "custom", path: ["columns"], message: "취합 컬럼을 1개 이상 설정하세요." });
    }
  } else if (!/^https?:\/\//.test(value.link_url)) {
    ctx.addIssue({ code: "custom", path: ["link_url"], message: "http:// 또는 https:// 로 시작하는 링크를 입력하세요." });
  }
});

function parseJsonForm(formData: FormData, field: string) {
  try {
    return JSON.parse(String(formData.get(field) ?? "null"));
  } catch {
    return null;
  }
}

export async function saveDataCollectionAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "로그인이 필요하거나 비활성 사용자입니다." };
  }
  if (!isAdmin(profile)) {
    return { ok: false, message: "자료취합 등록은 관리자만 가능합니다." };
  }
  const parsed = dataCollectionSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    example: String(formData.get("example") ?? ""),
    image_url: String(formData.get("image_url") ?? ""),
    columns: parseJsonForm(formData, "columns"),
    widths: parseJsonForm(formData, "widths") ?? undefined,
    collection_type: String(formData.get("collection_type") ?? "adhoc"),
    entry_mode: String(formData.get("entry_mode") ?? "grid"),
    link_url: String(formData.get("link_url") ?? "")
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { id, title, description, example, image_url, columns } = parsed.data;
  const widths = Array.from({ length: columns.length }, (_, index) => parsed.data.widths?.[index] ?? 0);
  const payload = {
    title,
    description,
    example,
    collection_type: parsed.data.collection_type,
    entry_mode: parsed.data.entry_mode,
    link_url: parsed.data.entry_mode === "link" ? parsed.data.link_url : null,
    image_url: image_url || null,
    template: { columns, widths } as unknown as Json,
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };
  const request = id
    ? supabase.from("data_collections").update(payload).eq("id", id).is("deleted_at", null)
    : supabase.from("data_collections").insert({ ...payload, created_by: profile.id });
  const { error } = await request;
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidatePath("/data-collections");
  revalidatePath("/department-reports");
  return { ok: true, message: id ? "자료취합을 수정했습니다." : "자료취합을 등록했습니다." };
}

export async function uploadCollectionImageAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active || !isAdmin(profile)) {
    return { ok: false, message: "사진 업로드는 관리자만 가능합니다." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "업로드할 사진을 선택하세요." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "이미지 파일만 업로드할 수 있습니다." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "사진은 5MB 이하로 업로드하세요." };
  }

  let adminClient;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { ok: false, message: "Supabase 관리자 환경변수를 확인하세요." };
  }
  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `guides/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  const { error } = await adminClient.storage.from("data-collections").upload(path, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  const { data } = adminClient.storage.from("data-collections").getPublicUrl(path);
  return { ok: true, message: "사진을 업로드했습니다.", data: { url: data.publicUrl } };
}

export async function closeDataCollectionAction(formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active || !isAdmin(profile)) {
    return { ok: false, message: "자료취합 종결은 관리자만 가능합니다." };
  }
  const collectionId = String(formData.get("id") ?? "");
  if (!collectionId) {
    return { ok: false, message: "종결할 취합건을 찾을 수 없습니다." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { error } = await supabase
    .from("data_collections")
    .update({ closed_at: new Date().toISOString(), closed_by: profile.id, updated_by: profile.id })
    .eq("id", collectionId)
    .is("deleted_at", null)
    .is("closed_at", null);
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  revalidatePath("/data-collections");
  revalidatePath("/department-reports");
  return { ok: true, message: "취합건을 종결했습니다." };
}

export async function deleteDataCollectionAction(formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active || !isAdmin(profile)) {
    return { ok: false, message: "자료취합 삭제는 관리자만 가능합니다." };
  }
  const collectionId = String(formData.get("id") ?? "");
  if (!collectionId) {
    return { ok: false, message: "삭제할 취합건을 찾을 수 없습니다." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }
  const { error } = await supabase
    .from("data_collections")
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id })
    .eq("id", collectionId)
    .is("deleted_at", null);
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }
  revalidatePath("/data-collections");
  revalidatePath("/department-reports");
  return { ok: true, message: "자료취합을 삭제했습니다." };
}

const collectionEntrySchema = z.object({
  collection_id: z.string().uuid(),
  department_id: z.string().uuid(),
  rows: z.array(z.array(z.string().max(1000))).max(MAX_ENTRY_ROWS),
  is_completed: z.boolean()
});

export async function saveCollectionEntryAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return { ok: false, message: "로그인이 필요하거나 비활성 사용자입니다." };
  }
  const parsed = collectionEntrySchema.safeParse({
    collection_id: String(formData.get("collection_id") ?? ""),
    department_id: String(formData.get("department_id") ?? ""),
    rows: parseJsonForm(formData, "rows") ?? [],
    is_completed: String(formData.get("is_completed") ?? "") === "true"
  });
  if (!parsed.success) {
    return { ok: false, message: "입력값을 확인하세요." };
  }
  if (!isAdmin(profile) && profile.department_id !== parsed.data.department_id) {
    return { ok: false, message: "소속 부서의 취합 내용만 작성할 수 있습니다." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { data: collection, error: collectionError } = await supabase
    .from("data_collections")
    .select("id,template,closed_at,entry_mode")
    .eq("id", parsed.data.collection_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (collectionError) {
    return { ok: false, message: safeErrorMessage(collectionError.message) };
  }
  if (!collection) {
    return { ok: false, message: "취합건을 찾을 수 없습니다." };
  }
  if (collection.closed_at) {
    return { ok: false, message: "종결된 취합건은 작성할 수 없습니다." };
  }
  const template = collection.template as { columns?: unknown };
  const columnCount = Array.isArray(template?.columns) ? template.columns.length : 0;
  // 빈 행은 버리고, 컬럼 수에 맞춰 칸을 정규화한다.
  const rows = parsed.data.rows
    .map((row) => Array.from({ length: columnCount }, (_, index) => String(row[index] ?? "")))
    .filter((row) => row.some((cell) => cell.trim()));

  const { error } = await supabase.from("data_collection_entries").upsert(
    {
      collection_id: parsed.data.collection_id,
      department_id: parsed.data.department_id,
      rows: rows as unknown as Json,
      is_completed: parsed.data.is_completed,
      created_by: profile.id,
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    },
    { onConflict: "collection_id,department_id" }
  );
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidatePath("/data-collections");
  revalidatePath("/department-reports");
  return {
    ok: true,
    message: parsed.data.is_completed ? "취합 내용을 저장하고 확정했습니다." : "취합 내용을 저장했습니다. (상태: 검토중)"
  };
}
