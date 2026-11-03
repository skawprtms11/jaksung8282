import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { loadHeaderFilterOptions } from "@/lib/auth/header-scope-options";
import { PASSWORD_CHANGE_REQUIRED_MESSAGE } from "@/lib/auth/password-change";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HeaderFilterOptions } from "@/components/layout/Header";

export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "private, max-age=60, stale-while-revalidate=300"
};

export async function GET() {
  const { profile, mustChangePassword } = await getCurrentUserProfile();
  if (mustChangePassword) {
    return NextResponse.json({ message: PASSWORD_CHANGE_REQUIRED_MESSAGE }, { status: 403 });
  }
  if (!profile) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!profile.is_active) {
    return NextResponse.json({ message: "비활성 사용자입니다." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ departments: [], clients: [], assignedClientIds: [] } satisfies HeaderFilterOptions, {
      headers: cacheHeaders
    });
  }

  const options = await loadHeaderFilterOptions(supabase, profile);
  if (!options) {
    return NextResponse.json({ message: "필터 정보를 불러오지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json(options, { headers: cacheHeaders });
}
