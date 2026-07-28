import { LoginForm } from "@/components/auth/LoginForm";
import { LogisticsIllustration } from "@/components/common/LogisticsIllustration";
import { appConfig } from "@/config/app";
import { normalizeAuthRedirect } from "@/lib/auth/redirect";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DepartmentOption = { id: string; department_name: string };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const params = await searchParams;
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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/78 p-3 shadow-[0_30px_90px_rgba(16,34,61,0.16)] backdrop-blur-2xl md:grid-cols-[1fr_420px]">
        <LogisticsIllustration />
        <div className="flex flex-col justify-center rounded-[1.5rem] bg-white/90 p-7 backdrop-blur">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-[#075be8]">TPL Logistics</p>
          <h1 className="mt-3 text-3xl font-black tracking-normal text-[#10223d]">{appConfig.name}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">주간 업무, 물동량, 승인 흐름을 한 곳에서 연결합니다.</p>
          <div className="mt-6">
            <LoginForm redirectTo={normalizeAuthRedirect(params.redirectTo)} departments={departments} />
          </div>
        </div>
      </section>
    </main>
  );
}
