import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@supabase/supabase-js"],
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
