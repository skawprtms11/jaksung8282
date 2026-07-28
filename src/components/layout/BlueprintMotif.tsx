import { Boxes, CalendarDays, CheckCircle2, ClipboardPenLine, RadioTower, Truck } from "lucide-react";

export function BlueprintMotif({ compact = false }: { compact?: boolean }) {
  const icons = compact
    ? [
        { icon: Boxes, label: "물동량" },
        { icon: CheckCircle2, label: "승인" },
        { icon: Truck, label: "운영" }
      ]
    : [
        { icon: CalendarDays, label: "주차" },
        { icon: RadioTower, label: "연결" },
        { icon: ClipboardPenLine, label: "작성" },
        { icon: Boxes, label: "물동량" },
        { icon: CheckCircle2, label: "승인" },
        { icon: Truck, label: "운영" }
      ];

  return (
    <div className="pointer-events-none hidden items-center gap-2 lg:flex" aria-hidden="true">
      {icons.map((item, index) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[#dbe8fb] bg-white/84 shadow-[0_12px_24px_rgba(7,91,232,0.08)]">
              <Icon className="h-4 w-4 text-[#075be8]" />
            </div>
            {index < icons.length - 1 ? <span className="h-0.5 w-4 rounded bg-[#075be8]/18" /> : null}
          </div>
        );
      })}
    </div>
  );
}
