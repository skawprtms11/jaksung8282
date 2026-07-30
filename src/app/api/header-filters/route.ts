import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HeaderFilterOptions } from "@/components/layout/Header";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

type ClientLinkRow = { department_id: string; clients: { id: string; client_name: string } | null };
type ClientAssignmentRow = { client_id: string };

const cacheHeaders = {
  "Cache-Control": "private, max-age=60, stale-while-revalidate=300"
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

export async function GET() {
  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!profile.is_active) {
    return NextResponse.json({ message: "비활성 사용자입니다." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ departments: [], clients: [], assignedClientIds: [] } satisfies HeaderFilterOptions, {
      headers: cacheHeaders
    });
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_header_filter_options");
  const rpcOptions = rpcError ? null : normalizeHeaderFilterOptions(rpcData);
  if (rpcOptions) {
    return NextResponse.json(rpcOptions, { headers: cacheHeaders });
  }

  const departmentFilter = isAdmin(profile) ? undefined : profile.department_id;
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
    return NextResponse.json({ message: "필터 정보를 불러오지 못했습니다." }, { status: 500 });
  }

  const response: HeaderFilterOptions = {
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

  return NextResponse.json(response, { headers: cacheHeaders });
}
