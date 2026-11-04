"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireActiveProfile } from "@/lib/auth/current-user";
import { canManageDepartmentClients } from "@/lib/auth/permissions";
import {
  buildDepartmentNowStaff,
  CLIENT_ASSIGNEE_LIMIT,
  loadDepartmentNowStaff,
  OPERATING_CLIENT_SAVE_LIMIT,
  resolveAssigneeSelection,
  type DepartmentNowStaff
} from "@/lib/masters/operating-clients";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeErrorMessage, type ActionResult } from "@/lib/utils/form";
import { idSchema } from "@/lib/validations/common";

const HEADER_FILTER_CACHE_TAG = "header-filter-options";

const operatingClientsInputSchema = z.object({
  department_id: idSchema,
  client_ids: z.array(idSchema).max(OPERATING_CLIENT_SAVE_LIMIT)
});

const assignmentsInputSchema = z.object({
  department_id: idSchema,
  client_id: idSchema,
  user_ids: z.array(idSchema).max(CLIENT_ASSIGNEE_LIMIT),
  primary_user_id: idSchema.nullable()
});

export type OperatingClientsSaveResult = { clientIds: string[] };
export type ClientAssignmentsSaveResult = { clientId: string; userIds: string[]; primaryUserId: string | null };
export type NowStaffImportResult = { nowStaff: DepartmentNowStaff; replaced: boolean };

type NowStaffImportSummary = {
  base_month: string | null;
  staff_count: number;
  client_count: number;
  row_count: number;
};

// 서버 액션에서도 활성 사용자·역할·부서를 다시 확인하고, RPC 는 사용자 세션으로 호출해 DB 가 auth.uid() 로 최종 판정하게 한다.
async function requireDepartmentClientManager(departmentId: string) {
  const { profile, error } = await requireActiveProfile();
  if (error || !profile) {
    return { error: error ?? "로그인이 필요합니다." };
  }
  if (!canManageDepartmentClients(profile, departmentId)) {
    return { error: "관리자 또는 소속 부서의 부서장·매니저만 처리할 수 있습니다." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase 환경변수를 먼저 설정하세요." };
  }
  return { error: null, supabase };
}

function revalidateClientLists() {
  revalidatePath("/client-registrations");
  revalidateTag(HEADER_FILTER_CACHE_TAG, { expire: 0 });
}

export async function saveDepartmentOperatingClientsAction(input: {
  department_id: string;
  client_ids: string[];
}): Promise<ActionResult<OperatingClientsSaveResult>> {
  const parsed = operatingClientsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "부서 또는 화주 정보를 확인하세요." };
  }
  const clientIds = [...new Set(parsed.data.client_ids)];
  const { error: authError, supabase } = await requireDepartmentClientManager(parsed.data.department_id);
  if (authError || !supabase) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const { error } = await supabase.rpc("save_department_operating_clients", {
    p_department_id: parsed.data.department_id,
    p_client_ids: clientIds
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message, error.code) };
  }

  revalidateClientLists();
  return { ok: true, message: "운영 화주를 저장했습니다.", data: { clientIds } };
}

export async function saveDepartmentClientAssignmentsAction(input: {
  department_id: string;
  client_id: string;
  user_ids: string[];
  primary_user_id: string | null;
}): Promise<ActionResult<ClientAssignmentsSaveResult>> {
  const parsed = assignmentsInputSchema.safeParse({ ...input, primary_user_id: input.primary_user_id || null });
  if (!parsed.success) {
    return { ok: false, message: "담당자 정보를 확인하세요." };
  }
  const selection = resolveAssigneeSelection(parsed.data.user_ids, parsed.data.primary_user_id);
  if (!selection.ok) {
    return { ok: false, message: selection.message };
  }
  const { error: authError, supabase } = await requireDepartmentClientManager(parsed.data.department_id);
  if (authError || !supabase) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const { error } = await supabase.rpc("save_department_client_assignments", {
    p_department_id: parsed.data.department_id,
    p_client_id: parsed.data.client_id,
    p_user_ids: selection.userIds,
    p_primary_user_id: selection.primaryUserId
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message, error.code) };
  }

  revalidateClientLists();
  return {
    ok: true,
    message: "화주 담당자를 저장했습니다.",
    data: { clientId: parsed.data.client_id, userIds: selection.userIds, primaryUserId: selection.primaryUserId }
  };
}

// 현황에서 가져오기: now 인원상세의 최신 비중 월 기준으로 이 부서의 현황 담당자 명단을 통째로 바꾼다.
// 화면 상태를 바로 바꿀 수 있게 가져온 뒤의 명단을 다시 읽어 돌려준다.
export async function importStaffFromNowAction(departmentId: string): Promise<ActionResult<NowStaffImportResult>> {
  const parsed = idSchema.safeParse(departmentId);
  if (!parsed.success) {
    return { ok: false, message: "부서 정보를 확인하세요." };
  }
  const { error: authError, supabase } = await requireDepartmentClientManager(parsed.data);
  if (authError || !supabase) {
    return { ok: false, message: authError ?? "권한이 없습니다." };
  }

  const { data, error } = await supabase.rpc("import_department_client_staff_from_now", {
    p_department_id: parsed.data
  });
  if (error) {
    return { ok: false, message: safeErrorMessage(error.message, error.code) };
  }
  const summary = data as NowStaffImportSummary | null;

  revalidatePath("/client-registrations");
  const { data: staffRows, error: staffError } = await loadDepartmentNowStaff(supabase, parsed.data);
  if (staffError) {
    return { ok: false, message: "현황 담당자를 가져왔지만 명단을 다시 읽지 못했습니다. 화면을 새로고침하세요." };
  }
  const nowStaff = buildDepartmentNowStaff(staffRows);
  if (!summary?.base_month) {
    return {
      ok: true,
      message: "현황관리에 이 부서의 비중 자료가 없어 기존 현황 담당자를 그대로 두었습니다.",
      data: { nowStaff, replaced: false }
    };
  }
  return {
    ok: true,
    message: `현황 기준 ${summary.base_month} · 담당자 ${summary.staff_count}명 · 화주 ${summary.client_count}곳을 가져왔습니다.`,
    data: { nowStaff, replaced: true }
  };
}
