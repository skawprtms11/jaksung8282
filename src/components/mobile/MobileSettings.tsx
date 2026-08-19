import { Building2, CheckCircle2, Mail, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { signOutAction } from "@/actions/auth";
import { roleLabel, type ProfileSummary } from "@/lib/auth/permissions";

export function MobileSettings({ profile, departmentName, clients }: {
  profile: ProfileSummary;
  departmentName: string;
  clients: { id: string; client_name: string }[];
}) {
  return <div className="space-y-3">
    <section className="border-y border-[#e7ddcd] bg-white px-4 py-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e6f1ec] text-[#007050]"><UserRound className="h-6 w-6" /></span>
        <div className="min-w-0"><h2 className="truncate text-lg font-black">{profile.full_name}</h2><p className="text-xs font-bold text-slate-500">{roleLabel(profile.app_role)}</p></div>
        <CheckCircle2 className="ml-auto h-5 w-5 text-emerald-600" aria-label="활성 계정" />
      </div>
    </section>

    <section className="divide-y divide-slate-100 border-y border-[#e7ddcd] bg-white">
      <SettingRow icon={Building2} label="소속부서" value={departmentName} />
      <SettingRow icon={Mail} label="이메일" value={profile.email} />
      <SettingRow icon={ShieldCheck} label="가입정보" value={`${roleLabel(profile.app_role)} · ${profile.employee_no || "사번 미등록"}`} />
    </section>

    <section className="border-y border-[#e7ddcd] bg-white">
      <div className="flex items-center gap-2 px-4 py-3"><UsersRound className="h-5 w-5 text-[#007050]" /><div><h2 className="text-sm font-black">관리 가능한 화주</h2><p className="text-[11px] font-bold text-slate-500">현재 계정에 연결된 화주 목록입니다.</p></div><span className="ml-auto rounded-full bg-[#e6f1ec] px-2 py-1 text-[11px] font-black text-[#007050]">{clients.length}</span></div>
      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {clients.length ? clients.map((client) => <div key={client.id} className="px-4 py-3 text-sm font-black">{client.client_name}</div>) : <p className="px-4 py-6 text-center text-xs font-bold text-slate-400">연결된 화주가 없습니다.</p>}
      </div>
    </section>

    <form action={signOutAction} className="px-1 pt-2"><input type="hidden" name="redirectTo" value="/mobile" /><button type="submit" className="h-11 w-full rounded-md border border-rose-200 bg-white text-sm font-black text-rose-600">로그아웃</button></form>
  </div>;
}

function SettingRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return <div className="flex items-center gap-3 px-4 py-3"><Icon className="h-5 w-5 shrink-0 text-slate-400" /><span className="text-xs font-black text-slate-500">{label}</span><span className="ml-auto max-w-[62%] truncate text-right text-sm font-black text-[#012241]">{value}</span></div>;
}
