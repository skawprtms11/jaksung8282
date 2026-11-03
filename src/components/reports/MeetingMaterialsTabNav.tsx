"use client";

import Link, { useLinkStatus } from "next/link";
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

// 유휴 시 탭 모듈을 한꺼번에 받지 않고, 마우스를 올리거나 포커스한 탭의 모듈만 미리 받는다.
const meetingTabModuleLoaders: Record<MeetingTabValue, () => Promise<unknown>[]> = {
  collection: () => [import("@/components/reports/MeetingPriorityPanel")],
  materials: () => [import("@/components/reports/MeetingMaterialsTable")],
  volumes: () => [
    import("@/components/charts/VolumeComparisonChart"),
    import("@/components/reports/MeetingDepartmentVolumeBoard")
  ],
  holiday: () => [import("@/components/reports/MeetingHolidayWorkBoard")],
  facility: () => [import("@/components/reports/MeetingFacilityConstructionBoard")]
};
const prewarmedMeetingTabs = new Set<MeetingTabValue>();

function prewarmMeetingTabModule(tab: MeetingTabValue) {
  if (prewarmedMeetingTabs.has(tab)) {
    return;
  }
  prewarmedMeetingTabs.add(tab);
  void Promise.all(meetingTabModuleLoaders[tab]());
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
              prewarmMeetingTabModule(tab.value);
              onTabIntent?.(tab.value, tab.href);
            }}
            onMouseEnter={() => {
              prewarmMeetingTabModule(tab.value);
              onTabIntent?.(tab.value, tab.href);
            }}
            onTouchStart={() => prewarmMeetingTabModule(tab.value)}
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
