import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileAccessError, mustChangePassword } from "./password-change";
import type { ProfileSummary } from "./permissions";

type ProfileQueryRow = {
  id: string;
  email: string;
  employee_no: string;
  full_name: string;
  app_role: ProfileSummary["app_role"];
  department_id: string | null;
  is_active: boolean;
  departments: { department_name: string } | null;
};

export const getCurrentUserProfile = cache(async (): Promise<{
  profile: ProfileSummary | null;
  setupRequired: boolean;
  mustChangePassword: boolean;
}> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { profile: null, setupRequired: true, mustChangePassword: false };
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return { profile: null, setupRequired: false, mustChangePassword: false };
  }
  const passwordChangeRequired = mustChangePassword(claimsData?.claims);
  // 강제 변경 계정은 프로필을 돌려주지 않는다. 이 함수를 쓰는 모든 서버 액션·API·화면이
  // 비로그인과 같이 거부(fail-closed)하게 되어, 미들웨어를 거치지 않는 서버 액션 호출로도 우회할 수 없다.
  if (passwordChangeRequired) {
    return { profile: null, setupRequired: false, mustChangePassword: true };
  }

  const { data } = await supabase
    .from("profiles")
    .select("id,email,employee_no,full_name,app_role,department_id,is_active,departments(department_name)")
    .eq("id", userId)
    .maybeSingle<ProfileQueryRow>();

  if (!data) {
    return { profile: null, setupRequired: false, mustChangePassword: passwordChangeRequired };
  }

  return {
    profile: {
      id: data.id,
      email: data.email,
      employee_no: data.employee_no,
      full_name: data.full_name,
      app_role: data.app_role,
      department_id: data.department_id,
      department_name: data.departments?.department_name ?? null,
      is_active: data.is_active
    },
    setupRequired: false,
    mustChangePassword: false
  };
});

export type ActiveProfile = ProfileSummary & { app_role: NonNullable<ProfileSummary["app_role"]> };

// 승인 대기·비활성 계정도 Auth 로는 로그인되므로, 서버 액션은 로그인 여부가 아니라
// 활성 상태와 역할 지정 여부까지 확인한다. (DB 의 current_app_role() 이 NULL 인 계정과 같은 기준)
export async function requireActiveProfile(): Promise<
  { profile: ActiveProfile; error: null } | { profile: null; error: string }
> {
  const state = await getCurrentUserProfile();
  const error = getProfileAccessError(state);
  const { profile } = state;
  if (error || !profile || !profile.app_role) {
    return { profile: null, error: error ?? "로그인이 필요합니다." };
  }
  return { profile: { ...profile, app_role: profile.app_role }, error: null };
}
