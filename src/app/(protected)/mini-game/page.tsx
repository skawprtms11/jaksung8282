import { HuindungiWalkGame, type MiniGameRanking } from "@/components/game/HuindungiWalkGame";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ScoreQueryRow = {
  id: string;
  user_id: string;
  score: number;
  duration_seconds: number;
  max_level: number;
  snack_count: number;
  created_at: string;
  profiles:
    | {
        full_name: string | null;
        departments: { department_name: string | null } | null;
      }
    | null;
};

export default async function MiniGamePage() {
  const { profile } = await getCurrentUserProfile();
  let rankings: MiniGameRanking[] = [];
  let setupMessage = "";

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("mini_game_scores")
      .select("id,user_id,score,duration_seconds,max_level,snack_count,created_at,profiles(full_name,departments(department_name))")
      .order("score", { ascending: false })
      .order("duration_seconds", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      setupMessage = "Supabase에서 010_mini_game_scores.sql migration을 실행하면 랭킹 저장이 활성화됩니다.";
    } else {
      rankings = ((data ?? []) as unknown as ScoreQueryRow[]).map((row) => ({
        id: row.id,
        userName: row.profiles?.full_name || "사용자",
        departmentName: row.profiles?.departments?.department_name ?? null,
        score: row.score,
        durationSeconds: row.duration_seconds,
        maxLevel: row.max_level,
        snackCount: row.snack_count,
        createdAt: row.created_at
      }));
    }
  } catch {
    setupMessage = "SUPABASE_SERVICE_ROLE_KEY 설정 후 랭킹 조회를 사용할 수 있습니다.";
  }

  return (
    <HuindungiWalkGame
      rankings={rankings}
      currentUserName={profile?.full_name ?? "사용자"}
      setupMessage={setupMessage}
    />
  );
}
