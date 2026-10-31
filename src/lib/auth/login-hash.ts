import "server-only";
import { createHmac } from "node:crypto";
import { UNKNOWN_IP_BUCKET } from "@/lib/auth/client-ip";
import { getServiceRoleKey } from "@/lib/supabase/config";

// login_attempts 의 email_hash·ip_hash 전용 HMAC-SHA256. 평문 sha256 은 이메일·IP 처럼 후보가 좁은 값을
// 사전 대입으로 되돌릴 수 있어, DB 유출 시에도 원문을 추정하지 못하게 서버만 아는 키를 섞는다.
// 키는 SUPABASE_SERVICE_ROLE_KEY 에서 파생한다(새 환경변수 없이 서버 전용 비밀 재사용, 용도별 분리).
// 서비스 키를 교체하면 해시가 모두 바뀌어 기존 기록이 무효화된다(실패 횟수·신뢰 IP 초기화).
// 가입 요청 제한(registration_attempts)의 IP 해시는 기존 데이터 호환을 위해 이 모듈을 쓰지 않는다.
const LOGIN_HASH_CONTEXT = "login-attempts-v1";

export function deriveLoginHashKey(serviceRoleKey: string) {
  return createHmac("sha256", serviceRoleKey).update(LOGIN_HASH_CONTEXT).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

// 계정 존재 여부와 무관하게 입력한 이메일 기준으로 센다. 소문자·공백 정규화 후 해시한다.
export function hashLoginEmail(key: Buffer, email: string) {
  return hmacHex(key, email.trim().toLowerCase());
}

// IP 헤더가 없으면(빈 문자열) 해시하지 않고 'unknown' 버킷으로 묶는다(DB 함수가 이 값으로 신뢰 IP 를 제외).
export function hashLoginIp(key: Buffer, rawIp: string) {
  return rawIp ? hmacHex(key, rawIp) : UNKNOWN_IP_BUCKET;
}

// 서비스 키가 없으면 null. 호출부는 기존 정책대로 제한 없이 진행한다(fail-open, 원인은 서버 로그).
export function getLoginHashKey() {
  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("로그인 실패 제한: 서비스 키가 없어 해시 키를 만들지 못했습니다.");
    return null;
  }
  return deriveLoginHashKey(serviceRoleKey);
}
