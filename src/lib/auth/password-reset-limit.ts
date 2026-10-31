// 비밀번호 재설정 메일 발송 제한. 판정·기록은 DB 함수 public.reserve_password_reset
// (supabase/migrations/20261031140000_password_reset_pair_limit.sql)이 같은 이메일·IP 를 직렬화해 처리한다.
// 아래 상수는 그 SQL 상수와 같아야 하며 tests/password-reset-limit.test.ts 가 마이그레이션 파일을 읽어 확인한다.
// 1) 같은 (이메일, IP) 쌍: 1시간 3회 발송 시도 초과 시 발송하지 않음('unknown' 도 (이메일, 'unknown') 쌍으로 셈).
// 2) 같은 이메일 전체: 1시간 10회 초과 시 발송하지 않음(여러 IP 로 나눈 메일 폭탄 상한).
// 3) 같은 IP: 1시간 10회 초과 시 발송하지 않음('unknown' 버킷은 정상 사용자가 공유하므로 미적용).
// 이메일 단독 3회로 막으면 공격자가 피해자 이메일로 3번 요청해 피해자의 재설정을 1시간 막을 수 있어 쌍 기준으로 바꿨다.
export const PASSWORD_RESET_PAIR_LIMIT = 3;
export const PASSWORD_RESET_EMAIL_LIMIT = 10;
export const PASSWORD_RESET_IP_LIMIT = 10;
export const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000;

// 제한 초과·Supabase 오류·성공 모두 이 문구 하나로 응답해 계정 존재 여부와 제한 상태를 드러내지 않는다.
export const PASSWORD_RESET_ACK_MESSAGE = "입력한 주소로 계정이 있으면 비밀번호 재설정 메일을 발송했습니다.";

type ReservePasswordResetResult = {
  data?: { blocked: boolean }[] | null;
  error?: unknown;
};

// reserve_password_reset 호출 결과로 실제 발송 여부를 정한다.
// 호출 실패(함수 미적용 등)는 기존 정책대로 발송을 막지 않는다(fail-open, 원인은 호출부가 서버 로그로 남김).
export function shouldSendPasswordReset(result: ReservePasswordResetResult) {
  if (result.error) {
    return true;
  }
  return !result.data?.[0]?.blocked;
}
