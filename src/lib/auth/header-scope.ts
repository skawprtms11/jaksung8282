import type { AppRole } from "@/types/enums";

// 상단 헤더의 부서·화주 조건. 빈 문자열은 "전체"를 뜻한다.
export type HeaderScope = { departmentId: string; clientId: string };

// full: 부서·화주 모두 적용, department: 부서만 적용, none: 조건 미적용(관리·미니게임 등)
export type HeaderScopeMode = "full" | "department" | "none";

export const emptyHeaderScope: HeaderScope = { departmentId: "", clientId: "" };

const fullScopeRoutes = ["/client-reports", "/department-reports", "/meeting-materials", "/mobile"];
const departmentScopeRoutes = ["/notices", "/data-collections"];

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function getHeaderScopeMode(pathname: string): HeaderScopeMode {
  if (fullScopeRoutes.some((route) => matchesRoute(pathname, route))) {
    return "full";
  }
  if (departmentScopeRoutes.some((route) => matchesRoute(pathname, route))) {
    return "department";
  }
  return "none";
}

// 저장 조건 복원(router.replace) 대상 화면. 공지 상세는 조건이 조회에 영향이 없어 다시 그리지 않는다.
export function shouldRestoreHeaderScope(pathname: string) {
  return getHeaderScopeMode(pathname) !== "none" && !pathname.startsWith("/notices/");
}

export function isHeaderScopeEmpty(scope: HeaderScope) {
  return !scope.departmentId && !scope.clientId;
}

// URL 에 조건이 하나도 없을 때만 저장된 조건으로 복원한다. URL 값이 있으면 URL 이 우선이다.
export function resolveScopeRestore({
  urlScope,
  storedScope
}: {
  urlScope: HeaderScope;
  storedScope: HeaderScope;
}): HeaderScope | null {
  if (!isHeaderScopeEmpty(urlScope) || isHeaderScopeEmpty(storedScope)) {
    return null;
  }
  return storedScope;
}

// 헤더에 보여줄 부서. 일반 사용자는 소속 부서(옵션에 하나만 내려옴)로 고정하고,
// 관리자는 선택값을 쓰되 부서 선택이 필수인 화면에서만 기본 부서로 채운다.
export function resolveEffectiveDepartmentId({
  role,
  selectedDepartmentId,
  preferredDepartmentId,
  departmentIds,
  requiresDepartment
}: {
  role: AppRole | null;
  selectedDepartmentId: string;
  preferredDepartmentId: string;
  departmentIds: string[];
  requiresDepartment: boolean;
}) {
  if (role !== "admin") {
    if (selectedDepartmentId && departmentIds.includes(selectedDepartmentId)) {
      return selectedDepartmentId;
    }
    return preferredDepartmentId;
  }
  return selectedDepartmentId || (requiresDepartment ? preferredDepartmentId : "");
}

// 저장할 조건. 헤더 옵션에 없는 부서·화주(타 부서, 비활성, 임의 URL 값)는 다음 화면으로 넘기지 않는다.
// 화주담당자는 배정 화주만 이어간다(화주자료 화면이 배정 화주만 허용하므로).
export function toPersistedHeaderScope({
  role,
  scope,
  departmentIds,
  clients,
  assignedClientIds
}: {
  role: AppRole | null;
  scope: HeaderScope;
  departmentIds: string[];
  clients: { id: string; department_id: string }[];
  assignedClientIds: string[];
}): HeaderScope {
  const departmentId = departmentIds.includes(scope.departmentId) ? scope.departmentId : "";
  const isClientVisible = clients.some(
    (client) => client.id === scope.clientId && (!departmentId || client.department_id === departmentId)
  );
  const isClientAllowed = role !== "client_owner" || assignedClientIds.includes(scope.clientId);
  return { departmentId, clientId: scope.clientId && isClientVisible && isClientAllowed ? scope.clientId : "" };
}

// 사이드바 등 화면 이동 링크에 현재 조건을 붙인다. 조건 미적용 화면 링크는 그대로 둔다.
export function buildScopedHref(href: string, scope: HeaderScope) {
  const [pathname, query = ""] = href.split("?");
  if (getHeaderScopeMode(pathname) === "none" || isHeaderScopeEmpty(scope)) {
    return href;
  }
  const params = new URLSearchParams(query);
  if (scope.departmentId) {
    params.set("department_id", scope.departmentId);
  }
  if (scope.clientId) {
    params.set("client_id", scope.clientId);
  }
  return `${pathname}?${params.toString()}`;
}

export type ServerDepartmentScope =
  | { kind: "all" }
  | { kind: "department"; departmentId: string }
  | { kind: "blocked" };

// 서버 조회 범위. 조건은 범위를 좁히는 용도로만 쓰며, 관리자가 아니면 URL 값과 무관하게 소속 부서로 강제한다.
export function resolveServerDepartmentScope(
  profile: { app_role: AppRole | null; department_id: string | null },
  requestedDepartmentId?: string | null
): ServerDepartmentScope {
  if (profile.app_role === "admin") {
    return requestedDepartmentId ? { kind: "department", departmentId: requestedDepartmentId } : { kind: "all" };
  }
  if (!profile.department_id) {
    return { kind: "blocked" };
  }
  return { kind: "department", departmentId: profile.department_id };
}
