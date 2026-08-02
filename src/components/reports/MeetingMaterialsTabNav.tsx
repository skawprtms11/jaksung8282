"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect } from "react";
import { BarChart3, CalendarDays, ClipboardCheck, FileText, Hammer, LoaderCircle } from "lucide-react";
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

let meetingTabModulesPrewarmed = false;

function prewarmMeetingTabModules() {
  if (meetingTabModulesPrewarmed) {
    return;
  }
  meetingTabModulesPrewarmed = true;
  void Promise.all([
    import("@/components/reports/MeetingPriorityPanel"),
    import("@/components/reports/MeetingMaterialsTable"),
    import("@/components/charts/VolumeComparisonChart"),
    import("@/components/reports/MeetingDepartmentVolumeBoard"),
    import("@/components/reports/MeetingHolidayWorkBoard"),
    import("@/components/reports/MeetingFacilityConstructionBoard")
  ]);
}

function MeetingTabIcon({ icon: Icon }: { icon: typeof ClipboardCheck }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <LoaderCircle className={cn(REPORT_TAB_ICON_CLASS_NAME, "animate-spin")} aria-hidden="true" />
  ) : (
    <Icon className={REPORT_TAB_ICON_CLASS_NAME} aria-hidden="true" />
  );
}

export function MeetingMaterialsTabNav({
  tabs,
  activeTab
}: {
  tabs: MeetingTabItem[];
  activeTab: MeetingTabValue;
}) {
  useEffect(() => {
    const startPrefetch = () => {
      prewarmMeetingTabModules();
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(startPrefetch, { timeout: 700 });
      return () => {
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(startPrefetch, 250);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <nav className={REPORT_TAB_NAV_CLASS_NAME} aria-label="회의자료 화면 탭">
      {tabs.map((tab) => {
        const Icon = iconMap[tab.value];
        const isSelected = activeTab === tab.value;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            prefetch
            scroll={false}
            onFocus={prewarmMeetingTabModules}
            onMouseEnter={prewarmMeetingTabModules}
            onTouchStart={prewarmMeetingTabModules}
            className={cn(
              REPORT_TAB_ITEM_CLASS_NAME,
              isSelected ? REPORT_TAB_ACTIVE_CLASS_NAME : REPORT_TAB_IDLE_CLASS_NAME
            )}
            aria-current={isSelected ? "page" : undefined}
          >
            <MeetingTabIcon icon={Icon} />
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
