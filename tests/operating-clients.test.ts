import { describe, expect, it, vi } from "vitest";
import { getHeaderScopeMode } from "@/lib/auth/header-scope";
import { selectAllPages } from "@/lib/supabase/paged-select";
import { canManageDepartmentClients, canRegisterDepartmentClients } from "@/lib/auth/permissions";
import {
  buildClientRegistrationRows,
  keepOperatingLinks,
  nextPrimaryUserId,
  operatingClientKey,
  resolveAssigneeSelection,
  resolveOperatingClientIds,
  resolveRegistrationDepartmentId,
  toOperatingClientKeys
} from "@/lib/masters/operating-clients";

const profile = (app_role: "admin" | "department_head" | "manager" | "client_owner" | null, department_id = "dept-a", is_active = true) => ({
  app_role,
  department_id,
  is_active
});

describe("부서별화주등록 권한", () => {
  it("메뉴는 관리자·부서장·매니저에게만 열린다", () => {
    expect(canRegisterDepartmentClients({ app_role: "admin" })).toBe(true);
    expect(canRegisterDepartmentClients({ app_role: "department_head" })).toBe(true);
    expect(canRegisterDepartmentClients({ app_role: "manager" })).toBe(true);
    expect(canRegisterDepartmentClients({ app_role: "client_owner" })).toBe(false);
    expect(canRegisterDepartmentClients({ app_role: null })).toBe(false);
  });

  it("관리자는 모든 부서, 부서장·매니저는 소속 부서만 저장할 수 있다", () => {
    expect(canManageDepartmentClients(profile("admin", "dept-z"), "dept-a")).toBe(true);
    expect(canManageDepartmentClients(profile("department_head"), "dept-a")).toBe(true);
    expect(canManageDepartmentClients(profile("manager"), "dept-a")).toBe(true);
    expect(canManageDepartmentClients(profile("department_head"), "dept-b")).toBe(false);
    expect(canManageDepartmentClients(profile("manager"), "dept-b")).toBe(false);
  });

  it("화주담당자·역할 미지정·비활성·부서 없음은 거부한다", () => {
    expect(canManageDepartmentClients(profile("client_owner"), "dept-a")).toBe(false);
    expect(canManageDepartmentClients(profile(null), "dept-a")).toBe(false);
    expect(canManageDepartmentClients(profile("admin", "dept-a", false), "dept-a")).toBe(false);
    expect(canManageDepartmentClients(profile("admin"), "")).toBe(false);
    expect(canManageDepartmentClients(null, "dept-a")).toBe(false);
  });

  it("화면 부서: 관리자는 요청 부서(없으면 기본), 부서장·매니저는 소속 부서로 고정", () => {
    const ids = ["dept-a", "dept-b"];
    expect(resolveRegistrationDepartmentId(profile("admin"), "dept-b", ids, "dept-a")).toBe("dept-b");
    expect(resolveRegistrationDepartmentId(profile("admin"), "dept-x", ids, "dept-a")).toBe("dept-a");
    expect(resolveRegistrationDepartmentId(profile("admin"), undefined, ids, "dept-a")).toBe("dept-a");
    expect(resolveRegistrationDepartmentId(profile("manager"), "dept-b", ids, "dept-b")).toBe("dept-a");
    expect(resolveRegistrationDepartmentId(profile("department_head", "dept-c"), "dept-a", ids, "dept-a")).toBe("");
    expect(resolveRegistrationDepartmentId(profile("client_owner"), "dept-a", ids, "dept-a")).toBe("");
  });

  it("헤더는 부서 조건만 적용한다", () => {
    expect(getHeaderScopeMode("/client-registrations")).toBe("department");
  });
});

describe("운영 화주 = 운영 표 ∩ 활성 연결", () => {
  const operatingKeys = toOperatingClientKeys([
    { department_id: "dept-a", client_id: "c1" },
    { department_id: "dept-a", client_id: "c2", is_active: false },
    { department_id: "dept-b", client_id: "c3" },
    { department_id: "dept-a", client_id: "c9" }
  ]);

  it("비활성 운영 행은 키에서 빠진다", () => {
    expect(operatingKeys.has(operatingClientKey("dept-a", "c1"))).toBe(true);
    expect(operatingKeys.has(operatingClientKey("dept-a", "c2"))).toBe(false);
  });

  it("활성 연결 중 같은 부서의 운영 행이 있는 것만 남긴다", () => {
    const links = [
      { department_id: "dept-a", client_id: "c1" },
      { department_id: "dept-a", client_id: "c2" },
      { department_id: "dept-a", client_id: "c3" },
      { department_id: "dept-b", client_id: "c3" }
    ];
    expect(keepOperatingLinks(links, operatingKeys, (link) => link.client_id)).toEqual([
      { department_id: "dept-a", client_id: "c1" },
      { department_id: "dept-b", client_id: "c3" }
    ]);
  });

  it("연결이 해제된 화주(c9)는 운영 행이 있어도 목록에 없다", () => {
    const links = [{ department_id: "dept-a", client_id: "c1" }];
    expect(keepOperatingLinks(links, operatingKeys, (link) => link.client_id).map((link) => link.client_id)).toEqual(["c1"]);
    expect(resolveOperatingClientIds(["c1", "c1", "c2"], ["c1", "c9"])).toEqual(["c1"]);
  });

  it("화주 ID 가 없는 연결 행은 버리고, 운영 표를 못 읽으면(null) 연결 기준을 유지한다", () => {
    const links = [
      { department_id: "dept-a", clients: null as { id: string } | null },
      { department_id: "dept-a", clients: { id: "c1" } }
    ];
    expect(keepOperatingLinks(links, operatingKeys, (link) => link.clients?.id)).toEqual([links[1]]);
    expect(keepOperatingLinks(links, null, (link) => link.clients?.id)).toEqual(links);
  });
});

describe("담당자 대표 선택 규칙", () => {
  it("대표를 비우면 첫 담당자가 대표", () => {
    expect(resolveAssigneeSelection(["u2", "u1"], null)).toEqual({ ok: true, userIds: ["u2", "u1"], primaryUserId: "u2" });
  });

  it("중복은 처음 순서를 지켜 제거한다", () => {
    expect(resolveAssigneeSelection(["u1", "u2", "u1", " "], "u2")).toEqual({
      ok: true,
      userIds: ["u1", "u2"],
      primaryUserId: "u2"
    });
  });

  it("대표는 선택한 담당자 중 하나여야 한다", () => {
    expect(resolveAssigneeSelection(["u1"], "u9").ok).toBe(false);
    expect(resolveAssigneeSelection([], "u1").ok).toBe(false);
  });

  it("빈 목록은 담당자 전체 해제", () => {
    expect(resolveAssigneeSelection([], "")).toEqual({ ok: true, userIds: [], primaryUserId: null });
  });

  it("인원 상한(100명)을 넘으면 거부", () => {
    const many = Array.from({ length: 101 }, (_, index) => `u${index}`);
    expect(resolveAssigneeSelection(many, null).ok).toBe(false);
  });

  it("체크 해제로 대표가 빠지면 남은 첫 담당자로 옮긴다", () => {
    expect(nextPrimaryUserId(["u1", "u2"], "u2")).toBe("u2");
    expect(nextPrimaryUserId(["u1"], "u2")).toBe("u1");
    expect(nextPrimaryUserId([], "u2")).toBe("");
  });
});

describe("buildClientRegistrationRows", () => {
  it("사용 중 연결 화주마다 운영 여부와 담당자(대표 먼저, 소속 활성 사용자만)를 붙인다", () => {
    const rows = buildClientRegistrationRows(
      [
        { id: "c2", client_code: " B ", client_name: "나화주", is_active: true },
        { id: "c1", client_code: "A", client_name: "가화주", is_active: true },
        { id: "c3", client_code: "C", client_name: "다화주", is_active: false }
      ],
      new Set(["c1"]),
      [
        { client_id: "c1", user_id: "u1", is_primary: false },
        { client_id: "c1", user_id: "u2", is_primary: true },
        { client_id: "c1", user_id: "u-moved", is_primary: false }
      ],
      new Set(["u1", "u2"])
    );
    expect(rows).toEqual([
      { clientId: "c1", clientCode: "A", clientName: "가화주", isOperating: true, assigneeIds: ["u2", "u1"], primaryUserId: "u2" },
      { clientId: "c2", clientCode: "B", clientName: "나화주", isOperating: false, assigneeIds: [], primaryUserId: null }
    ]);
  });
});

describe("selectAllPages", () => {
  const source = Array.from({ length: 25 }, (_, index) => index);
  const fetchPage = (from: number, to: number) => Promise.resolve({ data: source.slice(from, to + 1), error: null });

  it("페이지 크기로 나눠 끝까지 읽는다", async () => {
    const result = await selectAllPages(fetchPage, { label: "시험", pageSize: 10 });
    expect(result.data).toEqual(source);
    expect(result.error).toBeNull();
  });

  it("상한에 도달하면 멈추고 경고한다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await selectAllPages(fetchPage, { label: "시험", pageSize: 10, maxRows: 20 });
    expect(result.data).toHaveLength(20);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("오류가 나면 오류를 돌려준다", async () => {
    const result = await selectAllPages(() => Promise.resolve({ data: null, error: { code: "X", message: "실패" } }), { label: "시험" });
    expect(result.error?.code).toBe("X");
  });
});
