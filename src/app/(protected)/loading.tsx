export default function ProtectedLoading() {
  return (
    <div className="space-y-4">
      <section className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/82 p-4 shadow-[0_14px_34px_rgba(16,34,61,0.06)]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-2xl bg-[#e8f1ff]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-44 animate-pulse rounded-full bg-[#e8f1ff]" />
            <div className="h-3 w-72 max-w-full animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      </section>
      <section className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/82 p-4 shadow-[0_14px_34px_rgba(16,34,61,0.05)]">
            <div className="h-4 w-24 animate-pulse rounded-full bg-[#e8f1ff]" />
            <div className="mt-4 h-16 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        ))}
      </section>
      <section className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/82 p-4 shadow-[0_14px_34px_rgba(16,34,61,0.05)]">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="grid grid-cols-[1fr_1.6fr_1.6fr] gap-3">
              <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
