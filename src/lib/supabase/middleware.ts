import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { protectedRoutes } from "@/config/app";
import { normalizeAuthRedirect } from "@/lib/auth/redirect";

function startsWithAny(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const pathname = request.nextUrl.pathname;
  const recoveryCode = pathname === "/reset-password" ? request.nextUrl.searchParams.get("code") : null;
  if (recoveryCode) {
    await supabase.auth.exchangeCodeForSession(recoveryCode);
  }

  const isProtected = startsWithAny(pathname, protectedRoutes);
  // getSession()은 쿠키를 서명 검증 없이 신뢰한다. getClaims()는 JWT 서명을 로컬에서 검증하며
  // (캐시된 서명키 사용) Auth 서버 왕복이 없어 게이트 판정 속도는 그대로 유지된다.
  let claimsExp = 0;
  let hasSession = false;
  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims ?? null;
    hasSession = Boolean(claims);
    claimsExp = typeof claims?.exp === "number" ? claims.exp : 0;
  } catch {
    hasSession = false;
  }
  const expiresAtMs = claimsExp > 0 ? claimsExp * 1000 : 0;
  const shouldRefreshSoon = hasSession && expiresAtMs > 0 && expiresAtMs - Date.now() < 60_000;

  if (shouldRefreshSoon) {
    await supabase.auth.getUser();
  }

  if (!hasSession && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("redirectTo", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (hasSession && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    const redirectTo = normalizeAuthRedirect(request.nextUrl.searchParams.get("redirectTo"));
    const destination = new URL(redirectTo, request.url);
    redirectUrl.pathname = destination.pathname;
    redirectUrl.search = destination.search;
    redirectUrl.hash = destination.hash;
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
