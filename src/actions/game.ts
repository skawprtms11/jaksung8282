"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeErrorMessage, type ActionResult } from "@/lib/utils/form";

const miniGameScoreSchema = z.object({
  score: z.coerce.number().int().min(0).max(999999),
  duration_seconds: z.coerce.number().int().min(0).max(3600),
  max_level: z.coerce.number().int().min(1).max(999),
  snack_count: z.coerce.number().int().min(0).max(999)
});

export async function saveMiniGameScoreAction(payload: unknown): Promise<ActionResult> {
  const { profile } = await getCurrentUserProfile();
  if (!profile) {
    return { ok: false, message: "로그인이 필요합니다." };
  }
  if (!profile.is_active) {
    return { ok: false, message: "비활성화된 사용자는 점수를 저장할 수 없습니다." };
  }

  const parsed = miniGameScoreSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "점수 데이터를 확인하세요.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Supabase 환경변수를 먼저 설정하세요." };
  }

  const { error } = await supabase.from("mini_game_scores").insert({
    user_id: profile.id,
    score: parsed.data.score,
    duration_seconds: parsed.data.duration_seconds,
    max_level: parsed.data.max_level,
    snack_count: parsed.data.snack_count
  });

  if (error) {
    return { ok: false, message: safeErrorMessage(error.message) };
  }

  revalidatePath("/mini-game");
  return { ok: true, message: "점수를 랭킹에 등록했습니다." };
}
