import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@supabase/supabase-js"],
  experimental: {
    dynamicOnHover: true,
    optimizePackageImports: ["lucide-react", "recharts"],
    prefetchInlining: true,
    staleTimes: {
      dynamic: 900,
      static: 3600
    },
    turbopackFileSystemCacheForDev: true
  }
};

export default nextConfig;
