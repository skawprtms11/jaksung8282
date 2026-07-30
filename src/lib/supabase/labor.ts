import { createClient } from "@supabase/supabase-js";

export type LaborCenterRow = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  memo: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
};

type LaborDatabase = {
  public: {
    Tables: {
      centers: {
        Row: LaborCenterRow;
        Insert: Partial<LaborCenterRow>;
        Update: Partial<LaborCenterRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export function createLaborSupabaseClient() {
  const url = process.env.LABOR_SUPABASE_URL;
  const serviceRoleKey = process.env.LABOR_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("노임마감시스템 Supabase 환경변수가 설정되지 않았습니다.");
  }

  return createClient<LaborDatabase>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
