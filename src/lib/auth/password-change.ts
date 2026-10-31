export const PASSWORD_CHANGE_PATH = "/reset-password";
export const PASSWORD_CHANGE_REQUIRED_MESSAGE = "비밀번호를 먼저 변경하세요.";

type PasswordClaims = { amr?: unknown; app_metadata?: unknown } | null | undefined;

// 관리자 초기화 직후 계정은 app_metadata 플래그가 켜져 있어 비밀번호를 바꾸기 전까지 다른 화면을 쓸 수 없다.
// app_metadata 는 사용자가 직접 바꿀 수 없고 서비스 키로만 갱신된다.
export function mustChangePassword(claims: PasswordClaims) {
  const metadata = claims?.app_metadata;
  return Boolean(
    metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).must_change_password === true
  );
}

type ProfileAccessState = {
  profile: { is_active: boolean; app_role: string | null } | null;
  mustChangePassword: boolean;
};

// 서버 액션·API 공통 접근 판정. 강제 변경 계정은 프로필 상태와 무관하게 먼저 거부한다
// (비밀번호 변경 액션·로그아웃은 이 판정을 쓰지 않으므로 예외).
export function getProfileAccessError({ profile, mustChangePassword: changeRequired }: ProfileAccessState) {
  if (changeRequired) {
    return PASSWORD_CHANGE_REQUIRED_MESSAGE;
  }
  if (!profile) {
    return "로그인이 필요합니다.";
  }
  if (!profile.is_active || !profile.app_role) {
    return "비활성 또는 사용 승인되지 않은 계정은 처리할 수 없습니다.";
  }
  return null;
}

// 재설정 메일 링크로 만든 세션은 amr 에 recovery 가 남는다(문자열 또는 { method } 형식 모두 허용).
export function isRecoverySession(claims: PasswordClaims) {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) {
    return false;
  }
  return amr.some(
    (entry) =>
      entry === "recovery" ||
      (Boolean(entry) && typeof entry === "object" && (entry as { method?: unknown }).method === "recovery")
  );
}
