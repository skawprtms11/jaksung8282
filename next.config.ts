import type { NextConfig } from "next";

// netlify.toml [[headers]] 는 Next.js SSR 응답(함수 응답)에 붙지 않으므로 보안 헤더는 여기서 붙인다.
// netlify.toml 에도 같은 값을 남겨 정적 파일에 쓰며, 두 곳 값은 tests/security-headers.test.ts 가 비교한다.
// script-src 의 unsafe-inline 은 Next.js 가 하이드레이션·RSC 페이로드를 인라인 <script>로 내보내므로 유지한다
// (nonce 기반 CSP 는 모든 페이지가 동적 렌더링이 되어야 해 보류). unsafe-eval 은 운영 번들에 불필요해 넣지 않는다.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=()";

// 로그인 후 화면에서 위반이 없는지 확인하기 전이라 CSP 는 보고 전용(Report-Only)으로 먼저 배포한다.
// next dev 는 HMR 이 eval 을 쓰므로 개발 모드에서는 CSP 헤더를 생략한다.
export function buildSecurityHeaders(isProduction: boolean) {
  const headers = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY }
  ];
  if (isProduction) {
    headers.push({ key: "Content-Security-Policy-Report-Only", value: CONTENT_SECURITY_POLICY });
  }
  return headers;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@supabase/supabase-js"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(process.env.NODE_ENV === "production")
      }
    ];
  },
  experimental: {
    dynamicOnHover: true,
    optimizePackageImports: ["lucide-react", "recharts"],
    prefetchInlining: true,
    // 자료취합 사진 업로드 정책(5MB)과 맞춘다. 기본 1MB 제한이면 서버 액션 업로드가 실패한다.
    serverActions: {
      bodySizeLimit: "6mb"
    },
    staleTimes: {
      dynamic: 900,
      static: 3600
    },
    turbopackFileSystemCacheForDev: true
  }
};

export default nextConfig;
