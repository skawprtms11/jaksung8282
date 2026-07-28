import { ArrowUpRight, Boxes, ChartNoAxesCombined, Globe2, PackageCheck, Radar, Truck } from "lucide-react";

export function LogisticsIllustration() {
  return (
    <div
      className="relative min-h-[520px] overflow-hidden rounded-[1.6rem] bg-[#dceafa] p-7 text-[#10223d]"
      aria-label="스마트 물류센터 자동화 이미지"
      role="img"
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.78)_24%,rgba(255,255,255,0.12)_62%,rgba(7,91,232,0.10)_100%)]" />
      <div className="absolute inset-y-0 right-0 w-[72%] bg-[radial-gradient(circle_at_62%_24%,rgba(36,168,255,0.22),transparent_18rem),linear-gradient(90deg,transparent,rgba(16,34,61,0.05))]" />
      <div className="absolute right-8 top-8 grid h-[72%] w-[52%] grid-cols-4 gap-3 opacity-85">
        {Array.from({ length: 20 }).map((_, index) => (
          <div key={index} className="rounded-md border border-[#0b2d5f]/10 bg-white/45 shadow-[0_10px_28px_rgba(16,34,61,0.08)]">
            <div className="mx-auto mt-4 h-8 w-14 rounded-sm bg-[#c99553]/65" />
            <div className="mx-auto mt-2 h-2 w-12 rounded bg-[#0b2d5f]/12" />
          </div>
        ))}
      </div>
      <div className="absolute bottom-20 right-8 h-10 w-[50%] rounded-full bg-[#10223d]/10 blur-xl" />
      <div className="absolute bottom-12 right-16 flex gap-5">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-16 w-28 rounded-2xl border border-white/75 bg-white/75 shadow-[0_18px_36px_rgba(7,91,232,0.16)]">
            <div className="mx-auto mt-3 h-3 w-16 rounded-full bg-[#075be8]" />
            <div className="mx-auto mt-4 h-5 w-20 rounded bg-[#10223d]/10" />
          </div>
        ))}
      </div>
      <div className="absolute right-16 top-32 rounded-2xl border border-[#72c8ff]/40 bg-[#0b2d5f]/80 p-4 text-white shadow-[0_20px_50px_rgba(7,91,232,0.24)] backdrop-blur">
        <div className="flex items-center gap-2 text-xs font-bold text-[#90d8ff]">
          <Radar className="h-4 w-4" aria-hidden="true" />
          WAREHOUSE LIVE
        </div>
        <div className="mt-4 flex h-20 items-end gap-2">
          {[36, 54, 42, 70, 62, 84, 76].map((height, index) => (
            <span key={index} className="w-3 rounded-t bg-[#24a8ff]" style={{ height }} />
          ))}
        </div>
      </div>
      <div className="relative max-w-xl pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/82 px-4 py-2 text-sm font-bold text-[#10223d] shadow-[0_12px_28px_rgba(16,34,61,0.08)]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#075be8]" />
          Global Logistics Partner
        </span>
        <h2 className="mt-14 text-5xl font-black leading-tight tracking-normal text-[#10223d]">
          Logistics that
          <span className="block text-[#075be8]">Moves Weekly Data</span>
        </h2>
        <p className="mt-6 max-w-sm text-base leading-7 text-slate-600">
          부서, 화주, 물동량 데이터를 연결하여 주간 운영 흐름을 빠르게 확인합니다.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-2 rounded-2xl bg-[#075be8] px-5 py-3 text-sm font-bold text-white shadow-[0_18px_34px_rgba(7,91,232,0.28)]">
            업무 시작
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe8fb] bg-white/86 px-5 py-3 text-sm font-bold text-[#10223d]">
            <Truck className="h-4 w-4" aria-hidden="true" />
            물류 추적
          </span>
        </div>
      </div>
      <div className="absolute bottom-7 left-7 right-7 grid gap-3 rounded-[1.5rem] border border-white/80 bg-white/82 p-5 shadow-[0_24px_60px_rgba(16,34,61,0.14)] backdrop-blur-xl md:grid-cols-4">
          {[
            { icon: Globe2, label: "부서 연결", value: "All" },
            { icon: Boxes, label: "물동량", value: "Live" },
            { icon: PackageCheck, label: "승인흐름", value: "4-Step" },
            { icon: ChartNoAxesCombined, label: "회의자료", value: "Weekly" }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-3 border-[#dbe8fb] md:border-r md:last:border-r-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f1ff] text-[#075be8]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs font-bold text-slate-500">{item.label}</span>
                  <span className="mt-1 block text-xl font-black text-[#10223d]">{item.value}</span>
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
