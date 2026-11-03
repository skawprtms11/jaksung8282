// 상단 헤더 부서·화주 옵션 조회. /api/header-filters 와 (protected) 레이아웃이 같은 권한 범위로 쓰도록 한곳에 둔다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HeaderFilterOptions } from "@/components/layout/Header";
import { keepLinkedClientIds } from "@/lib/auth/client-scope";
import { isAdmin, type ProfileSummary } from "@/lib/auth/permissions";
import { keepOperatingLinks, loadOperatingClientKeys } from "@/lib/masters/operating-clients";
import type { Database, Json } from "@/types/database";

type AnySupabaseClient = SupabaseClient<Database>;
type ClientLinkRow = { department_id: string; clients: { id: string; client_name: string } | null };
type ClientAssignmentRow = { client_id: string };

export type HeaderFilterOptionsPrefetch = {
  rpc: PromiseLike<{ data: Json | null; error: unknown }>;
  operatingKeys: Promise<Set<string> | null>;
};

function isRecord(value: Json | undefined): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}

function normalizeHeaderFilterOptions(value: Json | null): HeaderFilterOptions | null {
  const source = value ?? undefined;
  if (!isRecord(source)) {
    return null;
  }

  const departmentsValue = source.departments;
  const clientsValue = source.clients;
  const assignedClientIdsValue = source.assignedClientIds;
  if (!Array.isArray(departmentsValue) || !Array.isArray(clientsValue) || !Array.isArray(assignedClientIdsValue)) {
    return null;
  }

  return {
    departments: departmentsValue.filter(isRecord).map((department) => ({
      id: readString(department.id),
      department_name: readString(department.department_name)
    })).filter((department) => department.id && department.department_name),
    clients: clientsValue.filter(isRecord).map((client) => ({
      id: readString(client.id),
      client_name: readString(client.client_name),
      department_id: readString(client.department_id)
    })).filter((client) => client.id && client.client_name && client.department_id),
    assignedClientIds: assignedClientIdsValue.map(readString).filter(Boolean)
  };
}

// 화주 목록은 운영 화주(운영 표 ∩ 활성 연결)만 남기고, 담당자 배정도 그 목록 안의 화주만 남긴다.
function withLinkedAssignments(
  source: HeaderFilterOptions,
  departmentId: string | null,
  operatingKeys: Set<string> | null
): HeaderFilterOptions {
  const options = { ...source, clients: keepOperatingLinks(source.clients, operatingKeys, (client) => client.id) };
  const linkedClientIds = options.clients
    .filter((client) => client.department_id === departmentId)
    .map((client) => client.id);
  return { ...options, assignedClientIds: keepLinkedClientIds(options.assignedClientIds, linkedClientIds) };
}

// 프로필 확인을 기다리지 않고 먼저 시작할 수 있는 조회. 결과는 loadHeaderFilterOptions 가 프로필 확인 뒤에만 쓴다.
// RPC 는 auth.uid() 기준으로 범위를 정하고(비로그인은 오류), 운영 화주 키는 departmentId 가 없으면 RLS(can_access_department) 범위다.
// 다른 부서 키가 섞여도 RPC 화주 목록(이미 부서 범위)을 거르는 데만 쓰여 결과가 달라지지 않는다.
export function prefetchHeaderFilterOptions(supabase: AnySupabaseClient, departmentId?: string | null): HeaderFilterOptionsPrefetch {
  return {
    rpc: Promise.resolve(supabase.rpc("get_header_filter_options")),
    operatingKeys: loadOperatingClientKeys(supabase, departmentId)
  };
}

// 실패하면 null. 호출부는 활성 사용자 확인을 마친 프로필만 넘긴다.
export async function loadHeaderFilterOptions(
  supabase: AnySupabaseClient,
  profile: Pick<ProfileSummary, "id" | "app_role" | "department_id">,
  prefetch: HeaderFilterOptionsPrefetch = prefetchHeaderFilterOptions(
    supabase,
    isAdmin(profile) ? undefined : profile.department_id
  )
): Promise<HeaderFilterOptions | null> {
  const departmentFilter = isAdmin(profile) ? undefined : profile.department_id;
  const [{ data: rpcData, error: rpcError }, operatingKeys] = await Promise.all([prefetch.rpc, prefetch.operatingKeys]);
  const rpcOptions = rpcError ? null : normalizeHeaderFilterOptions(rpcData);
  if (rpcOptions) {
    return withLinkedAssignments(rpcOptions, profile.department_id, operatingKeys);
  }

  const [departmentResult, clientResult, assignmentResult] = await Promise.all([
    (() => {
      let query = supabase
        .from("departments")
        .select("id,department_name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("department_name", { ascending: true });
      if (departmentFilter) {
        query = query.eq("id", departmentFilter);
      }
      return query;
    })(),
    (() => {
      let query = supabase
        .from("department_client_links")
        .select("department_id,clients(id,client_name)")
        .eq("is_active", true)
        .order("department_id", { ascending: true });
      if (departmentFilter) {
        query = query.eq("department_id", departmentFilter);
      }
      return query;
    })(),
    profile.app_role === "client_owner" && profile.department_id
      ? supabase
          .from("client_assignments")
          .select("client_id")
          .eq("user_id", profile.id)
          .eq("department_id", profile.department_id)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as ClientAssignmentRow[], error: null })
  ]);

  if (departmentResult.error || clientResult.error || assignmentResult.error) {
    return null;
  }

  const options: HeaderFilterOptions = {
    departments: (departmentResult.data ?? []) as HeaderFilterOptions["departments"],
    clients: ((clientResult.data ?? []) as unknown as ClientLinkRow[])
      .filter((link) => link.clients)
      .map((link) => ({
        id: link.clients?.id ?? "",
        client_name: link.clients?.client_name ?? "",
        department_id: link.department_id
      }))
      .sort((left, right) => left.client_name.localeCompare(right.client_name, "ko")),
    assignedClientIds: ((assignmentResult.data ?? []) as ClientAssignmentRow[]).map((assignment) => assignment.client_id)
  };

  return withLinkedAssignments(options, profile.department_id, operatingKeys);
}
