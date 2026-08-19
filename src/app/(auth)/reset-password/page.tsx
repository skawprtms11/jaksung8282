import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const canUpdatePassword = Boolean(user);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-[1.5rem] border border-white/80 bg-white/86 p-8 shadow-[0_24px_70px_rgba(16,34,61,0.14)] backdrop-blur-2xl">
        <div className="mb-3 h-1 w-14 rounded bg-[#007050]" />
        <h1 className="text-2xl font-black text-[#012241]">비밀번호 재설정</h1>
        <p className="mt-2 text-sm text-[#6b7280]">등록된 이메일로 재설정 안내를 발송합니다.</p>
        <div className="mt-6">
          <ResetPasswordForm canUpdatePassword={canUpdatePassword} />
        </div>
        <Link href="/login" className="mt-4 block text-sm font-bold text-[#007050]">
          로그인으로 돌아가기
        </Link>
      </section>
    </main>
  );
}
