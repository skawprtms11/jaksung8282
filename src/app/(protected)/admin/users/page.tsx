import { redirect } from "next/navigation";
import { UserMasterControls } from "@/components/masters/MasterForms";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/permissions";
import type { AppRole, UserRegistrationStatus } from "@/types/enums";

type DepartmentOption = { id: string; department_name: string };
type UserRow = {
  id: string;
  email: string;
  employee_no: string;
  full_name: string;
  department_id: string | null;
  app_role: AppRole;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  departments: DepartmentOption | null;
};
type RegistrationRequestRow = {
  id: string;
  email: string;
  employee_no: string;
  full_name: string;
  department_id: string;
  status: UserRegistrationStatus;
  requested_at: string;
  departments: DepartmentOption | null;
};

const USER_MASTER_LIMIT = 200;

export default async function UsersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; department_id?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentUserProfile();
  const canApproveRequests =
    profile?.app_role === "admin" || profile?.app_role === "department_head" || profile?.app_role === "manager";
  if (!canApproveRequests) {
    redirect("/notices?error=forbidden");
  }
  let departments: DepartmentOption[] = [];
  let users: UserRow[] = [];
  let registrationRequests: RegistrationRequestRow[] = [];
  try {
    const supabase = createSupabaseAdminClient();
    const departmentFilter = isAdmin(profile) ? undefined : profile?.department_id ?? undefined;
    const [{ data: departmentData }, { data: userData }] = await Promise.all([
      (() => {
        let query = supabase.from("departments").select("id,department_name").eq("is_active", true).order("sort_order");
        if (departmentFilter) {
          query = query.eq("id", departmentFilter);
        }
        return query;
      })(),
      (() => {
        let query = supabase
          .from("profiles")
          .select("id,email,employee_no,full_name,department_id,app_role,notes,is_active,created_at,updated_at,departments(id,department_name)")
          .order("full_name")
          .limit(USER_MASTER_LIMIT);
        if (departmentFilter) {
          query = query.eq("department_id", departmentFilter);
        }
        if (params.q) {
          query = query.ilike("full_name", `%${params.q}%`);
        }
        if (params.department_id) {
          query = query.eq("department_id", params.department_id);
        }
        return query;
      })()
    ]);
    departments = (departmentData ?? []) as DepartmentOption[];
    users = (userData ?? []) as unknown as UserRow[];
    const { data: requestData } = await (() => {
      let query = supabase
        .from("user_registration_requests")
        .select("id,email,employee_no,full_name,department_id,status,requested_at,departments(id,department_name)")
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(100);
      if (departmentFilter) {
        query = query.eq("department_id", departmentFilter);
      }
      return query;
    })();
    registrationRequests = (requestData ?? []) as unknown as RegistrationRequestRow[];
  } catch {
    departments = [];
    users = [];
    registrationRequests = [];
  }
  return (
    <UserMasterControls
      departments={departments}
      users={users}
      filters={params}
      registrationRequests={registrationRequests}
      canManageUsers={isAdmin(profile)}
    />
  );
}
