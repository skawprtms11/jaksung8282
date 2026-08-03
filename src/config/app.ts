export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "TPL사업부 주간자료 시스템",
  timezone: process.env.APP_TIMEZONE ?? "Asia/Seoul"
} as const;

export const protectedRoutes = [
  "/mobile",
  "/notices",
  "/meeting-materials",
  "/department-reports",
  "/client-reports",
  "/admin"
] as const;

export const adminRoutes = ["/admin/departments", "/admin/clients", "/admin/users"] as const;
