import { describe, expect, it } from "vitest";
import {
  buildScopedHref,
  getHeaderScopeMode,
  resolveEffectiveDepartmentId,
  resolveScopeRestore,
  resolveServerDepartmentScope,
  shouldRestoreHeaderScope,
  toPersistedHeaderScope
} from "@/lib/auth/header-scope";

describe("getHeaderScopeMode", () => {
  it("applies department and client conditions to report screens", () => {
    expect(getHeaderScopeMode("/client-reports")).toBe("full");
    expect(getHeaderScopeMode("/department-reports")).toBe("full");
    expect(getHeaderScopeMode("/meeting-materials")).toBe("full");
    expect(getHeaderScopeMode("/mobile")).toBe("full");
  });

  it("applies only the department condition to notices and data collections", () => {
    expect(getHeaderScopeMode("/notices")).toBe("department");
    expect(getHeaderScopeMode("/notices/notice-1")).toBe("department");
    expect(getHeaderScopeMode("/data-collections")).toBe("department");
  });

  it("does not apply conditions to admin and mini game screens", () => {
    expect(getHeaderScopeMode("/admin/users")).toBe("none");
    expect(getHeaderScopeMode("/admin/departments")).toBe("none");
    expect(getHeaderScopeMode("/mini-game")).toBe("none");
    expect(getHeaderScopeMode("/noticesx")).toBe("none");
  });
});

describe("shouldRestoreHeaderScope", () => {
  it("restores on list screens but not on the notice detail or unscoped screens", () => {
    expect(shouldRestoreHeaderScope("/notices")).toBe(true);
    expect(shouldRestoreHeaderScope("/meeting-materials")).toBe(true);
    expect(shouldRestoreHeaderScope("/notices/notice-1")).toBe(false);
    expect(shouldRestoreHeaderScope("/admin/users")).toBe(false);
  });
});

describe("resolveScopeRestore", () => {
  const stored = { departmentId: "dept-a", clientId: "client-a" };

  it("restores the stored scope when the URL has no condition", () => {
    expect(resolveScopeRestore({ urlScope: { departmentId: "", clientId: "" }, storedScope: stored })).toEqual(stored);
  });

  it("keeps the URL scope when the URL has any condition", () => {
    expect(resolveScopeRestore({ urlScope: { departmentId: "dept-b", clientId: "" }, storedScope: stored })).toBeNull();
    expect(resolveScopeRestore({ urlScope: { departmentId: "", clientId: "client-b" }, storedScope: stored })).toBeNull();
  });

  it("does nothing when nothing is stored", () => {
    expect(
      resolveScopeRestore({ urlScope: { departmentId: "", clientId: "" }, storedScope: { departmentId: "", clientId: "" } })
    ).toBeNull();
  });
});

describe("resolveEffectiveDepartmentId", () => {
  const base = { preferredDepartmentId: "dept-default", departmentIds: ["dept-default", "dept-b"] };

  it("lets admins keep all departments unless a department is required", () => {
    expect(resolveEffectiveDepartmentId({ ...base, role: "admin", selectedDepartmentId: "", requiresDepartment: false })).toBe("");
    expect(resolveEffectiveDepartmentId({ ...base, role: "admin", selectedDepartmentId: "", requiresDepartment: true })).toBe("dept-default");
    expect(resolveEffectiveDepartmentId({ ...base, role: "admin", selectedDepartmentId: "dept-b", requiresDepartment: true })).toBe("dept-b");
  });

  it("pins non-admins to their own department", () => {
    const own = { preferredDepartmentId: "dept-own", departmentIds: ["dept-own"] };
    expect(resolveEffectiveDepartmentId({ ...own, role: "manager", selectedDepartmentId: "", requiresDepartment: false })).toBe("dept-own");
    expect(resolveEffectiveDepartmentId({ ...own, role: "department_head", selectedDepartmentId: "dept-other", requiresDepartment: false })).toBe("dept-own");
    expect(resolveEffectiveDepartmentId({ ...own, role: "client_owner", selectedDepartmentId: "dept-own", requiresDepartment: true })).toBe("dept-own");
  });
});

describe("toPersistedHeaderScope", () => {
  const options = {
    departmentIds: ["dept-a", "dept-b"],
    clients: [
      { id: "client-a", department_id: "dept-a" },
      { id: "client-b", department_id: "dept-b" }
    ],
    assignedClientIds: ["client-a"]
  };

  it("keeps a valid department and client", () => {
    expect(toPersistedHeaderScope({ ...options, role: "admin", scope: { departmentId: "dept-a", clientId: "client-a" } })).toEqual({
      departmentId: "dept-a",
      clientId: "client-a"
    });
  });

  it("drops departments and clients that are not in the header options", () => {
    expect(toPersistedHeaderScope({ ...options, role: "manager", scope: { departmentId: "dept-x", clientId: "client-x" } })).toEqual({
      departmentId: "",
      clientId: ""
    });
    expect(toPersistedHeaderScope({ ...options, role: "admin", scope: { departmentId: "dept-a", clientId: "client-b" } })).toEqual({
      departmentId: "dept-a",
      clientId: ""
    });
  });

  it("keeps a client of any department when all departments are selected", () => {
    expect(toPersistedHeaderScope({ ...options, role: "admin", scope: { departmentId: "", clientId: "client-b" } })).toEqual({
      departmentId: "",
      clientId: "client-b"
    });
  });

  it("carries only assigned clients for client owners", () => {
    expect(toPersistedHeaderScope({ ...options, role: "client_owner", scope: { departmentId: "dept-b", clientId: "client-b" } })).toEqual({
      departmentId: "dept-b",
      clientId: ""
    });
    expect(toPersistedHeaderScope({ ...options, role: "client_owner", scope: { departmentId: "dept-a", clientId: "client-a" } })).toEqual({
      departmentId: "dept-a",
      clientId: "client-a"
    });
  });
});

describe("buildScopedHref", () => {
  const scope = { departmentId: "dept-a", clientId: "client-a" };

  it("adds the scope to screens that apply header conditions", () => {
    expect(buildScopedHref("/meeting-materials", scope)).toBe("/meeting-materials?department_id=dept-a&client_id=client-a");
    expect(buildScopedHref("/notices", { departmentId: "dept-a", clientId: "" })).toBe("/notices?department_id=dept-a");
    expect(buildScopedHref("/meeting-materials?tab=materials", scope)).toBe(
      "/meeting-materials?tab=materials&department_id=dept-a&client_id=client-a"
    );
  });

  it("leaves admin, mini game and empty scopes untouched", () => {
    expect(buildScopedHref("/admin/users", scope)).toBe("/admin/users");
    expect(buildScopedHref("/mini-game", scope)).toBe("/mini-game");
    expect(buildScopedHref("/notices", { departmentId: "", clientId: "" })).toBe("/notices");
  });
});

describe("resolveServerDepartmentScope", () => {
  it("lets admins narrow to the requested department or see all", () => {
    const admin = { app_role: "admin" as const, department_id: "dept-own" };
    expect(resolveServerDepartmentScope(admin, "dept-b")).toEqual({ kind: "department", departmentId: "dept-b" });
    expect(resolveServerDepartmentScope(admin, undefined)).toEqual({ kind: "all" });
    expect(resolveServerDepartmentScope(admin, "")).toEqual({ kind: "all" });
  });

  it("forces non-admins to their own department regardless of the URL", () => {
    const manager = { app_role: "manager" as const, department_id: "dept-own" };
    expect(resolveServerDepartmentScope(manager, "dept-other")).toEqual({ kind: "department", departmentId: "dept-own" });
    expect(resolveServerDepartmentScope(manager, undefined)).toEqual({ kind: "department", departmentId: "dept-own" });
  });

  it("blocks non-admins without a department", () => {
    expect(resolveServerDepartmentScope({ app_role: "department_head", department_id: null }, "dept-a")).toEqual({ kind: "blocked" });
    expect(resolveServerDepartmentScope({ app_role: null, department_id: "dept-a" }, "dept-b")).toEqual({
      kind: "department",
      departmentId: "dept-a"
    });
  });
});
