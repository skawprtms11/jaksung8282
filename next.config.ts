import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@supabase/supabase-js"],
  experimental: {
    staleTimes: {
      dynamic: 45,
      static: 180
    }
  }
};

export default nextConfig;
