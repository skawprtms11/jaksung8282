import { describe, expect, it } from "vitest";
import { normalizeAuthRedirect } from "@/lib/auth/redirect";

describe("auth redirect normalization", () => {
  it("keeps local paths with search params and hashes", () => {
    expect(normalizeAuthRedirect("/client-reports?week=2026-07#top")).toBe("/client-reports?week=2026-07#top");
  });

  it("falls back for external or malformed redirect targets", () => {
    expect(normalizeAuthRedirect("https://example.com/phishing")).toBe("/notices");
    expect(normalizeAuthRedirect("//example.com/phishing")).toBe("/notices");
    expect(normalizeAuthRedirect("/\\example.com")).toBe("/notices");
    expect(normalizeAuthRedirect("/notices\nSet-Cookie:bad=1")).toBe("/notices");
  });
});
