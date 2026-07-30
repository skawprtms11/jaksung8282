import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@supabase/supabase-js"],
  experimental: {
    staleTimes: {
      dynamic: 300,
      static: 1800
    }
  }
};

export default nextConfig;
