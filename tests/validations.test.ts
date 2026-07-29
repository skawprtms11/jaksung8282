import { describe, expect, it } from "vitest";
import {
  clientSchema,
  departmentSchema,
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

  it("allows user creation without department_id", () => {
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

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.department_id).toBeUndefined();
    }
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
