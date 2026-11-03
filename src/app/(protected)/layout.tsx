import { redirect } from "next/navigation";
import { ProtectedShell } from "@/components/layout/ProtectedShell";
import { SetupNotice } from "@/components/common/SetupNotice";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { loadHeaderFilterOptions, prefetchHeaderFilterOptions } from "@/lib/auth/header-scope-options";
import { PASSWORD_CHANGE_PATH } from "@/lib/auth/password-change";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  // 헤더 옵션은 프로필 확인과 동시에 조회를 시작하고, 아래 권한 확인을 통과한 뒤에만 화면에 넘긴다.
  // 운영 화주 키는 부서 조건 없이 RLS 범위로 읽는다(프로필을 기다리지 않기 위해서).
  const filterPrefetch = supabase ? prefetchHeaderFilterOptions(supabase) : null;
  const { profile, setupRequired, mustChangePassword } = await getCurrentUserProfile();
  if (setupRequired) {
    return (
      <div className="min-h-screen p-8">
        <SetupNotice />
      </div>
    );
  }
  // 미들웨어가 막지 못한 경로(matcher 밖)까지 임시 비밀번호 계정의 화면 접근을 차단한다.
  // 강제 변경 계정은 profile 이 null 로 오므로 로그인 확인보다 먼저 본다.
  if (mustChangePassword) {
    redirect(PASSWORD_CHANGE_PATH);
  }
  if (!profile) {
    redirect("/login");
  }
  // 역할 미지정 계정은 DB 의 current_app_role() 이 NULL 이라 비활성과 같이 취급한다.
  if (!profile.is_active || !profile.app_role) {
    redirect("/login?error=inactive");
  }
  // 실패하면 넘기지 않아 Header 가 /api/header-filters 로 다시 받는다.
  const filterOptions =
    supabase && filterPrefetch ? await loadHeaderFilterOptions(supabase, profile, filterPrefetch) : null;
  return (
    <ProtectedShell profile={profile} filterOptions={filterOptions ?? undefined}>
      {children}
    </ProtectedShell>
  );
}
