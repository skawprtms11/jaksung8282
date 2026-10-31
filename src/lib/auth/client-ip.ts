// IP 헤더가 없는 요청을 묶는 버킷. 로그인 잠금·가입 요청 제한이 공용으로 쓴다.
export const UNKNOWN_IP_BUCKET = "unknown";

type HeaderReader = { get(name: string): string | null | undefined };

function trimmedHeader(value: string | null | undefined) {
  return value?.trim() || "";
}

// 클라이언트 IP 추출 우선순위(로그인 잠금·가입 요청 제한 공용).
// 1) x-nf-client-connection-ip: Netlify 엣지가 실제 접속 IP로 덮어쓰므로 사용자가 조작할 수 없다.
//    운영에서 이 헤더가 없으면 Netlify 를 거치지 않은 비정상 경로라 아래 헤더도 사용자가 꾸민 값일 수 있다.
//    그래서 운영에서는 x-real-ip·XFF 로 내려가지 않고 빈 문자열('unknown' 버킷)을 돌려준다.
// 2) x-real-ip: 앞단 프록시가 설정하는 단일 값(개발 환경 전용).
// 3) x-forwarded-for 의 마지막 값: 가장 가까운 프록시가 붙인 값이다. 맨 앞 값은 사용자가 요청에
//    임의로 넣어 보낼 수 있어 매번 다른 IP 로 위장해 IP별 제한을 우회할 수 있으므로 쓰지 않는다(개발 환경 전용).
// 모두 없으면 빈 문자열(호출부에서 'unknown' 버킷으로 묶는다).
// 운영 판정은 이 저장소의 기존 기준(NODE_ENV === "production", src/lib/supabase/config.ts)을 따른다.
export function resolveClientIp(
  headerStore: HeaderReader,
  isProduction: boolean = process.env.NODE_ENV === "production"
) {
  const netlifyIp = trimmedHeader(headerStore.get("x-nf-client-connection-ip"));
  if (netlifyIp) {
    return netlifyIp;
  }
  if (isProduction) {
    // IP 원문·헤더 값은 개인정보라 남기지 않는다.
    console.warn("클라이언트 IP: 운영 환경에 x-nf-client-connection-ip 헤더가 없어 unknown 으로 처리합니다.");
    return "";
  }
  const realIp = trimmedHeader(headerStore.get("x-real-ip"));
  if (realIp) {
    return realIp;
  }
  const forwarded = (headerStore.get("x-forwarded-for") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return forwarded.at(-1) ?? "";
}
