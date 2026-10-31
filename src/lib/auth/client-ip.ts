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

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/;

function ipv4ToGroups(ipv4: string) {
  const octets = ipv4.split(".").map(Number);
  if (!IPV4_PATTERN.test(ipv4) || octets.some((octet) => octet > 255)) {
    return null;
  }
  return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
}

// "a:b::c" 형태를 8개 숫자 그룹으로 전개한다. 끝에 IPv4 표기(::ffff:1.2.3.4)가 오면 2그룹으로 바꾼다. 실패 시 null.
function expandIpv6(address: string) {
  const halves = address.split("::");
  if (halves.length > 2) {
    return null;
  }
  const parseHalf = (half: string, allowIpv4Tail: boolean) => {
    if (!half) {
      return [];
    }
    const parts = half.split(":");
    const groups: number[] = [];
    for (const [index, part] of parts.entries()) {
      if (allowIpv4Tail && index === parts.length - 1 && part.includes(".")) {
        const tail = ipv4ToGroups(part);
        if (!tail) {
          return null;
        }
        groups.push(...tail);
      } else if (IPV6_GROUP_PATTERN.test(part)) {
        groups.push(parseInt(part, 16));
      } else {
        return null;
      }
    }
    return groups;
  };
  const hasGap = halves.length === 2;
  const head = parseHalf(halves[0], !hasGap);
  const tail = hasGap ? parseHalf(halves[1], true) : [];
  if (!head || !tail) {
    return null;
  }
  const filled = head.length + tail.length;
  if (hasGap ? filled > 7 : filled !== 8) {
    return null;
  }
  return [...head, ...Array<number>(8 - filled).fill(0), ...tail];
}

// 요청 제한(로그인 잠금·재설정 메일·가입 요청) 키 전용 IP 정규화. 로그 등에 쓰는 resolveClientIp 값은 바꾸지 않는다.
// IPv6 는 보통 한 회선에 /64 대역이 통째로 할당돼 주소를 사실상 무제한 바꿀 수 있으므로 /64 단위로 묶는다.
// IPv4·IPv4-mapped IPv6 는 IPv4 주소 그대로 쓴다. 빈 값·파싱 실패는 입력을 그대로 돌려준다.
export function toRateLimitIpKey(ip: string) {
  let address = ip.trim().toLowerCase();
  if (!address) {
    return ip;
  }
  // 방어적 처리: "[2001:db8::1]:443" 처럼 대괄호·포트가 붙은 IPv6, "1.2.3.4:80" 처럼 포트가 붙은 IPv4.
  const bracketed = address.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) {
    address = bracketed[1];
  } else {
    const ipv4WithPort = address.match(/^((?:\d{1,3}\.){3}\d{1,3}):\d+$/);
    if (ipv4WithPort) {
      address = ipv4WithPort[1];
    }
  }
  address = address.split("%")[0];
  if (IPV4_PATTERN.test(address)) {
    return ipv4ToGroups(address) ? address : ip;
  }
  const groups = expandIpv6(address);
  if (!groups) {
    return ip;
  }
  const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isIpv4Mapped) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  }
  const prefix = groups.slice(0, 4).map((group) => group.toString(16).padStart(4, "0"));
  return `${prefix.join(":")}::/64`;
}
