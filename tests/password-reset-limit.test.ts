import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PASSWORD_RESET_ACK_MESSAGE,
  PASSWORD_RESET_EMAIL_LIMIT,
  PASSWORD_RESET_IP_LIMIT,
  PASSWORD_RESET_WINDOW_MS,
  shouldSendPasswordReset
} from "@/lib/auth/password-reset-limit";

const MINUTE = 60 * 1000;
const RPC_MIGRATION = path.resolve(__dirname, "../supabase/migrations/20261031130000_login_attempt_rpc.sql");

function functionBody(sql: string, functionName: string) {
  const start = sql.indexOf(`create or replace function public.${functionName}(`);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("password reset limit thresholds match the SQL function", () => {
  const sql = readFileSync(RPC_MIGRATION, "utf-8");
  const body = functionBody(sql, "reserve_password_reset");

  it("uses 3 per email and 10 per IP within 1 hour", () => {
    expect(PASSWORD_RESET_EMAIL_LIMIT).toBe(3);
    expect(PASSWORD_RESET_IP_LIMIT).toBe(10);
    expect(PASSWORD_RESET_WINDOW_MS).toBe(60 * MINUTE);
  });

  it("keeps reserve_password_reset constants equal to the TS constants", () => {
    expect(body).toContain(`c_email_limit constant integer := ${PASSWORD_RESET_EMAIL_LIMIT};`);
    expect(body).toContain(`c_ip_limit constant integer := ${PASSWORD_RESET_IP_LIMIT};`);
    expect(body).toContain(`c_window constant interval := interval '${PASSWORD_RESET_WINDOW_MS / MINUTE} minutes';`);
  });

  it("restricts the function and table to service_role", () => {
    expect(body).toContain("set search_path = ''");
    expect(sql).toContain(
      "revoke execute on function public.reserve_password_reset(text, text) from public, anon, authenticated;"
    );
    expect(sql).toContain("grant execute on function public.reserve_password_reset(text, text) to service_role;");
    expect(sql).toContain("alter table public.password_reset_attempts enable row level security;");
    expect(sql).toContain("revoke all on table public.password_reset_attempts from public, anon, authenticated;");
  });

  it("applies only the email limit to the unknown IP bucket", () => {
    expect(body).toMatch(/if v_ip_hash <> 'unknown' and \(/);
  });
});

describe("shouldSendPasswordReset", () => {
  it("sends when the reservation passes", () => {
    expect(shouldSendPasswordReset({ data: [{ blocked: false }], error: null })).toBe(true);
  });

  it("skips when the reservation is blocked", () => {
    expect(shouldSendPasswordReset({ data: [{ blocked: true }], error: null })).toBe(false);
  });

  it("fails open when the RPC fails or returns nothing", () => {
    expect(shouldSendPasswordReset({ data: null, error: { code: "PGRST202" } })).toBe(true);
    expect(shouldSendPasswordReset({ data: [], error: null })).toBe(true);
  });
});

// 서버 액션의 외부 의존성을 대체해 응답 문구만 확인한다.
const rpc = vi.fn();
const resetPasswordForEmail = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { resetPasswordForEmail } })
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/supabase/config", () => ({
  getServiceRoleKey: () => "service-key-for-test",
  getSupabaseConfig: () => ({ url: "http://localhost", anonKey: "anon" }),
  supabaseCookieOptions: {}
}));

const { resetPasswordAction } = await import("@/actions/auth");

function resetForm(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

describe("resetPasswordAction response", () => {
  beforeEach(() => {
    rpc.mockReset();
    resetPasswordForEmail.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns the same message for success, blocked, Supabase error and missing RPC", async () => {
    const expected = { ok: true, message: PASSWORD_RESET_ACK_MESSAGE };

    rpc.mockResolvedValue({ data: [{ blocked: false, reason: "none" }], error: null });
    resetPasswordForEmail.mockResolvedValue({ error: null });
    expect(await resetPasswordAction(null, resetForm("user@example.com"))).toEqual(expected);

    rpc.mockResolvedValue({ data: [{ blocked: true, reason: "email" }], error: null });
    resetPasswordForEmail.mockClear();
    expect(await resetPasswordAction(null, resetForm("user@example.com"))).toEqual(expected);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: [{ blocked: false, reason: "none" }], error: null });
    resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit" } });
    expect(await resetPasswordAction(null, resetForm("user@example.com"))).toEqual(expected);

    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    resetPasswordForEmail.mockResolvedValue({ error: null });
    resetPasswordForEmail.mockClear();
    expect(await resetPasswordAction(null, resetForm("user@example.com"))).toEqual(expected);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("logs only the error code without the email", async () => {
    rpc.mockResolvedValue({ data: [{ blocked: false, reason: "none" }], error: null });
    resetPasswordForEmail.mockResolvedValue({ error: { code: "unexpected_failure", message: "user@example.com" } });
    await resetPasswordAction(null, resetForm("user@example.com"));
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("unexpected_failure");
    expect(logged).not.toContain("user@example.com");
  });
});
