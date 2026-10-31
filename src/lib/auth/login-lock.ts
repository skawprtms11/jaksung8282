// 로그인 실패 제한(2단계). 판정·기록은 DB 함수 public.reserve_login_attempt / record_login_success
// (supabase/migrations/20261031130000_login_attempt_rpc.sql)가 같은 이메일을 직렬화해 처리한다.
// 아래 상수는 그 SQL 상수와 같아야 하며 tests/login-lock.test.ts 가 마이그레이션 파일을 읽어 일치를 확인한다.
// 1) 같은 이메일 + 같은 IP: 15분 안에 5회 실패 → 해당 IP에서만 15분 차단.
// 2) 같은 이메일 전체(IP 무관): 15분 안에 30회 실패 → 모든 IP에서 15분 차단(분산 대입 방어).
//    단, 최근 30일 안에 이 이메일로 성공한 IP(신뢰 IP, 'unknown' 제외)는 2)에서 제외한다.
export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_EMAIL_FAILURE_LIMIT = 30;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
// 판정에 필요한 가장 오래된 실패 기록 시점. 이보다 오래된 실패 행은 정리 대상이다.
export const LOGIN_ATTEMPT_RETENTION_MS = LOGIN_FAILURE_WINDOW_MS + LOGIN_LOCK_MS;
// 로그인 성공 기록(신뢰 IP) 유지 기간. 이보다 오래된 성공 행은 정리 대상이다.
export const LOGIN_TRUSTED_IP_MS = 30 * 24 * 60 * 60 * 1000;

export const LOGIN_LOCKED_MESSAGE = "로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.";
// 이메일 전체 잠금은 남이 일으킬 수 있으므로 본인 복구 경로를 안내한다. 계정이 없는 이메일에도 똑같이 나가
// 계정 존재 여부는 드러나지 않는다(재설정 메일 발송 화면도 존재 여부와 무관하게 같은 응답).
export const LOGIN_EMAIL_LOCKED_MESSAGE = `${LOGIN_LOCKED_MESSAGE} 본인이라면 비밀번호 재설정 메일로 본인 확인 후 다시 로그인하세요.`;

export type LoginLockReason = "ip" | "email" | "none";

// reserve_login_attempt 결과 1행을 차단 문구로 바꾼다. 차단이 아니면 null.
export function loginLockMessage(row: { blocked: boolean; reason: string } | null | undefined) {
  if (!row?.blocked) {
    return null;
  }
  return row.reason === "email" ? LOGIN_EMAIL_LOCKED_MESSAGE : LOGIN_LOCKED_MESSAGE;
}
