"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, CalendarDays, ClipboardCheck, FileText, Hammer } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type MeetingTabValue = "collection" | "materials" | "volumes" | "holiday" | "facility";

type MeetingTabItem = {
  value: MeetingTabValue;
  label: string;
  href: string;
};

const iconMap = {
  collection: ClipboardCheck,
  materials: FileText,
  volumes: BarChart3,
  holiday: CalendarDays,
  facility: Hammer
} satisfies Record<MeetingTabValue, typeof ClipboardCheck>;

export function MeetingMaterialsTabNav({
  tabs,
  activeTab
}: {
  tabs: MeetingTabItem[];
  activeTab: MeetingTabValue;
}) {
  const router = useRouter();

  return (
    <nav className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-[1rem] bg-[#f5f9ff] p-1 lg:grid-cols-5" aria-label="회의자료 화면 탭">
      {tabs.map((tab) => {
        const Icon = iconMap[tab.value];
        const isSelected = activeTab === tab.value;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            prefetch={false}
            scroll={false}
            onFocus={() => router.prefetch(tab.href)}
            onMouseEnter={() => router.prefetch(tab.href)}
            onTouchStart={() => router.prefetch(tab.href)}
            className={cn(
              "relative flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-extrabold tracking-normal transition",
              isSelected
                ? "bg-white text-[#075be8] shadow-[0_8px_18px_rgba(7,91,232,0.12)]"
                : "text-slate-500 hover:bg-white/70 hover:text-[#10223d]"
            )}
            aria-current={isSelected ? "page" : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
            {isSelected ? (
              <span className="absolute bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-[#075be8]" aria-hidden="true" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
