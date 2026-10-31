import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSecurityHeaders, CONTENT_SECURITY_POLICY, PERMISSIONS_POLICY } from "../next.config";

const NETLIFY_TOML = readFileSync(path.resolve(__dirname, "../netlify.toml"), "utf-8");

function netlifyHeader(name: string) {
  const match = NETLIFY_TOML.match(new RegExp(`^\\s*${name} = "(.*)"\\s*$`, "m"));
  return match?.[1];
}

function headerMap(isProduction: boolean) {
  return new Map(buildSecurityHeaders(isProduction).map((header) => [header.key, header.value]));
}

describe("security headers", () => {
  it("keeps the CSP strict where it matters", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-eval");
  });

  it("sends CSP as Report-Only in production and never enforces it from next.config", () => {
    const production = headerMap(true);
    expect(production.get("Content-Security-Policy-Report-Only")).toBe(CONTENT_SECURITY_POLICY);
    expect(production.has("Content-Security-Policy")).toBe(false);
    expect(production.get("X-Frame-Options")).toBe("DENY");
    expect(production.get("X-Content-Type-Options")).toBe("nosniff");
    expect(production.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(production.get("Permissions-Policy")).toBe(PERMISSIONS_POLICY);
  });

  it("omits CSP in development because HMR uses eval", () => {
    const development = headerMap(false);
    expect(development.has("Content-Security-Policy-Report-Only")).toBe(false);
    expect(development.get("X-Frame-Options")).toBe("DENY");
  });

  it("matches the netlify.toml values used for static files", () => {
    const production = headerMap(true);
    expect(netlifyHeader("Content-Security-Policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(netlifyHeader("Permissions-Policy")).toBe(PERMISSIONS_POLICY);
    expect(netlifyHeader("X-Frame-Options")).toBe(production.get("X-Frame-Options"));
    expect(netlifyHeader("Referrer-Policy")).toBe(production.get("Referrer-Policy"));
    expect(netlifyHeader("X-Content-Type-Options")).toBe(production.get("X-Content-Type-Options"));
  });
});
