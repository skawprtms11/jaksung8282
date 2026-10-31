import { redirect } from "next/navigation";
import { ProtectedShell } from "@/components/layout/ProtectedShell";
import { SetupNotice } from "@/components/common/SetupNotice";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { PASSWORD_CHANGE_PATH } from "@/lib/auth/password-change";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
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
  return <ProtectedShell profile={profile}>{children}</ProtectedShell>;
}
