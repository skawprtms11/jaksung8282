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

export type MeetingTabValue = "collection" | "materials" | "volumes" | "holiday" | "facility";

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

function MeetingTabIcon({ icon: Icon, pending: pendingOverride }: { icon: typeof ClipboardCheck; pending?: boolean }) {
  const { pending } = useLinkStatus();
  return pendingOverride || pending ? (
    <LoaderCircle className={cn(REPORT_TAB_ICON_CLASS_NAME, "animate-spin")} aria-hidden="true" />
  ) : (
    <Icon className={REPORT_TAB_ICON_CLASS_NAME} aria-hidden="true" />
  );
}

export function MeetingMaterialsTabNav({
  tabs,
  activeTab,
  pendingTab,
  onTabSelect,
  onTabIntent
}: {
  tabs: MeetingTabItem[];
  activeTab: MeetingTabValue;
  pendingTab?: MeetingTabValue | null;
  onTabSelect?: (tab: MeetingTabValue, href: string) => void;
  onTabIntent?: (tab: MeetingTabValue, href: string) => void;
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
            prefetch={!onTabSelect}
            scroll={false}
            onClick={(event) => {
              if (!onTabSelect || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onTabSelect(tab.value, tab.href);
            }}
            onFocus={() => {
              prewarmMeetingTabModules();
              onTabIntent?.(tab.value, tab.href);
            }}
            onMouseEnter={() => {
              prewarmMeetingTabModules();
              onTabIntent?.(tab.value, tab.href);
            }}
            onTouchStart={prewarmMeetingTabModules}
            className={cn(
              REPORT_TAB_ITEM_CLASS_NAME,
              isSelected ? REPORT_TAB_ACTIVE_CLASS_NAME : REPORT_TAB_IDLE_CLASS_NAME
            )}
            aria-current={isSelected ? "page" : undefined}
          >
            <MeetingTabIcon icon={Icon} pending={pendingTab === tab.value} />
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
