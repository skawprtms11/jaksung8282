import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MiniGameRanking } from "@/components/game/HuindungiWalkGame";

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

export const dynamic = "force-dynamic";

export async function GET() {
  const { profile } = await getCurrentUserProfile();
  if (!profile?.is_active) {
    return NextResponse.json({ message: "로그인이 필요합니다.", rankings: [] }, { status: 401 });
  }

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
      return NextResponse.json({
        rankings: [],
        setupMessage: "Supabase에서 010_mini_game_scores.sql migration을 실행하면 랭킹 저장이 활성화됩니다."
      });
    }

    const rankings: MiniGameRanking[] = ((data ?? []) as unknown as ScoreQueryRow[]).map((row) => ({
      id: row.id,
      userName: row.profiles?.full_name || "사용자",
      departmentName: row.profiles?.departments?.department_name ?? null,
      score: row.score,
      durationSeconds: row.duration_seconds,
      maxLevel: row.max_level,
      snackCount: row.snack_count,
      createdAt: row.created_at
    }));

    return NextResponse.json({ rankings, setupMessage: "" });
  } catch {
    return NextResponse.json({
      rankings: [],
      setupMessage: "SUPABASE_SERVICE_ROLE_KEY 설정 후 랭킹 조회를 사용할 수 있습니다."
    });
  }
}
