import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/login",
    "/reset-password",
    "/notices/:path*",
    "/meeting-materials/:path*",
    "/department-reports/:path*",
    "/client-reports/:path*",
    "/mobile/:path*",
    "/admin/:path*",
    "/mini-game/:path*"
  ]
};
