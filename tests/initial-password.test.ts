import { describe, expect, it } from "vitest";
import { getInitialPassword, isInitialPasswordAdjusted } from "@/lib/auth/initial-password";

describe("getInitialPassword", () => {
  it("keeps employee numbers with at least six characters unchanged", () => {
    expect(getInitialPassword("Y7215039")).toBe("Y7215039");
    expect(isInitialPasswordAdjusted("Y7215039")).toBe(false);
  });

  it("pads short employee numbers to the Supabase minimum length", () => {
    expect(getInitialPassword("test1")).toBe("test10");
    expect(isInitialPasswordAdjusted("test1")).toBe(true);
  });

  it("trims surrounding whitespace before deriving the password", () => {
    expect(getInitialPassword("  test1  ")).toBe("test10");
  });
});
