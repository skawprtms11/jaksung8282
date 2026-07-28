import { describe, expect, it } from "vitest";
import {
  canEditClientReport,
  canEditDepartmentSubmission,
  isAllowedClientTransition,
  isAllowedDepartmentTransition
} from "@/lib/auth/permissions";

describe("permission helpers", () => {
  it("blocks client owners from editing approved client reports", () => {
    expect(canEditClientReport("client_owner", "approved")).toBe(false);
    expect(canEditClientReport("client_owner", "rejected")).toBe(true);
  });

  it("allows managers to edit department drafts but not final approved submissions", () => {
    expect(canEditDepartmentSubmission("manager", "draft")).toBe(true);
    expect(canEditDepartmentSubmission("manager", "division_approved")).toBe(false);
  });

  it("validates client report transitions", () => {
    expect(isAllowedClientTransition("draft", "submitted")).toBe(true);
    expect(isAllowedClientTransition("draft", "approved")).toBe(false);
  });

  it("validates department submission transitions", () => {
    expect(isAllowedDepartmentTransition("submitted_to_division", "division_approved")).toBe(true);
    expect(isAllowedDepartmentTransition("draft", "division_approved")).toBe(false);
  });
});
