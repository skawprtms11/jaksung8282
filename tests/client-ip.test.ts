import { describe, expect, it, vi } from "vitest";
import { resolveClientIp, toRateLimitIpKey } from "@/lib/auth/client-ip";

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

describe("toRateLimitIpKey", () => {
  it("keeps IPv4 as is", () => {
    expect(toRateLimitIpKey("203.0.113.10")).toBe("203.0.113.10");
  });

  it("unwraps IPv4-mapped IPv6 regardless of case", () => {
    expect(toRateLimitIpKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(toRateLimitIpKey("::FFFF:1.2.3.4")).toBe("1.2.3.4");
    expect(toRateLimitIpKey("0:0:0:0:0:ffff:0102:0304")).toBe("1.2.3.4");
  });

  it("groups full and compressed IPv6 in the same /64", () => {
    const key = "2001:0db8:0000:0001::/64";
    expect(toRateLimitIpKey("2001:0db8:0000:0001:0000:0000:0000:0001")).toBe(key);
    expect(toRateLimitIpKey("2001:db8:0:1::1")).toBe(key);
    expect(toRateLimitIpKey("2001:db8:0:1:abcd:ef01:2345:6789")).toBe(key);
  });

  it("separates different /64 prefixes", () => {
    expect(toRateLimitIpKey("2001:db8:0:1::1")).not.toBe(toRateLimitIpKey("2001:db8:0:2::1"));
  });

  it("normalizes case", () => {
    expect(toRateLimitIpKey("2001:DB8:0:1::ABCD")).toBe(toRateLimitIpKey("2001:db8:0:1::abcd"));
  });

  it("strips zone ids, brackets and ports", () => {
    expect(toRateLimitIpKey("fe80::1%eth0")).toBe("fe80:0000:0000:0000::/64");
    expect(toRateLimitIpKey("[2001:db8:0:1::1]:443")).toBe("2001:0db8:0000:0001::/64");
    expect(toRateLimitIpKey("[2001:db8:0:1::1]")).toBe("2001:0db8:0000:0001::/64");
    expect(toRateLimitIpKey("1.2.3.4:8080")).toBe("1.2.3.4");
  });

  it("returns empty or unparsable input unchanged", () => {
    expect(toRateLimitIpKey("")).toBe("");
    expect(toRateLimitIpKey("not-an-ip")).toBe("not-an-ip");
    expect(toRateLimitIpKey("1:2:3::4::5")).toBe("1:2:3::4::5");
    expect(toRateLimitIpKey("1:2:3:4:5:6:7:8:9")).toBe("1:2:3:4:5:6:7:8:9");
  });
});
