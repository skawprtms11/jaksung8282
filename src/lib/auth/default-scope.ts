import type { AppRole } from "@/types/enums";

const ADMIN_DEFAULT_SCOPE_NAME = "tpl전략팀";

type DepartmentLike = {
  id: string;
  department_name: string;
};

type ClientLike = {
  id: string;
  client_name: string;
};

function normalizeScopeName(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function isPreferredAdminScopeName(value: string) {
  return normalizeScopeName(value) === ADMIN_DEFAULT_SCOPE_NAME;
}

export function pickDefaultDepartmentId(departments: DepartmentLike[], role: AppRole) {
  if (departments.length === 0) {
    return "";
  }

  if (role === "admin") {
    return departments.find((department) => isPreferredAdminScopeName(department.department_name))?.id ?? departments[0]?.id ?? "";
  }

  return departments[0]?.id ?? "";
}

export function pickDefaultClientId(clients: ClientLike[], role: AppRole) {
  if (clients.length === 0) {
    return "";
  }

  if (role === "admin") {
    return clients.find((client) => isPreferredAdminScopeName(client.client_name))?.id ?? clients[0]?.id ?? "";
  }

  return clients[0]?.id ?? "";
}
