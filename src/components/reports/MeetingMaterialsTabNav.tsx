"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

export function MeetingMaterialsTabNav({
  tabs,
  activeTab
}: {
  tabs: MeetingTabItem[];
  activeTab: MeetingTabValue;
}) {
  const router = useRouter();
  const [pendingTab, setPendingTab] = useState<MeetingTabValue | null>(null);
  const [isNavigating, startNavigation] = useTransition();
  const prioritizedHrefs = useMemo(() => {
    const activeIndex = tabs.findIndex((tab) => tab.value === activeTab);
    const priorityIndexes = [activeIndex + 1, activeIndex - 1, ...tabs.map((_, index) => index)];
    return Array.from(new Set(priorityIndexes))
      .filter((index) => index >= 0 && index < tabs.length && index !== activeIndex)
      .map((index) => tabs[index].href);
  }, [activeTab, tabs]);

  useEffect(() => {
    const timers: number[] = [];
    const startPrefetch = () => {
      prewarmMeetingTabModules();
      prioritizedHrefs.forEach((href, index) => {
        timers.push(window.setTimeout(() => router.prefetch(href), 100 + index * 450));
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(startPrefetch, { timeout: 700 });
      return () => {
        window.cancelIdleCallback(idleId);
        timers.forEach((timer) => window.clearTimeout(timer));
      };
    }

    const timeoutId = window.setTimeout(startPrefetch, 250);
    return () => {
      window.clearTimeout(timeoutId);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [prioritizedHrefs, router]);

  return (
    <nav className={REPORT_TAB_NAV_CLASS_NAME} aria-label="회의자료 화면 탭">
      {tabs.map((tab) => {
        const Icon = iconMap[tab.value];
        const isSelected = (isNavigating ? pendingTab : null) === tab.value || (!isNavigating && activeTab === tab.value);
        const isPending = isNavigating && pendingTab === tab.value;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            prefetch={false}
            scroll={false}
            onFocus={() => router.prefetch(tab.href)}
            onMouseEnter={() => router.prefetch(tab.href)}
            onTouchStart={() => router.prefetch(tab.href)}
            onClick={(event) => {
              if (
                tab.value === activeTab ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              setPendingTab(tab.value);
              startNavigation(() => router.push(tab.href, { scroll: false }));
            }}
            className={cn(
              REPORT_TAB_ITEM_CLASS_NAME,
              isSelected ? REPORT_TAB_ACTIVE_CLASS_NAME : REPORT_TAB_IDLE_CLASS_NAME
            )}
            aria-current={isSelected ? "page" : undefined}
          >
            {isPending ? (
              <LoaderCircle className={cn(REPORT_TAB_ICON_CLASS_NAME, "animate-spin")} aria-hidden="true" />
            ) : (
              <Icon className={REPORT_TAB_ICON_CLASS_NAME} aria-hidden="true" />
            )}
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
