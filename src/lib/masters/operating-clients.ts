// 부서별 운영 화주(department_operating_clients)와 담당자 지정 규칙.
// 운영 화주 = 운영 표 활성 행 ∩ 현황관리 활성 연결(department_client_links). 연결이 해제되면 운영 표 행이 남아 있어도 빠진다.
// 서버 페이지·서버 액션·클라이언트 화면·테스트가 함께 쓰므로 server-only 를 붙이지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { canRegisterDepartmentClients, type ProfileSummary } from "@/lib/auth/permissions";
import { selectAllPages } from "@/lib/supabase/paged-select";
import type { Database } from "@/types/database";

export const OPERATING_CLIENT_SAVE_LIMIT = 1000;
export const CLIENT_ASSIGNEE_LIMIT = 100;

export function operatingClientKey(departmentId: string, clientId: string) {
  return `${departmentId}:${clientId}`;
}

export type OperatingClientRow = { department_id: string; client_id: string; is_active?: boolean };

export function toOperatingClientKeys(rows: OperatingClientRow[]) {
  return new Set(
    rows.filter((row) => row.is_active !== false).map((row) => operatingClientKey(row.department_id, row.client_id))
  );
}

// 활성 연결 목록(화주 목록의 원천)에서 운영 화주만 남긴다. 연결 행 모양이 화면마다 달라 화주 ID 꺼내는 함수를 받는다.
// operatingKeys 가 null 이면(운영 표 조회 실패·마이그레이션 미적용) 연결 기준 목록을 그대로 쓴다.
export function keepOperatingLinks<T extends { department_id: string }>(
  links: T[],
  operatingKeys: Set<string> | null,
  getClientId: (link: T) => string | null | undefined
) {
  if (!operatingKeys) {
    return links;
  }
  return links.filter((link) => {
    const clientId = getClientId(link);
    return Boolean(clientId) && operatingKeys.has(operatingClientKey(link.department_id, clientId as string));
  });
}

// 한 부서의 운영 화주 ID: 활성 연결 화주 중 운영 표에 활성으로 있는 것(연결 순서 유지, 중복 제거).
export function resolveOperatingClientIds(linkedClientIds: Iterable<string>, operatingClientIds: Iterable<string>) {
  const operating = new Set(operatingClientIds);
  return [...new Set(linkedClientIds)].filter((clientId) => operating.has(clientId));
}

// 화면이 다룰 부서. 관리자는 요청 부서(없거나 목록 밖이면 기본 부서), 부서장·매니저는 소속 부서로 고정한다.
export function resolveRegistrationDepartmentId(
  profile: Pick<ProfileSummary, "app_role" | "department_id" | "is_active"> | null,
  requestedDepartmentId: string | null | undefined,
  activeDepartmentIds: string[],
  fallbackDepartmentId: string
) {
  if (!profile?.is_active || !canRegisterDepartmentClients(profile)) {
    return "";
  }
  if (profile.app_role === "admin") {
    return requestedDepartmentId && activeDepartmentIds.includes(requestedDepartmentId)
      ? requestedDepartmentId
      : fallbackDepartmentId;
  }
  return profile.department_id && activeDepartmentIds.includes(profile.department_id) ? profile.department_id : "";
}

export type AssigneeSelection =
  | { ok: true; userIds: string[]; primaryUserId: string | null }
  | { ok: false; message: string };

// 담당자 목록 정리: 중복 제거(처음 순서 유지), 대표는 목록 중 하나여야 하고 비우면 첫 사용자.
export function resolveAssigneeSelection(userIds: string[], primaryUserId: string | null | undefined): AssigneeSelection {
  const uniqueUserIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
  if (uniqueUserIds.length > CLIENT_ASSIGNEE_LIMIT) {
    return { ok: false, message: `한 화주에 지정할 수 있는 담당자는 ${CLIENT_ASSIGNEE_LIMIT}명까지입니다.` };
  }
  const primary = primaryUserId?.trim() || "";
  if (primary && !uniqueUserIds.includes(primary)) {
    return { ok: false, message: "대표 담당자는 선택한 담당자 중에서 지정하세요." };
  }
  return { ok: true, userIds: uniqueUserIds, primaryUserId: primary || uniqueUserIds[0] || null };
}

// 체크 해제로 대표가 빠지면 남은 첫 담당자를 대표로 옮긴다(화면 상태용).
export function nextPrimaryUserId(selectedUserIds: string[], currentPrimaryUserId: string) {
  return selectedUserIds.includes(currentPrimaryUserId) ? currentPrimaryUserId : selectedUserIds[0] ?? "";
}

type AnySupabaseClient = SupabaseClient<Database>;

// 운영 표 활성 행을 읽어 키 집합으로 돌려준다. 활성 연결과의 교집합은 호출부가 keepOperatingLinks 로 계산한다.
// departmentId 를 주면 그 부서만, 없으면 호출 클라이언트가 볼 수 있는 전체 부서(1,000건씩 나눠 끝까지 읽는다).
// 조회 실패 시 null: 조회 화면은 연결 기준 목록을 유지하고, 쓰기 경로는 null 이면 처리를 건너뛴다(fail-closed).
export async function loadOperatingClientKeys(client: AnySupabaseClient, departmentId?: string | null) {
  const { data, error } = await selectAllPages<OperatingClientRow>(
    (from, to) => {
      let query = client.from("department_operating_clients").select("department_id,client_id").eq("is_active", true);
      if (departmentId) {
        query = query.eq("department_id", departmentId);
      }
      return query.order("department_id").order("client_id").range(from, to);
    },
    { label: "운영 화주 조회" }
  );
  if (error) {
    console.warn("운영 화주 조회 실패(조회 화면은 연결 기준으로 표시)", error.code);
    return null;
  }
  return toOperatingClientKeys(data);
}

export type ClientRegistrationRow = {
  clientId: string;
  clientCode: string;
  clientName: string;
  isOperating: boolean;
  assigneeIds: string[];
  primaryUserId: string | null;
};

type LinkedClient = { id: string; client_code: string; client_name: string; is_active: boolean };
type AssignmentRow = { client_id: string; user_id: string; is_primary: boolean };

// 부서별화주등록 화면 행: 활성 연결된 사용 중 화주마다 운영 여부와 담당자(대표 먼저)를 붙인다.
// 담당자는 지금 부서 소속 활성 사용자(assignableUserIds)만 보여 준다.
export function buildClientRegistrationRows(
  linkedClients: LinkedClient[],
  operatingClientIds: Set<string>,
  assignments: AssignmentRow[],
  assignableUserIds: Set<string>
): ClientRegistrationRow[] {
  const uniqueClients = [...new Map(linkedClients.filter((client) => client.is_active).map((client) => [client.id, client])).values()];
  return uniqueClients
    .map((client) => {
      const clientAssignments = assignments.filter(
        (assignment) => assignment.client_id === client.id && assignableUserIds.has(assignment.user_id)
      );
      const primary = clientAssignments.find((assignment) => assignment.is_primary)?.user_id ?? null;
      const assigneeIds = [...new Set(clientAssignments.map((assignment) => assignment.user_id))].sort(
        (left, right) => Number(right === primary) - Number(left === primary)
      );
      return {
        clientId: client.id,
        clientCode: client.client_code.trim(),
        clientName: client.client_name.trim(),
        isOperating: operatingClientIds.has(client.id),
        assigneeIds,
        primaryUserId: primary ?? assigneeIds[0] ?? null
      };
    })
    .sort((left, right) => left.clientName.localeCompare(right.clientName, "ko"));
}
