import { HuindungiWalkGame } from "@/components/game/HuindungiWalkGame";
import { getCurrentUserProfile } from "@/lib/auth/current-user";

export default async function MiniGamePage() {
  const { profile } = await getCurrentUserProfile();

  return (
    <HuindungiWalkGame
      rankings={[]}
      currentUserName={profile?.full_name ?? "사용자"}
    />
  );
}
