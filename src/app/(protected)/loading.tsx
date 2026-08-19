export default function ProtectedLoading() {
  return (
    <div className="space-y-4">
      <section className="sketch-panel p-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-2xl bg-[#e6f1ec]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded-full bg-[#e6f1ec]" />
            <div className="h-3 w-72 max-w-full animate-pulse rounded-full bg-[#faf6ef]" />
          </div>
        </div>
      </section>
      <section className="sketch-panel p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="h-24 animate-pulse rounded-2xl bg-[#faf6ef]" />
          <div className="h-24 animate-pulse rounded-2xl bg-[#faf6ef]" />
          <div className="h-24 animate-pulse rounded-2xl bg-[#faf6ef]" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-10 animate-pulse rounded-2xl bg-[#faf6ef]" />
          <div className="h-10 animate-pulse rounded-2xl bg-[#faf6ef]" />
          <div className="h-10 animate-pulse rounded-2xl bg-[#faf6ef]" />
        </div>
      </section>
    </div>
  );
}
