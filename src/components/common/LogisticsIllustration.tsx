import { Boxes, ChartNoAxesCombined, Globe2, History, Radar } from "lucide-react";

export function LogisticsIllustration({ mobileMode = false }: { mobileMode?: boolean }) {
  if (mobileMode) {
    return (
      <div className="relative min-h-[250px] overflow-hidden bg-[#ece3d4] p-5 text-[#012241]" aria-label="스마트 물류센터 자동화 이미지" role="img">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.78)_24%,rgba(255,255,255,0.12)_62%,rgba(0, 112, 80,0.10)_100%)]" />
        <div className="absolute inset-y-0 right-0 w-[72%] bg-[linear-gradient(90deg,transparent,rgba(16,34,61,0.05))]" />
        <div className="absolute right-4 top-4 grid h-[78%] w-[64%] grid-cols-4 gap-2 opacity-75">
          {Array.from({ length: 20 }).map((_, index) => (
            <div key={index} className="rounded-md border border-[#012241]/10 bg-white/45 shadow-[0_10px_28px_rgba(16,34,61,0.08)]">
              <div className="mx-auto mt-4 h-8 w-14 rounded-sm bg-[#c99553]/65" />
              <div className="mx-auto mt-2 h-2 w-12 rounded bg-[#012241]/12" />
            </div>
          ))}
        </div>
        <div className="relative flex min-h-[210px] items-end pb-5">
          <h2 className="text-[28px] font-black leading-tight tracking-normal text-[#012241]">
            <span className="block">TPL사업부</span>
            <span className="mt-1 block">주간자료 시스템</span>
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-[250px] overflow-hidden bg-[#ece3d4] p-5 text-[#012241] md:min-h-[520px] md:rounded-[1.6rem] md:p-7"
      aria-label="스마트 물류센터 자동화 이미지"
      role="img"
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.78)_24%,rgba(255,255,255,0.12)_62%,rgba(0, 112, 80,0.10)_100%)]" />
      <div className="absolute inset-y-0 right-0 w-[72%] bg-[radial-gradient(circle_at_62%_24%,rgba(47, 174, 102,0.22),transparent_18rem),linear-gradient(90deg,transparent,rgba(16,34,61,0.05))]" />
      <div className="absolute right-4 top-4 grid h-[78%] w-[64%] grid-cols-4 gap-2 opacity-75 md:right-8 md:top-8 md:h-[72%] md:w-[52%] md:gap-3 md:opacity-85">
        {Array.from({ length: 20 }).map((_, index) => (
          <div key={index} className="rounded-md border border-[#012241]/10 bg-white/45 shadow-[0_10px_28px_rgba(16,34,61,0.08)]">
            <div className="mx-auto mt-4 h-8 w-14 rounded-sm bg-[#c99553]/65" />
            <div className="mx-auto mt-2 h-2 w-12 rounded bg-[#012241]/12" />
          </div>
        ))}
      </div>
      <div className="absolute bottom-20 right-8 h-10 w-[50%] rounded-full bg-[#012241]/10 blur-xl" />
      <div className="absolute bottom-12 right-16 hidden gap-5 md:flex">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-16 w-28 rounded-2xl border border-white/75 bg-white/75 shadow-[0_18px_36px_rgba(0, 112, 80,0.16)]">
            <div className="mx-auto mt-3 h-3 w-16 rounded-full bg-[#007050]" />
            <div className="mx-auto mt-4 h-5 w-20 rounded bg-[#012241]/10" />
          </div>
        ))}
      </div>
      <div className="absolute right-5 top-8 hidden rounded-2xl border border-[#2fae66]/40 bg-[#012241]/80 p-4 text-white shadow-[0_20px_50px_rgba(0, 112, 80,0.24)] backdrop-blur md:right-16 md:top-32 md:block">
        <div className="flex items-center gap-2 text-xs font-bold text-[#7fdcae]">
          <Radar className="h-4 w-4" aria-hidden="true" />
          WAREHOUSE LIVE
        </div>
        <div className="mt-4 flex h-20 items-end gap-2">
          {[36, 54, 42, 70, 62, 84, 76].map((height, index) => (
            <span key={index} className="w-3 rounded-t bg-[#2fae66]" style={{ height }} />
          ))}
        </div>
      </div>
      <div className="relative flex min-h-[210px] max-w-xl items-end pb-5 md:block md:min-h-0 md:pt-16">
        <h2 className="text-[28px] font-black leading-tight tracking-normal text-[#012241] md:hidden">
          <span className="block">TPL사업부</span>
          <span className="mt-1 block">주간자료 시스템</span>
        </h2>
        <h2 className="mt-14 hidden text-5xl font-black leading-tight tracking-normal text-[#012241] md:block">
          TPL Weekly
          <span className="block text-[#007050]">Hub System</span>
        </h2>
      </div>
      <div className="absolute bottom-7 left-7 right-7 hidden gap-3 rounded-[1.5rem] border border-white/80 bg-white/82 p-5 shadow-[0_24px_60px_rgba(16,34,61,0.14)] backdrop-blur-xl md:grid md:grid-cols-4">
          {[
            { icon: Globe2, label: "부서 연결", value: "Hub" },
            { icon: Boxes, label: "물동량", value: "Live" },
            { icon: History, label: "이력관리", value: "History" },
            { icon: ChartNoAxesCombined, label: "회의자료", value: "Weekly" }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-3 border-[#e7ddcd] md:border-r md:last:border-r-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e6f1ec] text-[#007050]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs font-bold text-slate-500">{item.label}</span>
                  <span className="mt-1 block text-xl font-black text-[#012241]">{item.value}</span>
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
