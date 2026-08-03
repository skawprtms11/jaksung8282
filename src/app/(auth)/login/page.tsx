import { LoginForm } from "@/components/auth/LoginForm";
import { LogisticsIllustration } from "@/components/common/LogisticsIllustration";
import { appConfig } from "@/config/app";
import { normalizeAuthRedirect } from "@/lib/auth/redirect";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DepartmentOption = { id: string; department_name: string };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string; mode?: string }> }) {
  const params = await searchParams;
  const redirectTo = normalizeAuthRedirect(params.redirectTo);
  const isMobileLogin = params.mode === "mobile" || redirectTo.startsWith("/mobile");
  let departments: DepartmentOption[] = [];
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("departments")
      .select("id,department_name")
      .eq("is_active", true)
      .order("sort_order");
    departments = (data ?? []) as DepartmentOption[];
  } catch {
    departments = [];
  }
  return (
    <main className={isMobileLogin ? "min-h-dvh bg-white" : "min-h-dvh bg-white md:flex md:min-h-screen md:items-center md:justify-center md:bg-transparent md:px-4 md:py-10"}>
      <section className={isMobileLogin ? "mx-auto w-full max-w-md overflow-hidden bg-white" : "w-full overflow-hidden bg-white md:grid md:max-w-6xl md:grid-cols-[1fr_420px] md:rounded-[2rem] md:border md:border-white/80 md:bg-white/78 md:p-3 md:shadow-[0_30px_90px_rgba(16,34,61,0.16)] md:backdrop-blur-2xl"}>
        <LogisticsIllustration mobileMode={isMobileLogin} />
        <div className={isMobileLogin ? "flex flex-col justify-center bg-white px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6" : "flex flex-col justify-center bg-white px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 md:rounded-[1.5rem] md:bg-white/90 md:p-7 md:backdrop-blur"}>
          <div className={isMobileLogin ? "hidden" : "hidden md:block"}>
            <p className="text-xs font-black uppercase tracking-[0.32em] text-[#075be8]">TPL Logistics</p>
            <h1 className="mt-3 text-3xl font-black tracking-normal text-[#10223d]">{appConfig.name}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">주간 업무, 물동량, 승인 흐름을 한 곳에서 연결합니다.</p>
          </div>
          <div className={isMobileLogin ? "" : "md:mt-6"}>
            <LoginForm redirectTo={redirectTo} departments={departments} />
          </div>
        </div>
      </section>
    </main>
  );
}
