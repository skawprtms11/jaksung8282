import { describe, expect, it } from "vitest";
import {
  clientSchema,
  departmentSchema,
  employeeNoSchema,
  reportItemRequestResultSchema,
  reportItemRequestSchema,
  userSchema
} from "@/lib/validations/common";

describe("master validation schemas", () => {
  it("allows client creation without id and department_id", () => {
    const parsed = clientSchema.safeParse({
      client_code: "CLI-001",
      client_name: "테스트화주",
      notes: "",
      is_active: "true",
      sort_order: "0"
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBeUndefined();
      expect(parsed.data.department_id).toBeNull();
    }
  });

  it("allows department creation without id", () => {
    const parsed = departmentSchema.safeParse({
      department_code: "DEPT-001",
      department_name: "테스트부서",
      notes: "",
      is_active: "true",
      sort_order: "0"
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBeUndefined();
    }
  });

  it("allows admin creation without department_id", () => {
    const parsed = userSchema.safeParse({
      email: "user@example.com",
      employee_no: "EMP001",
      full_name: "테스트관리자",
      department_id: "",
      app_role: "admin",
      notes: "",
      is_active: "true",
      invite: "false"
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.department_id).toBeUndefined();
    }
  });

  it("rejects non-admin creation without department_id", () => {
    const parsed = userSchema.safeParse({
      email: "user@example.com",
      employee_no: "EMP001",
      full_name: "테스트사용자",
      department_id: "",
      app_role: "client_owner",
      notes: "",
      is_active: "true",
      invite: "false"
    });

    expect(parsed.success).toBe(false);
  });

  it("validates report item request content", () => {
    const parsed = reportItemRequestSchema.safeParse({
      report_item_id: "8a831fd5-754b-4604-a09e-3ffcdf809734",
      request_content: "확인 요청드립니다."
    });

    expect(parsed.success).toBe(true);
  });

  it("validates common department item request content", () => {
    const parsed = reportItemRequestSchema.safeParse({
      target_type: "department_common",
      department_submission_id: "8a831fd5-754b-4604-a09e-3ffcdf809734",
      item_period: "current",
      item_sort_order: "0",
      request_content: "공통사항 확인 요청드립니다."
    });

    expect(parsed.success).toBe(true);
  });

  it("blocks blank report item request results", () => {
    const parsed = reportItemRequestResultSchema.safeParse({
      id: "8a831fd5-754b-4604-a09e-3ffcdf809734",
      result_content: "   "
    });

    expect(parsed.success).toBe(false);
  });
});

describe("employeeNoSchema", () => {
  it("allows the employee number formats already stored in production", () => {
    for (const value of ["test1", "y7206050", "Y7215039", "EMP001", "A-1024"]) {
      expect(employeeNoSchema.safeParse(value).success).toBe(true);
    }
  });

  it("trims surrounding whitespace before validating", () => {
    const parsed = employeeNoSchema.safeParse("  y7220033  ");

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe("y7220033");
    }
  });

  it("blocks PostgREST filter metacharacters", () => {
    for (const value of ["x,is_active.eq.true", "x.eq.1", "id.eq.8a831fd5", "a(b)", 'a"b', "a b", "가나다"]) {
      expect(employeeNoSchema.safeParse(value).success).toBe(false);
    }
  });

  it("blocks empty and over-long employee numbers", () => {
    expect(employeeNoSchema.safeParse("   ").success).toBe(false);
    expect(employeeNoSchema.safeParse("A".repeat(51)).success).toBe(false);
  });
});

describe("userSchema employee number", () => {
  const baseUser = {
    email: "user@example.com",
    full_name: "테스트사용자",
    department_id: "",
    app_role: "client_owner",
    notes: "",
    is_active: "true",
    invite: "false"
  };

  it("rejects an injection-shaped employee number", () => {
    expect(userSchema.safeParse({ ...baseUser, employee_no: "x,is_active.eq.true" }).success).toBe(false);
  });
});
