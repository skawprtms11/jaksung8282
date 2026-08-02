import { redirect } from "next/navigation";
import { ProtectedShell } from "@/components/layout/ProtectedShell";
import { SetupNotice } from "@/components/common/SetupNotice";
import { getCurrentUserProfile } from "@/lib/auth/current-user";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { profile, setupRequired } = await getCurrentUserProfile();
  if (setupRequired) {
    return (
      <div className="min-h-screen p-8">
        <SetupNotice />
      </div>
    );
  }
  if (!profile) {
    redirect("/login");
  }
  if (!profile.is_active) {
    redirect("/login?error=inactive");
  }
  return <ProtectedShell profile={profile}>{children}</ProtectedShell>;
}
