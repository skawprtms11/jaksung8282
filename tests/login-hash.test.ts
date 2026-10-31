import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// server-only 는 서버 컴포넌트 밖에서 import 하면 예외를 던지므로 테스트에서는 빈 모듈로 대체한다.
vi.mock("server-only", () => ({}));

const { deriveLoginHashKey, getLoginHashKey, hashLoginEmail, hashLoginIp } = await import("@/lib/auth/login-hash");
const { UNKNOWN_IP_BUCKET } = await import("@/lib/auth/client-ip");

const keyA = deriveLoginHashKey("service-key-a");
const keyB = deriveLoginHashKey("service-key-b");

describe("login attempt HMAC", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the same hash for the same input and key", () => {
    expect(hashLoginEmail(keyA, "user@example.com")).toBe(hashLoginEmail(deriveLoginHashKey("service-key-a"), "user@example.com"));
    expect(hashLoginIp(keyA, "203.0.113.10")).toBe(hashLoginIp(keyA, "203.0.113.10"));
    expect(hashLoginEmail(keyA, "user@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different hash for a different key", () => {
    expect(hashLoginEmail(keyA, "user@example.com")).not.toBe(hashLoginEmail(keyB, "user@example.com"));
    expect(hashLoginIp(keyA, "203.0.113.10")).not.toBe(hashLoginIp(keyB, "203.0.113.10"));
  });

  it("differs from the plain sha256 of the input", () => {
    const plain = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(hashLoginEmail(keyA, "user@example.com")).not.toBe(plain("user@example.com"));
    expect(hashLoginIp(keyA, "203.0.113.10")).not.toBe(plain("203.0.113.10"));
  });

  it("normalizes email case and whitespace before hashing", () => {
    expect(hashLoginEmail(keyA, " User@Example.com ")).toBe(hashLoginEmail(keyA, "user@example.com"));
  });

  it("keeps a missing IP in the unknown bucket without hashing", () => {
    expect(hashLoginIp(keyA, "")).toBe(UNKNOWN_IP_BUCKET);
  });

  it("derives the key from the service role key and fails open without it", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key-a");
    expect(getLoginHashKey()?.equals(keyA)).toBe(true);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(getLoginHashKey()).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

describe("login attempt IP key", () => {
  it("hashes IPv6 addresses in the same /64 to the same value", () => {
    const key = deriveLoginHashKey("service-key-a");
    expect(hashLoginIp(key, "2001:db8:0:1::1")).toBe(hashLoginIp(key, "2001:db8:0:1:ffff::2"));
    expect(hashLoginIp(key, "2001:db8:0:1::1")).not.toBe(hashLoginIp(key, "2001:db8:0:2::1"));
    expect(hashLoginIp(key, "::ffff:203.0.113.10")).toBe(hashLoginIp(key, "203.0.113.10"));
  });
});
