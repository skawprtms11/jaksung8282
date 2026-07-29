import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
}> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { profile: null, setupRequired: true };
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  const userId = session?.user.id;
  if (!userId) {
    return { profile: null, setupRequired: false };
  }

  const { data } = await supabase
    .from("profiles")
    .select("id,email,employee_no,full_name,app_role,department_id,is_active,departments(department_name)")
    .eq("id", userId)
    .maybeSingle<ProfileQueryRow>();

  if (!data) {
    return { profile: null, setupRequired: false };
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
    setupRequired: false
  };
});
