"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { WeekSelect } from "@/components/reports/WeekSelect";
import type { WeekOption } from "@/lib/dates/week";

export function MeetingMaterialsWeekFilter({ defaultWeekStartDate }: { defaultWeekStartDate: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function moveToWeek(week: WeekOption) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("report_year", String(week.year));
    nextParams.set("report_month", String(week.month));
    nextParams.set("week_of_month", String(week.weekOfMonth));
    nextParams.set("week_start_date", week.weekStartDate);
    nextParams.set("week_end_date", week.weekEndDate);

    startTransition(() => {
      router.replace(`/meeting-materials?${nextParams.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="rounded-full border border-[#dbe8fb] bg-white/90 px-2 py-1.5 shadow-[0_10px_22px_rgba(16,34,61,0.05)]">
        <WeekSelect
          key={defaultWeekStartDate}
          defaultWeekStartDate={defaultWeekStartDate}
          compactWeekLabel
          onSelectionChange={moveToWeek}
          className="flex flex-wrap items-center gap-1.5"
          labelClassName="flex items-center gap-1 text-[11px] font-black text-slate-500"
          weekLabelClassName="flex items-center gap-1 text-[11px] font-black text-slate-500"
          controlClassName="h-8 w-[78px] rounded-full border border-[#d7e4f6] bg-[#f5f9ff] px-2 text-sm font-black text-[#10223d] outline-none"
        />
      </div>
      {isPending ? (
        <span className="inline-flex h-9 items-center gap-1 rounded-full border border-[#dbe8fb] bg-white/90 px-3 text-xs font-black text-[#075be8]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          조회 중
        </span>
      ) : null}
    </div>
  );
}
