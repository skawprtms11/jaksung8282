import { describe, expect, it, vi } from "vitest";
import { resolveClientIp } from "@/lib/auth/client-ip";

function headerReader(values: Record<string, string>) {
  return new Headers(values);
}

describe("resolveClientIp (development)", () => {
  it("prefers the Netlify connection IP over every other header", () => {
    const headers = headerReader({
      "x-nf-client-connection-ip": "203.0.113.10",
      "x-real-ip": "198.51.100.2",
      "x-forwarded-for": "1.1.1.1, 198.51.100.3"
    });
    expect(resolveClientIp(headers, false)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip when the Netlify header is missing or blank", () => {
    expect(resolveClientIp(headerReader({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "1.1.1.1" }), false)).toBe(
      "198.51.100.2"
    );
    expect(
      resolveClientIp(headerReader({ "x-nf-client-connection-ip": "  ", "x-real-ip": " 198.51.100.2 " }), false)
    ).toBe("198.51.100.2");
  });

  it("uses the last x-forwarded-for value, not the spoofable first one", () => {
    expect(resolveClientIp(headerReader({ "x-forwarded-for": "6.6.6.6, 10.0.0.1, 198.51.100.3" }), false)).toBe(
      "198.51.100.3"
    );
    expect(resolveClientIp(headerReader({ "x-forwarded-for": "198.51.100.3" }), false)).toBe("198.51.100.3");
    expect(resolveClientIp(headerReader({ "x-forwarded-for": "6.6.6.6, 198.51.100.3, " }), false)).toBe("198.51.100.3");
  });

  it("returns an empty string when no IP header is present", () => {
    expect(resolveClientIp(headerReader({}), false)).toBe("");
    expect(resolveClientIp(headerReader({ "x-forwarded-for": " , " }), false)).toBe("");
  });
});

describe("resolveClientIp (production)", () => {
  it("still uses the Netlify connection IP", () => {
    expect(resolveClientIp(headerReader({ "x-nf-client-connection-ip": "203.0.113.10" }), true)).toBe("203.0.113.10");
  });

  it("ignores x-real-ip and x-forwarded-for when the Netlify header is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(
        resolveClientIp(headerReader({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "1.1.1.1, 198.51.100.3" }), true)
      ).toBe("");
      expect(resolveClientIp(headerReader({ "x-nf-client-connection-ip": " " }), true)).toBe("");
      expect(warn).toHaveBeenCalledTimes(2);
      // 경고에 IP 원문을 남기지 않는다.
      expect(warn.mock.calls.flat().join(" ")).not.toMatch(/198\.51|1\.1\.1\.1/);
    } finally {
      warn.mockRestore();
    }
  });
});
