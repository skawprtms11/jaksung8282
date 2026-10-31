import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOGIN_ATTEMPT_RETENTION_MS,
  LOGIN_EMAIL_FAILURE_LIMIT,
  LOGIN_EMAIL_LOCKED_MESSAGE,
  LOGIN_FAILURE_LIMIT,
  LOGIN_FAILURE_WINDOW_MS,
  LOGIN_LOCK_MS,
  LOGIN_LOCKED_MESSAGE,
  LOGIN_TRUSTED_IP_MS,
  loginLockMessage
} from "@/lib/auth/login-lock";
import {
  getProfileAccessError,
  isRecoverySession,
  mustChangePassword,
  PASSWORD_CHANGE_REQUIRED_MESSAGE
} from "@/lib/auth/password-change";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const RPC_MIGRATION = path.resolve(__dirname, "../supabase/migrations/20261031130000_login_attempt_rpc.sql");

// 판정은 DB 함수가 하므로, TS 상수와 SQL 상수가 어긋나지 않는지 마이그레이션 파일을 읽어 확인한다.
function sqlConstants(functionName: string) {
  const sql = readFileSync(RPC_MIGRATION, "utf-8");
  const start = sql.indexOf(`create or replace function public.${functionName}(`);
  const end = sql.indexOf("$$;", start);
  const body = sql.slice(start, end);
  const values = new Map<string, number>();
  for (const match of body.matchAll(/(c_\w+) constant integer := (\d+);/g)) {
    values.set(match[1], Number(match[2]));
  }
  for (const match of body.matchAll(/(c_\w+) constant interval := interval '(\d+) (minutes|days)';/g)) {
    values.set(match[1], Number(match[2]) * (match[3] === "days" ? DAY : MINUTE));
  }
  return values;
}

describe("login lock thresholds match the SQL functions", () => {
  it("uses 5 per email+IP and 30 per email as thresholds", () => {
    expect(LOGIN_FAILURE_LIMIT).toBe(5);
    expect(LOGIN_EMAIL_FAILURE_LIMIT).toBe(30);
  });

  it("keeps reserve_login_attempt constants equal to the TS constants", () => {
    const sql = sqlConstants("reserve_login_attempt");
    expect(sql.get("c_pair_limit")).toBe(LOGIN_FAILURE_LIMIT);
    expect(sql.get("c_email_limit")).toBe(LOGIN_EMAIL_FAILURE_LIMIT);
    expect(sql.get("c_failure_window")).toBe(LOGIN_FAILURE_WINDOW_MS);
    expect(sql.get("c_lock")).toBe(LOGIN_LOCK_MS);
    expect(sql.get("c_retention")).toBe(LOGIN_ATTEMPT_RETENTION_MS);
    expect(sql.get("c_trusted_ip")).toBe(LOGIN_TRUSTED_IP_MS);
  });

  it("keeps record_login_success cleanup periods equal to the TS constants", () => {
    const sql = sqlConstants("record_login_success");
    expect(sql.get("c_retention")).toBe(LOGIN_ATTEMPT_RETENTION_MS);
    expect(sql.get("c_trusted_ip")).toBe(LOGIN_TRUSTED_IP_MS);
  });

  it("restricts both functions to service_role", () => {
    const sql = readFileSync(RPC_MIGRATION, "utf-8");
    for (const name of ["reserve_login_attempt", "record_login_success"]) {
      expect(sql).toContain(`revoke execute on function public.${name}(text, text) from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${name}(text, text) to service_role;`);
    }
    expect(sql.match(/set search_path = ''/g)).toHaveLength(3);
  });

  it("waits only on rows of its own email when cleaning up", () => {
    const sql = readFileSync(RPC_MIGRATION, "utf-8");
    // 잠금 대기 없는 전역 정리(skip locked)를 빼면 남는 delete 는 모두 자기 이메일 범위여야 한다(교착 방지).
    const deletes = sql.split(/delete from /).slice(1).map((part) => part.slice(0, part.indexOf(";")));
    for (const statement of deletes) {
      if (!statement.includes("for update skip locked")) {
        expect(statement).toMatch(/\.email_hash = p_email_hash/);
      }
    }
    expect(deletes.filter((statement) => statement.includes("for update skip locked"))).toHaveLength(2);
  });
});

describe("loginLockMessage", () => {
  it("returns null when the attempt is not blocked", () => {
    expect(loginLockMessage({ blocked: false, reason: "none" })).toBeNull();
    expect(loginLockMessage(undefined)).toBeNull();
  });

  it("adds the reset-mail guidance only for the email-wide block", () => {
    expect(loginLockMessage({ blocked: true, reason: "ip" })).toBe(LOGIN_LOCKED_MESSAGE);
    expect(loginLockMessage({ blocked: true, reason: "email" })).toBe(LOGIN_EMAIL_LOCKED_MESSAGE);
    expect(LOGIN_EMAIL_LOCKED_MESSAGE).toContain("비밀번호 재설정 메일로 본인 확인 후 다시 로그인하세요");
  });
});

describe("password change claims", () => {
  it("detects the must-change flag only when it is exactly true", () => {
    expect(mustChangePassword({ app_metadata: { must_change_password: true } })).toBe(true);
    expect(mustChangePassword({ app_metadata: { must_change_password: "true" } })).toBe(false);
    expect(mustChangePassword({ app_metadata: {} })).toBe(false);
    expect(mustChangePassword(null)).toBe(false);
  });

  it("detects recovery sessions in both amr formats", () => {
    expect(isRecoverySession({ amr: [{ method: "recovery", timestamp: 1 }] })).toBe(true);
    expect(isRecoverySession({ amr: ["recovery"] })).toBe(true);
    expect(isRecoverySession({ amr: [{ method: "password", timestamp: 1 }] })).toBe(false);
    expect(isRecoverySession(undefined)).toBe(false);
  });
});

describe("getProfileAccessError", () => {
  const activeProfile = { is_active: true, app_role: "admin" };

  it("rejects must-change accounts before any other check", () => {
    expect(getProfileAccessError({ profile: activeProfile, mustChangePassword: true })).toBe(
      PASSWORD_CHANGE_REQUIRED_MESSAGE
    );
    expect(getProfileAccessError({ profile: null, mustChangePassword: true })).toBe(PASSWORD_CHANGE_REQUIRED_MESSAGE);
  });

  it("keeps the existing login and inactive checks", () => {
    expect(getProfileAccessError({ profile: null, mustChangePassword: false })).toBe("로그인이 필요합니다.");
    expect(getProfileAccessError({ profile: { is_active: false, app_role: "admin" }, mustChangePassword: false })).toMatch(/비활성/);
    expect(getProfileAccessError({ profile: { is_active: true, app_role: null }, mustChangePassword: false })).toMatch(/비활성/);
    expect(getProfileAccessError({ profile: activeProfile, mustChangePassword: false })).toBeNull();
  });
});
