import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, TEMPORARY_PASSWORD_LENGTH } from "@/lib/auth/initial-password";

describe("generateTemporaryPassword", () => {
  it("creates a password of at least 12 characters with upper, lower and digit", () => {
    for (let index = 0; index < 200; index += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
      expect(TEMPORARY_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it("excludes visually confusing characters", () => {
    const joined = Array.from({ length: 300 }, () => generateTemporaryPassword()).join("");
    expect(joined).not.toMatch(/[IlOo01]/);
  });

  it("does not repeat between calls and is not derived from the employee number", () => {
    const passwords = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
    expect(passwords.size).toBe(100);
  });

  it("rejects lengths shorter than 12", () => {
    expect(() => generateTemporaryPassword(8)).toThrow();
    expect(generateTemporaryPassword(16)).toHaveLength(16);
  });
});
