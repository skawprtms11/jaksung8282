"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, CalendarDays, ClipboardCheck, FileText, Hammer } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  REPORT_TAB_ACTIVE_CLASS_NAME,
  REPORT_TAB_ICON_CLASS_NAME,
  REPORT_TAB_IDLE_CLASS_NAME,
  REPORT_TAB_INDICATOR_CLASS_NAME,
  REPORT_TAB_ITEM_CLASS_NAME,
  REPORT_TAB_NAV_CLASS_NAME
} from "@/components/reports/report-tab-styles";

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
    <nav className={REPORT_TAB_NAV_CLASS_NAME} aria-label="회의자료 화면 탭">
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
              REPORT_TAB_ITEM_CLASS_NAME,
              isSelected ? REPORT_TAB_ACTIVE_CLASS_NAME : REPORT_TAB_IDLE_CLASS_NAME
            )}
            aria-current={isSelected ? "page" : undefined}
          >
            <Icon className={REPORT_TAB_ICON_CLASS_NAME} aria-hidden="true" />
            {tab.label}
            {isSelected ? (
              <span className={REPORT_TAB_INDICATOR_CLASS_NAME} aria-hidden="true" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
