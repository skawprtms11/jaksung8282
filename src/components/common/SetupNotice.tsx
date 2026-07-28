export function SetupNotice() {
  return (
    <div className="sketch-panel p-5 text-sm text-[#10223d]">
      <p className="font-black">Supabase 환경변수 설정이 필요합니다.</p>
      <p className="mt-2 leading-6 text-slate-600">
        `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
        `SUPABASE_SERVICE_ROLE_KEY`를 설정한 뒤 migration을 적용하세요.
      </p>
    </div>
  );
}
