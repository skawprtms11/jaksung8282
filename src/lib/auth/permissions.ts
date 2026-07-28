import type { AppRole, ClientReportStatus, DepartmentSubmissionStatus } from "@/types/enums";

export type ProfileSummary = {
  id: string;
  full_name: string;
  email: string;
  employee_no?: string;
  app_role: AppRole;
  department_id: string | null;
  department_name?: string | null;
  is_active: boolean;
};

export function roleLabel(role: AppRole) {
  const labels: Record<AppRole, string> = {
    admin: "관리자",
    department_head: "부서장",
    manager: "매니저",
    client_owner: "화주담당자"
  };
  return labels[role];
}

export function isAdmin(profile: Pick<ProfileSummary, "app_role"> | null) {
  return profile?.app_role === "admin";
}

export function canManageMasters(profile: Pick<ProfileSummary, "app_role"> | null) {
  return profile?.app_role === "admin";
}

export function canViewDepartmentMaster(profile: Pick<ProfileSummary, "app_role"> | null) {
  return profile?.app_role === "admin" || profile?.app_role === "department_head" || profile?.app_role === "manager";
}

export function canRegisterDepartmentClients(profile: Pick<ProfileSummary, "app_role"> | null) {
  return profile?.app_role === "admin" || profile?.app_role === "department_head" || profile?.app_role === "manager";
}

export function canReviewClientReport(profile: Pick<ProfileSummary, "app_role"> | null) {
  return profile?.app_role === "admin" || profile?.app_role === "department_head" || profile?.app_role === "manager";
}

export function canSubmitDepartment(profile: Pick<ProfileSummary, "app_role"> | null) {
  return profile?.app_role === "admin" || profile?.app_role === "department_head";
}

export function canEditClientReport(role: AppRole, status: ClientReportStatus) {
  if (role === "admin" || role === "department_head" || role === "manager") {
    return status !== "approved";
  }
  return status === "draft" || status === "rejected";
}

export function canEditDepartmentSubmission(role: AppRole, status: DepartmentSubmissionStatus) {
  if (role === "admin") {
    return status !== "division_approved";
  }
  if (role === "department_head" || role === "manager") {
    return status === "draft" || status === "division_rejected";
  }
  return false;
}

export const clientReportTransitions: Record<ClientReportStatus, ClientReportStatus[]> = {
  draft: ["submitted"],
  submitted: ["draft", "approved", "rejected"],
  approved: ["submitted", "draft"],
  rejected: ["draft", "submitted"]
};

export const departmentSubmissionTransitions: Record<DepartmentSubmissionStatus, DepartmentSubmissionStatus[]> = {
  draft: ["submitted_to_division"],
  submitted_to_division: ["division_approved", "division_rejected"],
  division_approved: ["draft"],
  division_rejected: ["draft", "submitted_to_division"]
};

export function isAllowedClientTransition(previous: ClientReportStatus, next: ClientReportStatus) {
  return clientReportTransitions[previous].includes(next);
}

export function isAllowedDepartmentTransition(previous: DepartmentSubmissionStatus, next: DepartmentSubmissionStatus) {
  return departmentSubmissionTransitions[previous].includes(next);
}
