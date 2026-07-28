import { describe, expect, it } from "vitest";
import { clientSchema, departmentSchema, userSchema } from "@/lib/validations/common";

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
});
