import { LayoutDashboard } from "lucide-react";

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <section className="mb-5 overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/78 px-5 py-4 shadow-[0_18px_45px_rgba(16,34,61,0.08)] backdrop-blur-2xl">
      <div className="flex min-w-0 items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f1ff] text-[#075be8] shadow-[0_12px_26px_rgba(7,91,232,0.12)]">
          <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-[#075be8]">Operations</p>
          <h2 className="mt-1 text-2xl font-black tracking-normal text-[#10223d]">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p>
        </div>
      </div>
    </section>
  );
}
