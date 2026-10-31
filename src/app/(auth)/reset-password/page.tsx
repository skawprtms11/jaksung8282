import Link from "next/link";
import { signOutAction } from "@/actions/auth";
import { ResetPasswordForm, type ResetPasswordMode } from "@/components/auth/ResetPasswordForm";
import { isRecoverySession, mustChangePassword } from "@/lib/auth/password-change";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DESCRIPTIONS: Record<ResetPasswordMode, string> = {
  request: "등록된 이메일로 재설정 안내를 발송합니다.",
  recovery: "새 비밀번호를 입력하세요.",
  forced: "관리자가 발급한 임시 비밀번호로 로그인했습니다. 임시 비밀번호를 확인한 뒤 새 비밀번호로 변경하세요.",
  change: "현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다."
};

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const [
    {
      data: { user }
    },
    claimsResult
  ] = supabase
    ? await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()])
    : [{ data: { user: null } }, null];
  const claims = claimsResult?.data?.claims;
  const mode: ResetPasswordMode = !user
    ? "request"
    : isRecoverySession(claims)
      ? "recovery"
      : mustChangePassword(user)
        ? "forced"
        : "change";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-[1.5rem] border border-white/80 bg-white/86 p-8 shadow-[0_24px_70px_rgba(16,34,61,0.14)] backdrop-blur-2xl">
        <div className="mb-3 h-1 w-14 rounded bg-[#007050]" />
        <h1 className="text-2xl font-black text-[#012241]">{mode === "request" || mode === "recovery" ? "비밀번호 재설정" : "비밀번호 변경"}</h1>
        <p className="mt-2 text-sm text-[#6b7280]">{DESCRIPTIONS[mode]}</p>
        <div className="mt-6">
          <ResetPasswordForm mode={mode} />
        </div>
        {mode === "forced" ? (
          <form action={signOutAction} className="mt-4">
            <button type="submit" className="text-sm font-bold text-[#007050]">
              로그아웃
            </button>
          </form>
        ) : (
          <Link href="/login" className="mt-4 block text-sm font-bold text-[#007050]">
            로그인으로 돌아가기
          </Link>
        )}
      </section>
    </main>
  );
}
