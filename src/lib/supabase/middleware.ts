import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { protectedRoutes } from "@/config/app";

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
  const {
    data: { session }
  } = await supabase.auth.getSession();
  const hasSession = Boolean(session);
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  const shouldRefreshSoon = hasSession && expiresAtMs > 0 && expiresAtMs - Date.now() < 60_000;

  if (shouldRefreshSoon) {
    await supabase.auth.getUser();
  }

  if (!hasSession && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (hasSession && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/notices";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
