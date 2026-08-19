import { PackageOpen } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-[#d3c6b0] bg-white/82 p-8 text-center shadow-[0_18px_42px_rgba(16,34,61,0.07)] backdrop-blur-xl">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e6f1ec]">
        <PackageOpen className="h-6 w-6 text-[#007050]" aria-hidden="true" />
      </span>
      <p className="mt-3 font-bold text-[#012241]">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}
