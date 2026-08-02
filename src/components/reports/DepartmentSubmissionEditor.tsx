"use client";

import type { ReactNode } from "react";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BarChart3, Building2, CalendarDays, CheckCircle2, ClipboardList, Hammer, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  REPORT_TAB_ACTIVE_CLASS_NAME,
  REPORT_TAB_ICON_CLASS_NAME,
  REPORT_TAB_IDLE_CLASS_NAME,
  REPORT_TAB_INDICATOR_CLASS_NAME,
  REPORT_TAB_ITEM_CLASS_NAME,
  REPORT_TAB_NAV_CLASS_NAME
} from "@/components/reports/report-tab-styles";
import {
  cancelDepartmentSubmissionAction,
  deleteDepartmentVacancyRecordAction,
  loadDepartmentSubmissionAction,
  loadDepartmentVacancyDataAction,
  saveDepartmentSubmissionAction,
  saveDepartmentVacancyRecordAction
} from "@/actions/reports";
import { ActionMessage } from "@/components/common/ActionMessage";
import { cn } from "@/lib/utils/cn";
import { getCurrentWeekOption, type WeekOption } from "@/lib/dates/week";
import { WeekSelect } from "./WeekSelect";
import {
  DEPARTMENT_COMMON_CONTENT_FORMAT,
  filterDepartmentCommonSearchItems,
  hasClientReportSearchFilters,
  parseDepartmentCommonContentItems,
  type ClientReportSearchFilters,
  type DepartmentCommonContentItem
} from "@/lib/reports/client-report-search";
import type { DepartmentSubmissionStatus, Importance } from "@/types/enums";

type Department = { id: string; department_name: string };
type Category = { id: string; category_name: string; icon_key: string };
type CenterOption = { id: string; center_name: string };
type HolidayClientOption = { id: string; client_name: string };
type HolidayWorkerOption = { id: string; full_name: string };
type SectionValue = (typeof sections)[number]["value"];
type DepartmentTabValue = SectionValue | "volume";
type DepartmentContent = {
  section_type: SectionValue;
  current_importance: Importance;
  current_work_category_id: string;
  current_week_content: string;
  next_importance: Importance;
  next_work_category_id: string;
  next_week_content: string;
};
type LoadedDepartmentContent = {
  section_type: SectionValue;
  current_importance?: Importance;
  current_work_category_id?: string | null;
  current_week_content?: string;
  next_importance?: Importance;
  next_work_category_id?: string | null;
  next_week_content?: string;
};
export type DepartmentSubmissionEditorInitialSubmission = {
  id: string;
  department_id: string;
  week_start_date: string;
  status: DepartmentSubmissionStatus;
  finalized_at: string | null;
  department_weekly_contents: LoadedDepartmentContent[];
};
type ContentPeriod = "current" | "next";
type ActiveDialog = { section: SectionValue; period: ContentPeriod } | null;
type FacilityConstructionStatus = "planned" | "in_progress" | "completed";
type FacilityConstructionItem = {
  id: string;
  start_date: string;
  completion_date: string;
  construction_name: string;
  construction_content: string;
  contractor: string;
  construction_amount: string;
  status: FacilityConstructionStatus;
  note: string;
};
type HolidayWorkItem = {
  id: string;
  work_date: string;
  client_name: string;
  worker_names: string[];
  contract_worker_count: string;
  work_reason: string;
  is_billed: boolean;
  note: string;
};
export type DepartmentVacancyRecordValue = {
  id: string;
  department_id: string;
  center_master_id: string;
  center_name: string;
  week_start_date: string;
  week_end_date: string;
  report_year: number;
  report_month: number;
  week_of_month: number;
  operating_area: number;
  simple_storage_area: number;
  vacancy_area: number;
  total_area: number;
  simple_storage_note: string | null;
  vacancy_note: string | null;
  updated_at: string;
};
export type DepartmentVacancyTrendPointValue = {
  center_master_id: string;
  center_name: string;
  week_start_date: string;
  label: string;
  simple_storage_area: number;
  vacancy_area: number;
};
type VacancyDialogState = { mode: "create" | "edit"; item?: DepartmentVacancyRecordValue } | null;
const sections = [
  { value: "common", label: "공통사항", icon: ClipboardList },
  { value: "facility", label: "시설공사", icon: Hammer },
  { value: "vacancy", label: "공실", icon: Building2 },
  { value: "holiday_work", label: "공휴일근무", icon: CalendarDays }
] as const;
const departmentTabs: { value: DepartmentTabValue; label: string; icon: typeof ClipboardList }[] = [
  { value: "common", label: "공통사항", icon: ClipboardList },
  { value: "volume", label: "물동량", icon: BarChart3 },
  { value: "facility", label: "시설공사", icon: Hammer },
  { value: "vacancy", label: "공실", icon: Building2 },
  { value: "holiday_work", label: "공휴일근무", icon: CalendarDays }
];

const importanceOptions: { value: Importance; label: string }[] = [
  { value: "very_high", label: "매우높음" },
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" }
];
const FACILITY_CONTENT_FORMAT = "department-facility-constructions/v1";
const HOLIDAY_WORK_CONTENT_FORMAT = "department-holiday-work/v1";
const facilityStatusOptions: { value: FacilityConstructionStatus; label: string }[] = [
  { value: "planned", label: "예정" },
  { value: "in_progress", label: "진행" },
  { value: "completed", label: "완료" }
];

function makeEmptyContents(firstCategoryId: string): DepartmentContent[] {
  return sections.map((section) => ({
    section_type: section.value,
    current_importance: "medium",
    current_work_category_id: firstCategoryId,
    current_week_content: "",
    next_importance: "medium",
    next_work_category_id: firstCategoryId,
    next_week_content: ""
  }));
}

function normalizeLoadedContents(firstCategoryId: string, loadedContents: LoadedDepartmentContent[] = []): DepartmentContent[] {
  const loadedContentMap = new Map(loadedContents.map((content) => [content.section_type, content]));
  return sections.map((section) => {
    const loaded = loadedContentMap.get(section.value);
    return {
      section_type: section.value,
      current_importance: loaded?.current_importance ?? "medium",
      current_work_category_id: loaded?.current_work_category_id ?? firstCategoryId,
      current_week_content: loaded?.current_week_content ?? "",
      next_importance: loaded?.next_importance ?? "medium",
      next_work_category_id: loaded?.next_work_category_id ?? firstCategoryId,
      next_week_content: loaded?.next_week_content ?? ""
    };
  });
}

function isEditableSubmissionStatus(status: DepartmentSubmissionStatus | null) {
  return status === null || status === "draft" || status === "division_rejected";
}

function isDepartmentContentSection(value: DepartmentTabValue): value is SectionValue {
  return value !== "volume";
}

const CONFIRMATION_CANCEL_WINDOW_DAYS = 3;
const CONFIRMATION_CANCEL_WINDOW_MS = CONFIRMATION_CANCEL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function isPastConfirmationCancelWindow(confirmedAt: string | null) {
  if (!confirmedAt) {
    return false;
  }
  const confirmedTime = new Date(confirmedAt).getTime();
  if (!Number.isFinite(confirmedTime)) {
    return false;
  }
  return Date.now() - confirmedTime > CONFIRMATION_CANCEL_WINDOW_MS;
}

function importanceIconClassName(importance: Importance) {
  if (importance === "very_high") {
    return "border-red-100 bg-red-50 text-red-600";
  }
  if (importance === "high") {
    return "border-orange-100 bg-orange-50 text-orange-500";
  }
  if (importance === "medium") {
    return "border-emerald-100 bg-emerald-50 text-emerald-600";
  }
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function parseCommonContentItems(
  value: string,
  fallbackImportance: Importance,
  fallbackCategoryId: string
): DepartmentCommonContentItem[] {
  return parseDepartmentCommonContentItems(value, fallbackImportance, fallbackCategoryId);
}

function commonDialogItems(value: string, fallbackImportance: Importance, fallbackCategoryId: string): DepartmentCommonContentItem[] {
  const items = parseCommonContentItems(value, fallbackImportance, fallbackCategoryId);
  return items.length > 0
    ? items
    : [{ importance: fallbackImportance, work_category_id: fallbackCategoryId, title: "", content: "", sort_order: 0 }];
}

function serializeCommonContentItems(items: DepartmentCommonContentItem[]) {
  const normalizedItems = items.map((item, index) => ({
    importance: item.importance,
    work_category_id: item.work_category_id,
    title: item.title,
    content: item.content,
    sort_order: index
  }));
  if (normalizedItems.every((item) => item.title.trim().length === 0 && item.content.trim().length === 0)) {
    return "";
  }
  return JSON.stringify({ format: DEPARTMENT_COMMON_CONTENT_FORMAT, items: normalizedItems });
}

function makeLocalId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeEmptyFacilityItem(): FacilityConstructionItem {
  return {
    id: makeLocalId(),
    start_date: "",
    completion_date: "",
    construction_name: "",
    construction_content: "",
    contractor: "",
    construction_amount: "",
    status: "planned",
    note: ""
  };
}

function normalizeFacilityStatus(value: unknown): FacilityConstructionStatus {
  return facilityStatusOptions.some((option) => option.value === value) ? (value as FacilityConstructionStatus) : "planned";
}

function parseFacilityConstructionItems(value: string): FacilityConstructionItem[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue) as {
      format?: string;
      items?: Array<Partial<FacilityConstructionItem>>;
    };
    if (parsed.format === FACILITY_CONTENT_FORMAT && Array.isArray(parsed.items)) {
      return parsed.items.map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : makeLocalId(),
        start_date: String(item.start_date ?? ""),
        completion_date: String(item.completion_date ?? ""),
        construction_name: String(item.construction_name ?? ""),
        construction_content: String(item.construction_content ?? ""),
        contractor: String(item.contractor ?? ""),
        construction_amount: String(item.construction_amount ?? ""),
        status: normalizeFacilityStatus(item.status),
        note: String(item.note ?? "")
      }));
    }
  } catch {
    return [];
  }

  return [];
}

function serializeFacilityConstructionItems(items: FacilityConstructionItem[]) {
  const normalizedItems = items.map((item) => ({
    id: item.id,
    start_date: item.start_date,
    completion_date: item.completion_date,
    construction_name: item.construction_name,
    construction_content: item.construction_content,
    contractor: item.contractor,
    construction_amount: item.construction_amount,
    status: item.status,
    note: item.note
  }));
  if (normalizedItems.length === 0) {
    return "";
  }
  return JSON.stringify({ format: FACILITY_CONTENT_FORMAT, items: normalizedItems });
}

function makeEmptyHolidayWorkItem(): HolidayWorkItem {
  return {
    id: makeLocalId(),
    work_date: "",
    client_name: "공통",
    worker_names: [],
    contract_worker_count: "",
    work_reason: "",
    is_billed: false,
    note: ""
  };
}

function parseHolidayWorkItems(value: string): HolidayWorkItem[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue) as {
      format?: string;
      items?: Array<Partial<HolidayWorkItem>>;
    };
    if (parsed.format === HOLIDAY_WORK_CONTENT_FORMAT && Array.isArray(parsed.items)) {
      return parsed.items.map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : makeLocalId(),
        work_date: String(item.work_date ?? ""),
        client_name: String(item.client_name ?? ""),
        worker_names: Array.isArray(item.worker_names)
          ? item.worker_names.map((workerName) => String(workerName)).filter(Boolean)
          : String((item as { worker_name?: unknown }).worker_name ?? "")
              .split(",")
              .map((workerName) => workerName.trim())
              .filter(Boolean),
        contract_worker_count: String(item.contract_worker_count ?? ""),
        work_reason: String(item.work_reason ?? ""),
        is_billed: Boolean(item.is_billed),
        note: String(item.note ?? "")
      }));
    }
  } catch {
    return [];
  }

  return [];
}

function serializeHolidayWorkItems(items: HolidayWorkItem[]) {
  const normalizedItems = items.map((item) => ({
    id: item.id,
    work_date: item.work_date,
    client_name: item.client_name,
    worker_names: item.worker_names,
    worker_name: item.worker_names.join(", "),
    contract_worker_count: item.contract_worker_count,
    work_reason: item.work_reason,
    is_billed: item.is_billed,
    note: item.note
  }));
  if (normalizedItems.length === 0) {
    return "";
  }
  return JSON.stringify({ format: HOLIDAY_WORK_CONTENT_FORMAT, items: normalizedItems });
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

export function DepartmentSubmissionEditor({
  departments,
  categories,
  defaultDepartmentId,
  canSubmit,
  children,
  volumeSlot,
  reviewSlot,
  commonRequestSlot,
  commonSearchSlot,
  commonSearchFilters,
  holidayClientOptions = [],
  holidayWorkerOptions = [],
  centerOptions = [],
  initialVacancyRecords = [],
  initialVacancyTrend = [],
  initialSubmission,
  initialLookupDepartmentId,
  initialLookupWeekStartDate,
  requireExplicitDepartmentSelection = false
}: {
  departments: Department[];
  categories: Category[];
  defaultDepartmentId?: string | null;
  canSubmit: boolean;
  children?: ReactNode;
  volumeSlot?: ReactNode;
  reviewSlot?: ReactNode;
  commonRequestSlot?: ReactNode;
  commonSearchSlot?: ReactNode;
  commonSearchFilters?: ClientReportSearchFilters;
  holidayClientOptions?: HolidayClientOption[];
  holidayWorkerOptions?: HolidayWorkerOption[];
  centerOptions?: CenterOption[];
  initialVacancyRecords?: DepartmentVacancyRecordValue[];
  initialVacancyTrend?: DepartmentVacancyTrendPointValue[];
  initialSubmission?: DepartmentSubmissionEditorInitialSubmission | null;
  initialLookupDepartmentId?: string | null;
  initialLookupWeekStartDate?: string;
  requireExplicitDepartmentSelection?: boolean;
}) {
  const [active, setActive] = useState<DepartmentTabValue>("common");
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [facilityEditingItem, setFacilityEditingItem] = useState<FacilityConstructionItem | null>(null);
  const [holidayWorkDialogOpen, setHolidayWorkDialogOpen] = useState(false);
  const [holidayWorkEditingItem, setHolidayWorkEditingItem] = useState<HolidayWorkItem | null>(null);
  const [vacancyDialog, setVacancyDialog] = useState<VacancyDialogState>(null);
  const firstCategoryId = categories[0]?.id ?? "";
  const currentWeek = getCurrentWeekOption();
  const departmentId = defaultDepartmentId ?? (requireExplicitDepartmentSelection ? "" : departments[0]?.id ?? "");
  const [selectedWeekOption, setSelectedWeekOption] = useState<WeekOption>(currentWeek);
  const [weekStartDate, setWeekStartDate] = useState(currentWeek.weekStartDate);
  const [vacancyRecords, setVacancyRecords] = useState<DepartmentVacancyRecordValue[]>(initialVacancyRecords);
  const [vacancyTrend, setVacancyTrend] = useState<DepartmentVacancyTrendPointValue[]>(initialVacancyTrend);
  const [vacancyState, setVacancyState] = useState<{ ok: boolean; message: string } | null>(null);
  const [isLoadingVacancy, startVacancyTransition] = useTransition();
  const [submissionId, setSubmissionId] = useState(initialSubmission?.id ?? "");
  const [loadedStatus, setLoadedStatus] = useState<DepartmentSubmissionStatus | null>(initialSubmission?.status ?? null);
  const [loadedFinalizedAt, setLoadedFinalizedAt] = useState<string | null>(initialSubmission?.finalized_at ?? null);
  const [loadState, setLoadState] = useState<{ ok: boolean; message: string } | null>(null);
  const [isLoadingSubmission, setIsLoadingSubmission] = useState(false);
  const [contents, setContents] = useState<DepartmentContent[]>(() =>
    normalizeLoadedContents(firstCategoryId, initialSubmission?.department_weekly_contents ?? [])
  );
  const [state, action, isSavingSubmission] = useActionState(
    async (
      previousState: Awaited<ReturnType<typeof saveDepartmentSubmissionAction>> | null,
      formData: FormData
    ) => {
      const result = await saveDepartmentSubmissionAction(previousState, formData);
      if (result.ok && result.data) {
        setSubmissionId(result.data.id ?? "");
        setLoadedStatus(result.data.status);
        setLoadedFinalizedAt(result.data.finalized_at ?? null);
        setLoadState(null);
      }
      return result;
    },
    null
  );
  const [cancelState, cancelAction, isCancellingSubmission] = useActionState(
    async (
      previousState: Awaited<ReturnType<typeof cancelDepartmentSubmissionAction>> | null,
      formData: FormData
    ) => {
      const result = await cancelDepartmentSubmissionAction(previousState, formData);
      if (result.ok && result.data) {
        setSubmissionId(result.data.id ?? "");
        setLoadedStatus(result.data.status);
        setLoadedFinalizedAt(result.data.finalized_at ?? null);
        setLoadState(null);
      }
      return result;
    },
    null
  );
  const serializedContents = useMemo(() => JSON.stringify(contents), [contents]);
  const activeContent = isDepartmentContentSection(active) ? contents.find((content) => content.section_type === active) : undefined;
  const commonSearchActive = Boolean(
    active === "common" && commonSearchFilters && hasClientReportSearchFilters(commonSearchFilters)
  );
  const commonMatchingItems =
    commonSearchActive && activeContent && commonSearchFilters
      ? filterDepartmentCommonSearchItems(
          {
            week_start_date: weekStartDate,
            current_importance: activeContent.current_importance,
            current_work_category_id: activeContent.current_work_category_id,
            current_week_content: activeContent.current_week_content,
            next_importance: activeContent.next_importance,
            next_work_category_id: activeContent.next_work_category_id,
            next_week_content: activeContent.next_week_content
          },
          commonSearchFilters
        )
      : undefined;
  const commonMatchesSearch =
    !commonSearchActive || !activeContent || Boolean(commonMatchingItems?.length);
  const activeSectionLabel = departmentTabs.find((section) => section.value === active)?.label ?? "공통사항";
  const effectiveStatus = loadedStatus;
  const effectiveSubmissionId = submissionId;
  const canEditSubmission = isEditableSubmissionStatus(effectiveStatus);
  const isSubmittedToDivision = effectiveStatus === "submitted_to_division";
  const isCancelWindowExpired = isSubmittedToDivision && isPastConfirmationCancelWindow(loadedFinalizedAt);
  const isSubmissionBusy = isLoadingSubmission || isSavingSubmission || isCancellingSubmission;
  const showOverviewAndReview = active === "common";
  const facilityContentValue = contents.find((content) => content.section_type === "facility")?.current_week_content ?? "";
  const holidayWorkContentValue = contents.find((content) => content.section_type === "holiday_work")?.current_week_content ?? "";
  const facilityItems = useMemo(
    () => (active === "facility" || facilityDialogOpen ? parseFacilityConstructionItems(facilityContentValue) : []),
    [active, facilityContentValue, facilityDialogOpen]
  );
  const holidayWorkItems = useMemo(
    () => (active === "holiday_work" || holidayWorkDialogOpen ? parseHolidayWorkItems(holidayWorkContentValue) : []),
    [active, holidayWorkContentValue, holidayWorkDialogOpen]
  );

  const refreshVacancyData = useCallback(
    (successMessage?: string) => {
      if (!departmentId) {
        return;
      }
      startVacancyTransition(() => {
        loadDepartmentVacancyDataAction({
          department_id: departmentId,
          report_year: selectedWeekOption.year,
          report_month: selectedWeekOption.month
        })
          .then((result) => {
            if (!result.ok) {
              setVacancyRecords([]);
              setVacancyTrend([]);
              setVacancyState({ ok: false, message: result.message ?? "공실현황을 불러오지 못했습니다." });
              return;
            }
            setVacancyRecords(result.records);
            setVacancyTrend(result.trend);
            setVacancyState(successMessage ? { ok: true, message: successMessage } : null);
          })
          .catch(() => {
            setVacancyRecords([]);
            setVacancyTrend([]);
            setVacancyState({ ok: false, message: "공실현황을 불러오지 못했습니다." });
          });
      });
    },
    [departmentId, selectedWeekOption.month, selectedWeekOption.year]
  );

  useEffect(() => {
    if (!departmentId || !weekStartDate) {
      return;
    }
    if (departmentId === initialLookupDepartmentId && weekStartDate === initialLookupWeekStartDate) {
      return;
    }

    let ignore = false;
    const loadingTimer = window.setTimeout(() => {
      if (!ignore) {
        setIsLoadingSubmission(true);
        setLoadState(null);
      }
    }, 0);

    loadDepartmentSubmissionAction({ department_id: departmentId, week_start_date: weekStartDate })
      .then((result) => {
        if (ignore) {
          return;
        }
        if (!result.ok) {
          setSubmissionId("");
          setLoadedStatus(null);
          setLoadedFinalizedAt(null);
          setContents(makeEmptyContents(firstCategoryId));
          setLoadState({ ok: false, message: result.message ?? "부서자료를 불러오지 못했습니다." });
          return;
        }

        setSubmissionId(result.submission?.id ?? "");
        setLoadedStatus(result.submission?.status ?? null);
        setLoadedFinalizedAt(result.submission?.finalized_at ?? null);
        setContents(normalizeLoadedContents(firstCategoryId, result.submission?.department_weekly_contents ?? []));
        setLoadState(
          result.submission && !isEditableSubmissionStatus(result.submission.status)
            ? { ok: false, message: "확정 또는 승인된 부서자료는 수정할 수 없습니다." }
            : null
        );
      })
      .catch(() => {
        if (!ignore) {
          setSubmissionId("");
          setLoadedStatus(null);
          setLoadedFinalizedAt(null);
          setContents(makeEmptyContents(firstCategoryId));
          setLoadState({ ok: false, message: "부서자료를 불러오지 못했습니다." });
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoadingSubmission(false);
        }
      });

    return () => {
      ignore = true;
      window.clearTimeout(loadingTimer);
    };
  }, [departmentId, firstCategoryId, initialLookupDepartmentId, initialLookupWeekStartDate, weekStartDate]);

  useEffect(() => {
    if (!departmentId || active !== "vacancy") {
      return;
    }
    refreshVacancyData();
  }, [active, departmentId, refreshVacancyData]);

  function handleWeekSelectionChange(week: WeekOption) {
    setSelectedWeekOption(week);
    setWeekStartDate((current) => {
      if (current !== week.weekStartDate) {
        setSubmissionId("");
        setLoadedStatus(null);
        setLoadedFinalizedAt(null);
        setIsLoadingSubmission(true);
        setLoadState(null);
      }
      return week.weekStartDate;
    });
  }

  function updateFacilityItems(nextItems: FacilityConstructionItem[]) {
    setContents((current) =>
      current.map((content) =>
        content.section_type === "facility"
          ? {
              ...content,
              current_week_content: serializeFacilityConstructionItems(nextItems),
              next_week_content: ""
            }
          : content
      )
    );
  }

  function updateHolidayWorkItems(nextItems: HolidayWorkItem[]) {
    setContents((current) =>
      current.map((content) =>
        content.section_type === "holiday_work"
          ? {
              ...content,
              current_week_content: serializeHolidayWorkItems(nextItems),
              next_week_content: ""
            }
          : content
      )
    );
  }

  if (!departmentId) {
    return (
      <div className="space-y-3">
        <section className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/82 p-4 text-center shadow-[0_14px_34px_rgba(16,34,61,0.06)]">
          <p className="text-sm font-black text-[#10223d]">전체 부서 조회 중입니다.</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            부서자료 작성과 확정은 최상단 부서 필터에서 특정 부서를 선택한 뒤 진행하세요.
          </p>
        </section>
        {children ? (
          <div className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/80 p-2 shadow-[0_14px_34px_rgba(16,34,61,0.06)]">
            {children}
          </div>
        ) : null}
        {reviewSlot}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={effectiveSubmissionId} />
      <input type="hidden" name="contents" value={serializedContents} />
      <input type="hidden" name="department_id" value={departmentId} />

      <div className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/82 p-2 shadow-[0_14px_34px_rgba(16,34,61,0.06)]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav className={REPORT_TAB_NAV_CLASS_NAME} role="tablist" aria-label="부서자료 화면 탭">
              {departmentTabs.map((section) => {
                const Icon = section.icon;
                const isSelected = active === section.value;
                return (
                  <button
                    key={section.value}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActive(section.value)}
                    className={cn(
                      REPORT_TAB_ITEM_CLASS_NAME,
                      isSelected ? REPORT_TAB_ACTIVE_CLASS_NAME : REPORT_TAB_IDLE_CLASS_NAME
                    )}
                  >
                    <Icon className={REPORT_TAB_ICON_CLASS_NAME} aria-hidden="true" />
                    <span className="text-[13px] font-bold leading-none">{section.label}</span>
                    {isSelected ? (
                      <span className={REPORT_TAB_INDICATOR_CLASS_NAME} aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </nav>
            <div className="shrink-0">
              <div className="rounded-full border border-[#dbe8fb] bg-white/90 px-2 py-1.5 shadow-[0_10px_22px_rgba(16,34,61,0.05)]">
                <WeekSelect
                  compactWeekLabel
                  onSelectionChange={handleWeekSelectionChange}
                  className="flex flex-wrap items-center gap-1.5"
                  labelClassName="flex items-center gap-1 text-[11px] font-black text-slate-500"
                  weekLabelClassName="flex items-center gap-1 text-[11px] font-black text-slate-500"
                  controlClassName="h-8 w-[78px] rounded-full border border-[#d7e4f6] bg-[#f5f9ff] px-2 text-sm font-black text-[#10223d] outline-none"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            {active === "common" && commonSearchSlot ? commonSearchSlot : <span className="flex-1" />}
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 lg:pt-4">
              <button
                type="submit"
                name="status"
                value="submitted_to_division"
                disabled={!canSubmit || !canEditSubmission || isSubmissionBusy}
                title={
                  !canSubmit
                    ? "부서 최종 제출은 부서장과 관리자만 가능합니다."
                    : !canEditSubmission
                      ? "확정 또는 승인된 부서자료는 수정할 수 없습니다."
                      : isSubmissionBusy
                        ? "부서자료를 불러오는 중입니다."
                        : undefined
                }
                className="tool-button tool-button-primary h-9 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {isSubmittedToDivision ? "확정완료" : isSavingSubmission ? "확정 중" : "확정"}
              </button>
              {isSubmittedToDivision ? (
                <button
                  type="submit"
                  formAction={cancelAction}
                  disabled={!canSubmit || isSubmissionBusy || isCancelWindowExpired}
                  className="tool-button h-9 text-[#075be8] disabled:opacity-50"
                  title={
                    !canSubmit
                      ? "확정취소는 부서장과 관리자만 가능합니다."
                      : isCancelWindowExpired
                        ? "확정 후 3일이 지난 부서자료는 확정취소할 수 없습니다."
                        : undefined
                  }
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {isCancellingSubmission ? "취소 중" : "확정취소"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {children && showOverviewAndReview ? (
        <div className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/80 p-2 shadow-[0_14px_34px_rgba(16,34,61,0.06)]">
          {children}
        </div>
      ) : null}

      {active === "common" ? commonRequestSlot : null}

      <section className="rounded-2xl border border-[#d9e7f7] bg-white/86 p-3 shadow-[0_14px_32px_rgba(16,34,61,0.05)]">
        {active === "holiday_work" || active === "vacancy" || active === "volume" ? null : (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-doodle-title">{active === "common" ? "부서 공통사항" : activeSectionLabel}</h2>
            {active === "facility" ? (
              <button
                type="button"
                onClick={() => {
                  setFacilityEditingItem(null);
                  setFacilityDialogOpen(true);
                }}
                disabled={!canEditSubmission || isSubmissionBusy}
                className="tool-button tool-button-primary min-h-9 py-1.5 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                등록
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => isDepartmentContentSection(active) && setActiveDialog({ section: active, period: "current" })}
                  disabled={!canEditSubmission || isSubmissionBusy}
                  className="tool-button min-h-9 py-1.5 disabled:opacity-50"
                >
                  금주 실시사항 작성
                </button>
                <button
                  type="button"
                  onClick={() => isDepartmentContentSection(active) && setActiveDialog({ section: active, period: "next" })}
                  disabled={!canEditSubmission || isSubmissionBusy}
                  className="tool-button min-h-9 py-1.5 disabled:opacity-50"
                >
                  차주 예정사항 작성
                </button>
              </div>
            )}
          </div>
        )}
        {active === "volume" ? (
          volumeSlot ?? (
            <div className="rounded-2xl border border-dashed border-[#b9cce6] px-4 py-6 text-center text-sm font-bold text-slate-500">
              선택한 주차의 물동량 자료가 없습니다.
            </div>
          )
        ) : active === "facility" ? (
          <FacilityConstructionTable
            items={facilityItems}
            disabled={!canEditSubmission || isSubmissionBusy}
            onItemsChange={updateFacilityItems}
            onEditItem={(item) => {
              setFacilityEditingItem(item);
              setFacilityDialogOpen(true);
            }}
          />
        ) : active === "holiday_work" ? (
          <HolidayWorkTable
            items={holidayWorkItems}
            disabled={!canEditSubmission || isSubmissionBusy}
            onItemsChange={updateHolidayWorkItems}
            onCreateItem={() => {
              setHolidayWorkEditingItem(null);
              setHolidayWorkDialogOpen(true);
            }}
            onEditItem={(item) => {
              setHolidayWorkEditingItem(item);
              setHolidayWorkDialogOpen(true);
            }}
          />
        ) : active === "vacancy" ? (
          <VacancyStatusBoard
            centerOptions={centerOptions}
            selectedWeek={selectedWeekOption}
            records={vacancyRecords}
            trend={vacancyTrend}
            disabled={!canEditSubmission || isSubmissionBusy}
            isLoading={isLoadingVacancy}
            onCreate={() => setVacancyDialog({ mode: "create" })}
            onEdit={(item) => setVacancyDialog({ mode: "edit", item })}
            onRecordsChange={setVacancyRecords}
            onRefresh={refreshVacancyData}
          />
        ) : activeContent && commonMatchesSearch ? (
          <div className="grid gap-3 md:grid-cols-2">
            <PreviewBlock
              title="금주 실시사항"
              value={activeContent.current_week_content}
              structured={active === "common"}
              importance={activeContent.current_importance}
              categoryId={activeContent.current_work_category_id}
              visibleStructuredItems={commonMatchingItems?.filter((item) => item.item_period === "current")}
              categories={categories}
              categoryName={categories.find((category) => category.id === activeContent.current_work_category_id)?.category_name ?? "기타"}
              disabled={!canEditSubmission || isSubmissionBusy}
              onEdit={() => setActiveDialog({ section: active, period: "current" })}
            />
            <PreviewBlock
              title="차주 예정사항"
              value={activeContent.next_week_content}
              structured={active === "common"}
              importance={activeContent.next_importance}
              categoryId={activeContent.next_work_category_id}
              visibleStructuredItems={commonMatchingItems?.filter((item) => item.item_period === "next")}
              categories={categories}
              categoryName={categories.find((category) => category.id === activeContent.next_work_category_id)?.category_name ?? "기타"}
              disabled={!canEditSubmission || isSubmissionBusy}
              onEdit={() => setActiveDialog({ section: active, period: "next" })}
            />
          </div>
        ) : active === "common" && commonSearchFilters && hasClientReportSearchFilters(commonSearchFilters) ? (
          <div className="rounded-2xl border border-dashed border-[#b9cce6] px-4 py-6 text-center text-sm font-bold text-slate-500">
            검색 조건에 맞는 부서 공통사항이 없습니다.
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#b9cce6] px-4 py-6 text-center text-sm font-bold text-slate-500">
            아직 작성된 내용이 없습니다.
          </div>
        )}
      </section>

      <ActionMessage state={state} />
      <ActionMessage state={cancelState} />
      <ActionMessage state={loadState} />
      <ActionMessage state={vacancyState} />
      {reviewSlot && showOverviewAndReview ? (
        <div>
          {reviewSlot}
        </div>
      ) : null}
      {activeDialog ? (
        <DepartmentContentPeriodDialog
          sectionLabel={sections.find((section) => section.value === activeDialog.section)?.label ?? "공통사항"}
          period={activeDialog.period}
          categories={categories}
          content={contents.find((content) => content.section_type === activeDialog.section)}
          onClose={() => setActiveDialog(null)}
          onComplete={() => setActiveDialog(null)}
          onUpdate={(patch) =>
            setContents((current) =>
              current.map((content) => (content.section_type === activeDialog.section ? { ...content, ...patch } : content))
            )
          }
        />
      ) : null}
      {facilityDialogOpen ? (
        <FacilityConstructionDialog
          key={facilityEditingItem?.id ?? "new-facility"}
          initialItem={facilityEditingItem}
          onClose={() => {
            setFacilityDialogOpen(false);
            setFacilityEditingItem(null);
          }}
          onSave={(item) => {
            const nextItems = facilityEditingItem
              ? facilityItems.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
              : [...facilityItems, item];
            updateFacilityItems(nextItems);
            setFacilityDialogOpen(false);
            setFacilityEditingItem(null);
          }}
        />
      ) : null}
      {holidayWorkDialogOpen ? (
        <HolidayWorkDialog
          key={holidayWorkEditingItem?.id ?? "new-holiday-work"}
          initialItem={holidayWorkEditingItem}
          clientOptions={holidayClientOptions}
          workerOptions={holidayWorkerOptions}
          onClose={() => {
            setHolidayWorkDialogOpen(false);
            setHolidayWorkEditingItem(null);
          }}
          onSave={(item) => {
            const nextItems = holidayWorkEditingItem
              ? holidayWorkItems.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
              : [...holidayWorkItems, item];
            updateHolidayWorkItems(nextItems);
            setHolidayWorkDialogOpen(false);
            setHolidayWorkEditingItem(null);
          }}
        />
      ) : null}
      {vacancyDialog ? (
        <VacancyRecordDialog
          key={vacancyDialog.item?.id ?? "new-vacancy"}
          departmentId={departmentId}
          selectedWeek={selectedWeekOption}
          centerOptions={centerOptions}
          initialItem={vacancyDialog.item}
          onClose={() => setVacancyDialog(null)}
          onSave={(item) => {
            setVacancyRecords((current) => {
              const exists = current.some((row) => row.id === item.id);
              const nextRows = exists ? current.map((row) => (row.id === item.id ? item : row)) : [...current, item];
              return nextRows.sort((left, right) => left.week_of_month - right.week_of_month || left.center_name.localeCompare(right.center_name, "ko"));
            });
            setVacancyDialog(null);
            setVacancyState({ ok: true, message: "공실현황을 저장했습니다." });
            refreshVacancyData("공실현황을 저장했습니다.");
          }}
        />
      ) : null}
    </form>
  );
}

function formatArea(value: number) {
  return Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function toVacancyFormValue(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function formatPercent(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function VacancyStatusBoard({
  centerOptions,
  selectedWeek,
  records,
  trend,
  disabled,
  isLoading,
  onCreate,
  onEdit,
  onRecordsChange,
  onRefresh
}: {
  centerOptions: CenterOption[];
  selectedWeek: WeekOption;
  records: DepartmentVacancyRecordValue[];
  trend: DepartmentVacancyTrendPointValue[];
  disabled?: boolean;
  isLoading?: boolean;
  onCreate: () => void;
  onEdit: (item: DepartmentVacancyRecordValue) => void;
  onRecordsChange: (items: DepartmentVacancyRecordValue[]) => void;
  onRefresh: (successMessage?: string) => void;
}) {
  const [showSimpleStorage, setShowSimpleStorage] = useState(true);
  const [showVacancy, setShowVacancy] = useState(true);
  const [selectedCenterIds, setSelectedCenterIds] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const registeredCenters = useMemo(() => {
    const centerMap = new Map<string, string>();
    records.forEach((record) => {
      centerMap.set(record.center_master_id, record.center_name);
    });
    return Array.from(centerMap.entries())
      .map(([id, centerName]) => ({ id, centerName }))
      .sort((left, right) => left.centerName.localeCompare(right.centerName, "ko"));
  }, [records]);
  const allRegisteredCenterIds = useMemo(() => registeredCenters.map((center) => center.id), [registeredCenters]);
  const effectiveSelectedCenterIds = selectedCenterIds ?? allRegisteredCenterIds;
  const allCentersSelected = registeredCenters.length > 0 && effectiveSelectedCenterIds.length === registeredCenters.length;
  const filteredRecords = useMemo(() => {
    if (registeredCenters.length === 0) {
      return records;
    }
    const selectedSet = new Set(effectiveSelectedCenterIds);
    return records.filter((record) => selectedSet.has(record.center_master_id));
  }, [effectiveSelectedCenterIds, records, registeredCenters.length]);
  const trendData = useMemo(() => {
    const selectedSet = new Set(effectiveSelectedCenterIds);
    const weeklyPointMap = new Map<string, DepartmentVacancyTrendPointValue>();
    trend
      .filter((point) => selectedSet.size === 0 || selectedSet.has(point.center_master_id))
      .forEach((point) => {
        const current = weeklyPointMap.get(point.week_start_date) ?? {
          center_master_id: "selected",
          center_name: "선택 센터",
          week_start_date: point.week_start_date,
          label: point.label,
          simple_storage_area: 0,
          vacancy_area: 0
        };
        current.simple_storage_area += point.simple_storage_area;
        current.vacancy_area += point.vacancy_area;
        weeklyPointMap.set(point.week_start_date, current);
      });
    const visibleWeekStartDates = new Set(filteredRecords.map((record) => record.week_start_date));
    visibleWeekStartDates.forEach((weekStartDate) => {
      weeklyPointMap.set(weekStartDate, {
        center_master_id: "selected",
        center_name: "선택 센터",
        week_start_date: weekStartDate,
        label: weekStartDate.slice(5).replace("-", "/"),
        simple_storage_area: 0,
        vacancy_area: 0
      });
    });
    filteredRecords.forEach((record) => {
      const current = weeklyPointMap.get(record.week_start_date) ?? {
        center_master_id: "selected",
        center_name: "선택 센터",
        week_start_date: record.week_start_date,
        label: record.week_start_date.slice(5).replace("-", "/"),
        simple_storage_area: 0,
        vacancy_area: 0
      };
      current.simple_storage_area += record.simple_storage_area;
      current.vacancy_area += record.vacancy_area;
      weeklyPointMap.set(record.week_start_date, current);
    });
    const monthlyMap = Array.from(weeklyPointMap.values()).reduce((map, point) => {
      const monthKey = point.week_start_date.slice(0, 7);
      const current = map.get(monthKey) ?? {
        monthKey,
        label: `${monthKey.slice(2, 4)}/${monthKey.slice(5, 7)}`,
        simple_storage_area: 0,
        vacancy_area: 0,
        count: 0
      };
      current.simple_storage_area += point.simple_storage_area;
      current.vacancy_area += point.vacancy_area;
      current.count += 1;
      map.set(monthKey, current);
      return map;
    }, new Map<string, { monthKey: string; label: string; simple_storage_area: number; vacancy_area: number; count: number }>());
    return Array.from(monthlyMap.values())
      .map((point) => ({
        monthKey: point.monthKey,
        label: point.label,
        simple_storage_area: point.count > 0 ? point.simple_storage_area / point.count : 0,
        vacancy_area: point.count > 0 ? point.vacancy_area / point.count : 0
      }))
      .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
  }, [effectiveSelectedCenterIds, filteredRecords, trend]);
  const vacancySummaryRows = useMemo(() => {
    const valuesByWeek = Array.from({ length: 5 }, (_, index) => {
      const weekOfMonth = index + 1;
      const weekRecords = filteredRecords.filter((record) => record.week_of_month === weekOfMonth);
      return {
        weekOfMonth,
        total_area: weekRecords.reduce((sum, record) => sum + record.total_area, 0),
        operating_area: weekRecords.reduce((sum, record) => sum + record.operating_area, 0),
        simple_storage_area: weekRecords.reduce((sum, record) => sum + record.simple_storage_area, 0),
        vacancy_area: weekRecords.reduce((sum, record) => sum + record.vacancy_area, 0),
        hasData: weekRecords.length > 0
      };
    });
    const dataWeeks = valuesByWeek.filter((week) => week.hasData);
    const average = (key: "total_area" | "operating_area" | "simple_storage_area" | "vacancy_area") =>
      dataWeeks.length > 0 ? dataWeeks.reduce((sum, week) => sum + week[key], 0) / dataWeeks.length : 0;
    const averageTotalArea = average("total_area");
    const averageVacancyArea = average("vacancy_area");
    const makeRow = (label: string, key: "total_area" | "operating_area" | "simple_storage_area" | "vacancy_area") => ({
      label,
      values: valuesByWeek.map((week) => formatArea(week[key])),
      average: formatArea(average(key))
    });
    return [
      makeRow("전체면적", "total_area"),
      makeRow("운영면적", "operating_area"),
      makeRow("단순보관", "simple_storage_area"),
      makeRow("공실", "vacancy_area"),
      {
        label: "공실율%",
        values: valuesByWeek.map((week) => formatPercent(week.total_area > 0 ? (week.vacancy_area / week.total_area) * 100 : 0)),
        average: formatPercent(averageTotalArea > 0 ? (averageVacancyArea / averageTotalArea) * 100 : 0)
      }
    ];
  }, [filteredRecords]);

  const toggleCenter = (centerId: string) => {
    setSelectedCenterIds((current) => {
      const baseIds = current ?? allRegisteredCenterIds;
      if (baseIds.includes(centerId)) {
        return baseIds.filter((id) => id !== centerId);
      }
      return [...baseIds, centerId];
    });
  };

  const deleteRecord = (record: DepartmentVacancyRecordValue) => {
    if (disabled || isPending) {
      return;
    }
    if (!window.confirm(`${record.center_name} ${record.week_of_month}주차 공실현황을 삭제할까요?`)) {
      return;
    }
    setMessage("");
    setPendingDeleteId(record.id);
    const formData = new FormData();
    formData.set("id", record.id);
    startTransition(() => {
      deleteDepartmentVacancyRecordAction(formData)
        .then((result) => {
          if (!result.ok) {
            setMessage(result.message ?? "공실현황을 삭제하지 못했습니다.");
            return;
          }
          onRecordsChange(records.filter((item) => item.id !== record.id));
          onRefresh("공실현황을 삭제했습니다.");
          setMessage("공실현황을 삭제했습니다.");
        })
        .catch(() => setMessage("공실현황을 삭제하지 못했습니다."))
        .finally(() => setPendingDeleteId(null));
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#d9e7f7] bg-white/88 p-3 shadow-[0_14px_32px_rgba(16,34,61,0.05)]">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-doodle-title">공실현황 최근 1년간 추이</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">단순보관과 공실면적의 월평균 흐름을 확인합니다.</p>
          </div>
          <div className="flex max-w-[58rem] flex-wrap items-center justify-end gap-1.5">
            {registeredCenters.length > 1 ? (
              <label className="section-chip cursor-pointer">
                <input
                  type="checkbox"
                  checked={allCentersSelected}
                  onChange={() => setSelectedCenterIds(allCentersSelected ? [] : null)}
                  className="h-4 w-4 accent-[#075be8]"
                />
                전체센터
              </label>
            ) : null}
            {registeredCenters.map((center) => (
              <label key={center.id} className="section-chip cursor-pointer">
                <input
                  type="checkbox"
                  checked={effectiveSelectedCenterIds.includes(center.id)}
                  onChange={() => toggleCenter(center.id)}
                  className="h-4 w-4 accent-[#075be8]"
                />
                {center.centerName}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(440px,0.9fr)]">
          <div className="relative h-[224px] rounded-2xl border border-[#d9e7f7] bg-[#f8fbff] p-3">
            <div className="absolute right-3 top-3 z-10 flex flex-wrap items-center justify-end gap-1.5 rounded-full border border-[#d9e7f7] bg-white/92 px-2 py-1 shadow-[0_8px_18px_rgba(16,34,61,0.06)]">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-black text-[#10223d]">
                <input
                  type="checkbox"
                  checked={showSimpleStorage}
                  onChange={(event) => setShowSimpleStorage(event.target.checked)}
                  className="h-3.5 w-3.5 accent-[#075be8]"
                />
                단순보관
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-black text-[#10223d]">
                <input
                  type="checkbox"
                  checked={showVacancy}
                  onChange={(event) => setShowVacancy(event.target.checked)}
                  className="h-3.5 w-3.5 accent-[#075be8]"
                />
                공실면적
              </label>
            </div>
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">공실현황을 불러오는 중입니다.</div>
            ) : trendData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">최근 1년 공실현황 데이터가 없습니다.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 30, right: 18, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#dbe8fb" strokeDasharray="4 4" />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={58} />
                  <Tooltip
                    formatter={(value, name) => [formatArea(Number(value)), name === "simple_storage_area" ? "단순보관" : "공실면적"]}
                    labelFormatter={(label) => `${label} 월평균`}
                    contentStyle={{ borderRadius: 16, border: "1px solid #d9e7f7", fontWeight: 800 }}
                  />
                  {showSimpleStorage ? (
                    <Line type="monotone" dataKey="simple_storage_area" name="단순보관" stroke="#0ea5e9" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                  ) : null}
                  {showVacancy ? (
                    <Line type="monotone" dataKey="vacancy_area" name="공실면적" stroke="#f97316" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="h-[224px] rounded-2xl border border-[#d9e7f7] bg-[#f8fbff] p-3">
            <div className="h-full overflow-x-hidden rounded-xl border border-[#d9e7f7] bg-white">
              <table className="w-full table-fixed text-left text-[11px]">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead className="bg-[#f1f6fd] text-[#10223d]">
                  <tr>
                    <th className="px-2 py-2">구분</th>
                    <th className="px-1.5 py-2 text-right">1주차</th>
                    <th className="px-1.5 py-2 text-right">2주차</th>
                    <th className="px-1.5 py-2 text-right">3주차</th>
                    <th className="px-1.5 py-2 text-right">4주차</th>
                    <th className="px-1.5 py-2 text-right">5주차</th>
                    <th className="px-2 py-2 text-right">평균</th>
                  </tr>
                </thead>
                <tbody>
                  {vacancySummaryRows.map((row) => (
                    <tr key={row.label} className="border-t border-slate-100">
                      <td className="px-2 py-2 font-black text-[#10223d]">{row.label}</td>
                      {row.values.map((value, index) => (
                        <td key={`${row.label}-${index}`} className="px-1.5 py-2 text-right font-bold text-slate-600">
                          {value}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right font-black text-[#075be8]">{row.average}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#d9e7f7] bg-white/88 shadow-[0_14px_32px_rgba(16,34,61,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5eef9] px-3 py-3">
          <div>
            <h2 className="section-doodle-title">주차별 공실현황</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {selectedWeek.year}년 {selectedWeek.month}월 기준
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {message ? <p className="text-xs font-black text-[#075be8]">{message}</p> : null}
            <button type="button" onClick={onCreate} disabled={disabled || centerOptions.length === 0} className="tool-button tool-button-primary min-h-10 py-2 disabled:opacity-50">
              <Plus className="h-4 w-4" aria-hidden="true" />
              등록
            </button>
          </div>
        </div>
        <div className="overflow-x-hidden">
          <table className="table-sticky w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[7%]" />
              <col className="w-[17%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[24%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-2 py-2.5">주차</th>
                <th className="px-2 py-2.5">센터</th>
                <th className="px-2 py-2.5 text-right">운영면적</th>
                <th className="px-2 py-2.5 text-right">단순보관</th>
                <th className="px-2 py-2.5 text-right">공실</th>
                <th className="px-2 py-2.5 text-right">전체면적</th>
                <th className="px-2 py-2.5">비고</th>
                <th className="px-2 py-2.5 text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    등록된 공실현황이 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((record) => {
                  const notes = [
                    record.simple_storage_note?.trim() ? `단순보관 - ${record.simple_storage_note.trim()}` : "",
                    record.vacancy_note?.trim() ? `공실 - ${record.vacancy_note.trim()}` : ""
                  ].filter(Boolean);
                  return (
                    <tr key={record.id} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-2.5 font-black text-[#10223d]">{record.week_of_month}주차</td>
                      <td className="break-words px-2 py-2.5 font-black text-[#10223d]">{record.center_name}</td>
                      <td className="px-2 py-2.5 text-right font-bold">{formatArea(record.operating_area)}</td>
                      <td className="px-2 py-2.5 text-right font-bold text-sky-700">{formatArea(record.simple_storage_area)}</td>
                      <td className="px-2 py-2.5 text-right font-bold text-orange-600">{formatArea(record.vacancy_area)}</td>
                      <td className="px-2 py-2.5 text-right font-bold">{formatArea(record.total_area)}</td>
                      <td className="whitespace-pre-wrap break-words px-2 py-2.5 leading-5 text-slate-600">
                        {notes.length > 0 ? notes.join("\n") : "-"}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" onClick={() => onEdit(record)} disabled={disabled} className="icon-tool-button h-8 w-8 disabled:opacity-50" aria-label={`${record.center_name} 공실현황 수정`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRecord(record)}
                            disabled={disabled || pendingDeleteId === record.id}
                            className="icon-tool-button h-8 w-8 text-rose-600 disabled:opacity-50"
                            aria-label={`${record.center_name} 공실현황 삭제`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function VacancyRecordDialog({
  departmentId,
  selectedWeek,
  centerOptions,
  initialItem,
  onClose,
  onSave
}: {
  departmentId: string;
  selectedWeek: WeekOption;
  centerOptions: CenterOption[];
  initialItem?: DepartmentVacancyRecordValue;
  onClose: () => void;
  onSave: (item: DepartmentVacancyRecordValue) => void;
}) {
  const [centerMasterId, setCenterMasterId] = useState(initialItem?.center_master_id ?? centerOptions[0]?.id ?? "");
  const [operatingArea, setOperatingArea] = useState(toVacancyFormValue(initialItem?.operating_area ?? 0));
  const [simpleStorageArea, setSimpleStorageArea] = useState(toVacancyFormValue(initialItem?.simple_storage_area ?? 0));
  const [vacancyArea, setVacancyArea] = useState(toVacancyFormValue(initialItem?.vacancy_area ?? 0));
  const [totalArea, setTotalArea] = useState(toVacancyFormValue(initialItem?.total_area ?? 0));
  const [simpleStorageNote, setSimpleStorageNote] = useState(initialItem?.simple_storage_note ?? "");
  const [vacancyNote, setVacancyNote] = useState(initialItem?.vacancy_note ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const saveRecord = () => {
    setMessage("");
    if (!centerMasterId) {
      setMessage("센터를 선택하세요.");
      return;
    }
    const formData = new FormData();
    if (initialItem?.id) {
      formData.set("id", initialItem.id);
    }
    formData.set("department_id", departmentId);
    formData.set("center_master_id", centerMasterId);
    formData.set("week_start_date", selectedWeek.weekStartDate);
    formData.set("week_end_date", selectedWeek.weekEndDate);
    formData.set("report_year", String(selectedWeek.year));
    formData.set("report_month", String(selectedWeek.month));
    formData.set("week_of_month", String(selectedWeek.weekOfMonth));
    formData.set("operating_area", operatingArea || "0");
    formData.set("simple_storage_area", simpleStorageArea || "0");
    formData.set("vacancy_area", vacancyArea || "0");
    formData.set("total_area", totalArea || "0");
    formData.set("simple_storage_note", simpleStorageNote);
    formData.set("vacancy_note", vacancyNote);
    startTransition(() => {
      saveDepartmentVacancyRecordAction(formData)
        .then((result) => {
          if (!result.ok || !result.data) {
            setMessage(result.message ?? "공실현황을 저장하지 못했습니다.");
            return;
          }
          onSave(result.data);
        })
        .catch(() => setMessage("공실현황을 저장하지 못했습니다."));
    });
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="vacancy-dialog-title">
        <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/95 shadow-[0_28px_80px_rgba(16,34,61,0.24)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="vacancy-dialog-title" className="text-lg font-black text-slate-900">
                {initialItem ? "공실현황 수정" : "공실현황 등록"}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {selectedWeek.year}년 {selectedWeek.month}월 {selectedWeek.weekOfMonth}주차 기준으로 센터별 면적을 입력합니다.
              </p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[64vh] overflow-y-auto bg-[#f5f9ff] px-5 py-4">
            <div className="glass-row grid gap-3 p-3 md:grid-cols-2">
              <label className="text-xs font-black text-slate-600 md:col-span-2">
                센터
                <select
                  value={centerMasterId}
                  onChange={(event) => setCenterMasterId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                >
                  {centerOptions.length === 0 ? <option value="">등록된 센터가 없습니다</option> : null}
                  {centerOptions.map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.center_name}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField label="운영면적" value={operatingArea} onChange={setOperatingArea} />
              <NumberField label="전체면적" value={totalArea} onChange={setTotalArea} />
              <NumberField label="단순보관" value={simpleStorageArea} onChange={setSimpleStorageArea} />
              <NumberField label="공실" value={vacancyArea} onChange={setVacancyArea} />
              <label className="text-xs font-black text-slate-600">
                단순보관 비고
                <textarea
                  value={simpleStorageNote}
                  rows={4}
                  onChange={(event) => setSimpleStorageNote(event.target.value)}
                  className="mt-1 min-h-[100px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="단순보관 내용을 입력하세요."
                />
              </label>
              <label className="text-xs font-black text-slate-600">
                공실 비고
                <textarea
                  value={vacancyNote}
                  rows={4}
                  onChange={(event) => setVacancyNote(event.target.value)}
                  className="mt-1 min-h-[100px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="공실 내용을 입력하세요."
                />
              </label>
              {message ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 md:col-span-2">
                  {message}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button type="button" onClick={onClose} className="tool-button" disabled={isPending}>
              취소
            </button>
            <button type="button" onClick={saveRecord} className="tool-button tool-button-primary" disabled={isPending}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {isPending ? "저장 중" : initialItem ? "수정 완료" : "등록"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-black text-slate-600">
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
        placeholder="0"
      />
    </label>
  );
}

function FacilityConstructionTable({
  items,
  disabled,
  onItemsChange,
  onEditItem
}: {
  items: FacilityConstructionItem[];
  disabled?: boolean;
  onItemsChange: (items: FacilityConstructionItem[]) => void;
  onEditItem: (item: FacilityConstructionItem) => void;
}) {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<FacilityConstructionStatus[]>(["planned", "in_progress", "completed"]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const allStatusesSelected = selectedStatuses.length === facilityStatusOptions.length;
  const normalizedKeyword = searchKeyword.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesStatus = selectedStatuses.includes(item.status);
    const matchesKeyword =
      !normalizedKeyword ||
      item.construction_name.toLowerCase().includes(normalizedKeyword) ||
      item.construction_content.toLowerCase().includes(normalizedKeyword) ||
      item.contractor.toLowerCase().includes(normalizedKeyword);
    return matchesStatus && matchesKeyword;
  });
  const toggleStatus = (status: FacilityConstructionStatus) => {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status]
    );
  };
  const visibleIds = filteredItems.map((item) => item.id);
  const selectedVisibleIds = selectedIds.filter((id) => visibleIds.includes(id));
  const allVisibleSelected = filteredItems.length > 0 && selectedVisibleIds.length === filteredItems.length;
  const toggleRow = (itemId: string) => {
    setMessage("");
    setSelectedIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  };
  const toggleVisibleRows = () => {
    setMessage("");
    setSelectedIds((current) => {
      const hiddenSelectedIds = current.filter((id) => !visibleIds.includes(id));
      return allVisibleSelected ? hiddenSelectedIds : [...hiddenSelectedIds, ...visibleIds];
    });
  };
  const editSelectedItem = () => {
    setMessage("");
    if (selectedIds.length !== 1) {
      setMessage("수정할 시설공사 내역을 1건만 선택하세요.");
      return;
    }
    const selectedItem = items.find((item) => item.id === selectedIds[0]);
    if (selectedItem) {
      onEditItem(selectedItem);
    }
  };
  const deleteSelectedItems = () => {
    setMessage("");
    if (selectedIds.length === 0) {
      setMessage("삭제할 시설공사 내역을 선택하세요.");
      return;
    }
    const selectedIdSet = new Set(selectedIds);
    onItemsChange(items.filter((item) => !selectedIdSet.has(item.id)));
    setSelectedIds([]);
  };
  const updateItemStatus = (itemId: string, status: FacilityConstructionStatus) => {
    setMessage("");
    onItemsChange(items.map((item) => (item.id === itemId ? { ...item, status } : item)));
  };

  return (
    <div className="rounded-2xl border border-[#d9e7f7] bg-white/88 shadow-[0_14px_32px_rgba(16,34,61,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5eef9] px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="section-chip cursor-pointer">
            <input
              type="checkbox"
              checked={allStatusesSelected}
              onChange={() => setSelectedStatuses(allStatusesSelected ? [] : facilityStatusOptions.map((option) => option.value))}
              className="h-4 w-4 accent-[#075be8]"
            />
            전체
          </label>
          {facilityStatusOptions.map((option) => (
            <label key={option.value} className="section-chip cursor-pointer">
              <input
                type="checkbox"
                checked={selectedStatuses.includes(option.value)}
                onChange={() => toggleStatus(option.value)}
                className="h-4 w-4 accent-[#075be8]"
              />
              {option.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          <label className="min-w-[260px] text-xs font-black text-slate-500">
            검색
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              className="mt-1 h-10 w-full rounded-full border border-[#d7e4f6] bg-[#f5f9ff] px-4 text-sm font-bold text-[#10223d] outline-none"
              placeholder="공사명, 공사내용, 진행업체"
            />
          </label>
          <button type="button" onClick={editSelectedItem} disabled={disabled} className="tool-button min-h-10 py-2 disabled:opacity-50">
            <Pencil className="h-4 w-4" aria-hidden="true" />
            수정
          </button>
          <button type="button" onClick={deleteSelectedItems} disabled={disabled} className="tool-button min-h-10 py-2 text-rose-600 disabled:opacity-50">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            삭제
          </button>
        </div>
      </div>
      {message ? (
        <p className="mx-3 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {message}
        </p>
      ) : null}
      <div className="overflow-x-hidden">
        <table className="table-sticky w-full table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[23%]" />
            <col className="w-[17%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-2 py-2.5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleVisibleRows}
                  disabled={disabled || filteredItems.length === 0}
                  className="h-4 w-4 accent-[#075be8]"
                  aria-label="시설공사 표시 목록 전체 선택"
                />
              </th>
              <th className="px-2 py-2.5">시작일</th>
              <th className="px-2 py-2.5">완료일</th>
              <th className="px-2 py-2.5">공사명(전자결제 제목)</th>
              <th className="px-2 py-2.5">공사내용</th>
              <th className="px-2 py-2.5">진행업체</th>
              <th className="px-2 py-2.5">공사금액</th>
              <th className="px-2 py-2.5">상태</th>
              <th className="px-2 py-2.5">비고</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                  등록된 시설공사 내역이 없습니다.
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                  선택한 조건의 시설공사 내역이 없습니다.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleRow(item.id)}
                      disabled={disabled}
                      className="h-4 w-4 accent-[#075be8]"
                      aria-label={`${item.construction_name || "시설공사"} 선택`}
                    />
                  </td>
                  <td className="break-words px-2 py-2.5">{item.start_date || "-"}</td>
                  <td className="break-words px-2 py-2.5">{item.completion_date || "-"}</td>
                  <td className="break-words px-2 py-2.5 font-black leading-5 text-[#10223d]">{item.construction_name || "-"}</td>
                  <td className="whitespace-pre-wrap break-words px-2 py-2.5 leading-5 text-slate-600">{item.construction_content || "-"}</td>
                  <td className="break-words px-2 py-2.5">{item.contractor || "-"}</td>
                  <td className="break-words px-2 py-2.5">{item.construction_amount || "-"}</td>
                  <td className="px-1.5 py-2.5">
                    <select
                      value={item.status}
                      onChange={(event) => updateItemStatus(item.id, event.target.value as FacilityConstructionStatus)}
                      disabled={disabled}
                      aria-label={`${item.construction_name || "시설공사"} 상태 변경`}
                      className="h-7 w-full rounded-full border border-blue-100 bg-blue-50 px-1 text-[11px] font-black text-blue-700 outline-none disabled:opacity-60"
                    >
                      {facilityStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-pre-wrap break-words px-2 py-2.5 leading-5 text-slate-600">{item.note || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FacilityConstructionDialog({
  initialItem,
  onClose,
  onSave
}: {
  initialItem?: FacilityConstructionItem | null;
  onClose: () => void;
  onSave: (item: FacilityConstructionItem) => void;
}) {
  const [item, setItem] = useState<FacilityConstructionItem>(() => initialItem ?? makeEmptyFacilityItem());
  const [message, setMessage] = useState("");
  const updateItem = (patch: Partial<FacilityConstructionItem>) => {
    setMessage("");
    setItem((current) => ({ ...current, ...patch }));
  };
  const saveItem = () => {
    if (!item.start_date || !item.construction_name.trim() || !item.construction_content.trim()) {
      setMessage("시작일, 공사명, 공사내용은 필수입니다.");
      return;
    }
    onSave({
      ...item,
      construction_name: item.construction_name.trim(),
      construction_content: item.construction_content.trim(),
      contractor: item.contractor.trim(),
      construction_amount: item.construction_amount.trim(),
      note: item.note.trim()
    });
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="facility-dialog-title">
        <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/95 shadow-[0_28px_80px_rgba(16,34,61,0.24)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="facility-dialog-title" className="text-lg font-black text-slate-900">
                {initialItem ? "시설공사 수정" : "시설공사 등록"}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">공사 일정, 내용, 업체, 금액과 진행상태를 입력합니다.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[64vh] overflow-y-auto bg-[#f5f9ff] px-5 py-4">
            <div className="glass-row grid gap-3 p-3 md:grid-cols-2">
              <label className="text-xs font-black text-slate-600">
                시작일
                <input
                  type="date"
                  value={item.start_date}
                  onChange={(event) => updateItem({ start_date: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-black text-slate-600">
                완료일
                <input
                  type="date"
                  value={item.completion_date}
                  onChange={(event) => updateItem({ completion_date: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-black text-slate-600 md:col-span-2">
                공사명(전자결제 제목)
                <input
                  value={item.construction_name}
                  onChange={(event) => updateItem({ construction_name: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                  placeholder="공사명을 입력하세요."
                />
              </label>
              <label className="text-xs font-black text-slate-600 md:col-span-2">
                공사내용
                <textarea
                  value={item.construction_content}
                  rows={4}
                  onChange={(event) => updateItem({ construction_content: event.target.value })}
                  className="mt-1 min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="공사 내용을 입력하세요."
                />
              </label>
              <label className="text-xs font-black text-slate-600">
                진행업체
                <input
                  value={item.contractor}
                  onChange={(event) => updateItem({ contractor: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                  placeholder="진행업체"
                />
              </label>
              <label className="text-xs font-black text-slate-600">
                공사금액
                <input
                  value={item.construction_amount}
                  onChange={(event) => updateItem({ construction_amount: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                  placeholder="예: 10,000,000원"
                />
              </label>
              <label className="text-xs font-black text-slate-600">
                상태
                <select
                  value={item.status}
                  onChange={(event) => updateItem({ status: event.target.value as FacilityConstructionStatus })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                >
                  {facilityStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black text-slate-600">
                비고
                <input
                  value={item.note}
                  onChange={(event) => updateItem({ note: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                  placeholder="비고"
                />
              </label>
              {message ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 md:col-span-2">
                  {message}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button type="button" onClick={onClose} className="tool-button">
              취소
            </button>
            <button type="button" onClick={saveItem} className="tool-button tool-button-primary">
              <Save className="h-4 w-4" aria-hidden="true" />
              {initialItem ? "수정 완료" : "등록"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function HolidayWorkTable({
  items,
  disabled,
  onItemsChange,
  onCreateItem,
  onEditItem
}: {
  items: HolidayWorkItem[];
  disabled?: boolean;
  onItemsChange: (items: HolidayWorkItem[]) => void;
  onCreateItem: () => void;
  onEditItem: (item: HolidayWorkItem) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const toggleRow = (itemId: string) => {
    setMessage("");
    setSelectedIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  };
  const toggleAll = () => {
    setMessage("");
    setSelectedIds(allSelected ? [] : items.map((item) => item.id));
  };
  const editSelectedItem = () => {
    setMessage("");
    if (selectedIds.length !== 1) {
      setMessage("수정할 공휴일근무 내역을 1건만 선택하세요.");
      return;
    }
    const selectedItem = items.find((item) => item.id === selectedIds[0]);
    if (selectedItem) {
      onEditItem(selectedItem);
    }
  };
  const deleteSelectedItems = () => {
    setMessage("");
    if (selectedIds.length === 0) {
      setMessage("삭제할 공휴일근무 내역을 선택하세요.");
      return;
    }
    const selectedIdSet = new Set(selectedIds);
    onItemsChange(items.filter((item) => !selectedIdSet.has(item.id)));
    setSelectedIds([]);
  };

  return (
    <div className="rounded-2xl border border-[#d9e7f7] bg-white/88 shadow-[0_14px_32px_rgba(16,34,61,0.05)]">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[#e5eef9] px-3 py-3">
        <button type="button" onClick={onCreateItem} disabled={disabled} className="tool-button tool-button-primary min-h-10 py-2 disabled:opacity-50">
          <Plus className="h-4 w-4" aria-hidden="true" />
          등록
        </button>
        <button type="button" onClick={editSelectedItem} disabled={disabled} className="tool-button min-h-10 py-2 disabled:opacity-50">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          수정
        </button>
        <button type="button" onClick={deleteSelectedItems} disabled={disabled} className="tool-button min-h-10 py-2 text-rose-600 disabled:opacity-50">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          삭제
        </button>
      </div>
      {message ? (
        <p className="mx-3 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {message}
        </p>
      ) : null}
      <div className="overflow-x-hidden">
        <table className="table-sticky w-full table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[17%]" />
            <col className="w-[9%]" />
            <col className="w-[27%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-2 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={disabled || items.length === 0}
                  className="h-4 w-4 accent-[#075be8]"
                  aria-label="공휴일근무 전체 선택"
                />
              </th>
              <th className="px-2 py-2.5">일자</th>
              <th className="px-2 py-2.5">화주</th>
              <th className="px-2 py-2.5">근무자</th>
              <th className="px-2 py-2.5">도급인원</th>
              <th className="px-2 py-2.5">근무사유</th>
              <th className="px-2 py-2.5">청구여부</th>
              <th className="px-2 py-2.5">비고</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                  등록된 공휴일근무 내역이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleRow(item.id)}
                      disabled={disabled}
                      className="h-4 w-4 accent-[#075be8]"
                      aria-label={`${item.client_name || "공휴일근무"} 선택`}
                    />
                  </td>
                  <td className="break-words px-2 py-2.5">{item.work_date || "-"}</td>
                  <td className="break-words px-2 py-2.5 font-black text-[#10223d]">{item.client_name || "-"}</td>
                  <td className="px-2 py-2.5">
                    {item.worker_names.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.worker_names.map((workerName) => (
                          <span key={workerName} className="inline-flex rounded-full border border-[#d9e7f7] bg-[#f5f9ff] px-2 py-0.5 text-[11px] font-black text-[#10223d]">
                            {workerName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="break-words px-2 py-2.5">{item.contract_worker_count || "0"}</td>
                  <td className="whitespace-pre-wrap break-words px-2 py-2.5 leading-5 text-slate-600">{item.work_reason || "-"}</td>
                  <td className="px-2 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black",
                        item.is_billed ? "border-blue-100 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600"
                      )}
                    >
                      {item.is_billed ? "청구" : "미청구"}
                    </span>
                  </td>
                  <td className="whitespace-pre-wrap break-words px-2 py-2.5 leading-5 text-slate-600">{item.note || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HolidayWorkDialog({
  initialItem,
  clientOptions,
  workerOptions,
  onClose,
  onSave
}: {
  initialItem?: HolidayWorkItem | null;
  clientOptions: HolidayClientOption[];
  workerOptions: HolidayWorkerOption[];
  onClose: () => void;
  onSave: (item: HolidayWorkItem) => void;
}) {
  const [item, setItem] = useState<HolidayWorkItem>(() => initialItem ?? makeEmptyHolidayWorkItem());
  const [message, setMessage] = useState("");
  const clientNames = ["공통", ...clientOptions.map((option) => option.client_name)];
  const uniqueClientNames = Array.from(new Set(item.client_name ? [item.client_name, ...clientNames] : clientNames));
  const workerNames = workerOptions.map((option) => option.full_name);
  const uniqueWorkerNames = Array.from(new Set([...item.worker_names, ...workerNames]));
  const updateItem = (patch: Partial<HolidayWorkItem>) => {
    setMessage("");
    setItem((current) => ({ ...current, ...patch }));
  };
  const toggleWorker = (workerName: string) => {
    updateItem({
      worker_names: item.worker_names.includes(workerName)
        ? item.worker_names.filter((currentWorkerName) => currentWorkerName !== workerName)
        : [...item.worker_names, workerName]
    });
  };
  const saveItem = () => {
    if (!item.work_date || !item.client_name.trim() || item.worker_names.length === 0 || !item.work_reason.trim()) {
      setMessage("일자, 화주, 근무자, 근무사유는 필수입니다.");
      return;
    }
    onSave({
      ...item,
      client_name: item.client_name.trim(),
      worker_names: item.worker_names.map((workerName) => workerName.trim()).filter(Boolean),
      contract_worker_count: item.contract_worker_count.trim(),
      work_reason: item.work_reason.trim(),
      note: item.note.trim()
    });
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="holiday-work-dialog-title">
        <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/95 shadow-[0_28px_80px_rgba(16,34,61,0.24)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="holiday-work-dialog-title" className="text-lg font-black text-slate-900">
                {initialItem ? "공휴일근무 수정" : "공휴일근무 등록"}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">공휴일 근무자와 근무사유, 청구 여부를 입력합니다.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[64vh] overflow-y-auto bg-[#f5f9ff] px-5 py-4">
            <div className="glass-row grid gap-3 p-3 md:grid-cols-2">
              <label className="text-xs font-black text-slate-600">
                일자
                <input
                  type="date"
                  value={item.work_date}
                  onChange={(event) => updateItem({ work_date: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-black text-slate-600">
                화주
                <select
                  value={item.client_name}
                  onChange={(event) => updateItem({ client_name: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                >
                  {uniqueClientNames.map((clientName) => (
                    <option key={clientName} value={clientName}>
                      {clientName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black text-slate-600">
                청구여부
                <select
                  value={item.is_billed ? "true" : "false"}
                  onChange={(event) => updateItem({ is_billed: event.target.value === "true" })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                >
                  <option value="false">미청구</option>
                  <option value="true">청구</option>
                </select>
              </label>
              <label className="text-xs font-black text-slate-600">
                도급인원
                <input
                  type="number"
                  min="0"
                  value={item.contract_worker_count}
                  onChange={(event) => updateItem({ contract_worker_count: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                  placeholder="0"
                />
              </label>
              <div className="text-xs font-black text-slate-600 md:col-span-2">
                근무자
                <div className="mt-1 rounded-2xl border border-slate-300 bg-white p-3">
                  {uniqueWorkerNames.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#b9cce6] px-3 py-4 text-center text-sm font-bold text-slate-400">
                      선택 가능한 근무자가 없습니다.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {uniqueWorkerNames.map((workerName) => (
                        <label key={workerName} className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#f5f9ff] px-3 py-2 text-sm font-bold text-[#10223d]">
                          <input
                            type="checkbox"
                            checked={item.worker_names.includes(workerName)}
                            onChange={() => toggleWorker(workerName)}
                            className="h-4 w-4 accent-[#075be8]"
                          />
                          {workerName}
                        </label>
                      ))}
                    </div>
                  )}
                  {item.worker_names.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                      {item.worker_names.map((workerName) => (
                        <span key={workerName} className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
                          {workerName}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <label className="text-xs font-black text-slate-600 md:col-span-2">
                근무사유
                <textarea
                  value={item.work_reason}
                  rows={4}
                  onChange={(event) => updateItem({ work_reason: event.target.value })}
                  className="mt-1 min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="근무사유를 입력하세요."
                />
              </label>
              <label className="text-xs font-black text-slate-600 md:col-span-2">
                비고
                <input
                  value={item.note}
                  onChange={(event) => updateItem({ note: event.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                  placeholder="비고"
                />
              </label>
              {message ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 md:col-span-2">
                  {message}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button type="button" onClick={onClose} className="tool-button">
              취소
            </button>
            <button type="button" onClick={saveItem} className="tool-button tool-button-primary">
              <Save className="h-4 w-4" aria-hidden="true" />
              {initialItem ? "수정 완료" : "등록"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function PreviewBlock({
  title,
  value,
  structured,
  importance,
  categoryId,
  visibleStructuredItems,
  categories,
  categoryName,
  disabled,
  onEdit
}: {
  title: string;
  value: string;
  structured: boolean;
  importance: Importance;
  categoryId: string;
  visibleStructuredItems?: DepartmentCommonContentItem[];
  categories: Category[];
  categoryName: string;
  disabled?: boolean;
  onEdit: () => void;
}) {
  const structuredItems = structured
    ? (visibleStructuredItems ?? parseCommonContentItems(value, importance, categoryId))
        .filter((item) => item.title.trim() || item.content.trim())
    : [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-500">{title}</p>
        <button type="button" onClick={onEdit} disabled={disabled} className="section-chip disabled:opacity-50">
          수정
        </button>
      </div>
      <div className="min-h-24 rounded-2xl bg-[#f5f9ff] px-3 py-2 text-sm leading-6 text-slate-700">
        {structured ? (
          structuredItems.length > 0 ? (
            <ol className="space-y-2">
              {structuredItems.map((item, index) => (
                <li key={`${item.title}-${index}`} className="flex gap-2">
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-7 min-w-11 shrink-0 items-center justify-center rounded-xl border px-2 text-xs font-black",
                      importanceIconClassName(item.importance)
                    )}
                    title={categories.find((category) => category.id === item.work_category_id)?.category_name ?? "기타"}
                  >
                    {categories.find((category) => category.id === item.work_category_id)?.category_name ?? "기타"}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-black leading-5 text-[#10223d]">
                      {item.title.trim() || "제목 없음"}
                    </span>
                    <span className="mt-0.5 block whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">
                      {item.content.trim() || "-"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <span className="text-slate-400">-</span>
          )
        ) : (
          <div className="flex gap-2">
            <span
              className={cn(
                "mt-0.5 inline-flex h-7 min-w-11 shrink-0 items-center justify-center rounded-xl border px-2 text-xs font-black",
                importanceIconClassName(importance)
              )}
              title={categoryName}
            >
              {categoryName}
            </span>
            <span className="min-w-0">
              <span className="mt-0.5 block whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">
                {value.trim() || "-"}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function DepartmentContentPeriodDialog({
  sectionLabel,
  period,
  categories,
  content,
  onClose,
  onComplete,
  onUpdate
}: {
  sectionLabel: string;
  period: ContentPeriod;
  categories: Category[];
  content?: DepartmentContent;
  onClose: () => void;
  onComplete: () => void;
  onUpdate: (patch: Partial<DepartmentContent>) => void;
}) {
  const [commonValidationMessage, setCommonValidationMessage] = useState("");
  const isCurrent = period === "current";
  const dialogTitle = `${sectionLabel} ${isCurrent ? "금주 실시사항" : "차주 예정사항"} 작성`;
  const importance = isCurrent ? content?.current_importance ?? "medium" : content?.next_importance ?? "medium";
  const categoryId = isCurrent ? content?.current_work_category_id ?? categories[0]?.id ?? "" : content?.next_work_category_id ?? categories[0]?.id ?? "";
  const value = isCurrent ? content?.current_week_content ?? "" : content?.next_week_content ?? "";
  const isCommonSection = content?.section_type === "common";
  const [draftCommonItems, setDraftCommonItems] = useState(() => commonDialogItems(value, importance, categoryId));
  const commonScrollRef = useRef<HTMLDivElement>(null);
  const lastCommonTitleRef = useRef<HTMLTextAreaElement | null>(null);
  const previousCommonItemCountRef = useRef(draftCommonItems.length);
  const commonItems = isCommonSection ? draftCommonItems : [];
  const updatePeriodValue = (nextValue: string) => {
    onUpdate(isCurrent ? { current_week_content: nextValue } : { next_week_content: nextValue });
  };
  const updateCommonItems = (nextItems: DepartmentCommonContentItem[]) => {
    setCommonValidationMessage("");
    setDraftCommonItems(nextItems);
  };
  const commitCommonItems = () => {
    const firstItem = draftCommonItems.find((item) => item.title.trim() || item.content.trim()) ?? draftCommonItems[0];
    onUpdate({
      ...(isCurrent
        ? {
            current_importance: firstItem?.importance ?? importance,
            current_work_category_id: firstItem?.work_category_id ?? categoryId,
            current_week_content: serializeCommonContentItems(draftCommonItems)
          }
        : {
            next_importance: firstItem?.importance ?? importance,
            next_work_category_id: firstItem?.work_category_id ?? categoryId,
            next_week_content: serializeCommonContentItems(draftCommonItems)
          })
    });
  };
  const completeDialog = () => {
    if (isCommonSection) {
      const invalidIndex = commonItems.findIndex((item) => !item.title.trim() || !item.content.trim());
      if (invalidIndex >= 0) {
        setCommonValidationMessage(`${invalidIndex + 1}번째 항목의 제목과 내용을 모두 입력하세요.`);
        return;
      }
      commitCommonItems();
    }
    onComplete();
  };

  useEffect(() => {
    if (!isCommonSection) {
      return;
    }
    if (draftCommonItems.length > previousCommonItemCountRef.current) {
      commonScrollRef.current?.scrollTo({
        top: commonScrollRef.current.scrollHeight,
        behavior: "smooth"
      });
      lastCommonTitleRef.current?.focus();
    }
    previousCommonItemCountRef.current = draftCommonItems.length;
  }, [draftCommonItems.length, isCommonSection]);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="department-content-dialog-title">
        <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/94 shadow-[0_28px_80px_rgba(16,34,61,0.22)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="department-content-dialog-title" className="text-lg font-black text-slate-900">
                {dialogTitle}
              </h2>
              <p className="mt-1 text-sm text-slate-500">중요도, 업무구분, 내용을 입력하면 선택한 탭에 바로 표시됩니다.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div ref={commonScrollRef} className="max-h-[62vh] space-y-3 overflow-y-auto bg-[#f5f9ff] px-5 py-4">
            {isCommonSection ? (
              commonItems.map((item, index) => (
                <div
                  key={`${period}-${index}`}
                  className="glass-row grid gap-3 p-3 md:grid-cols-[84px_105px_minmax(280px,0.95fr)_minmax(420px,1.45fr)_auto]"
                >
                  <label className="text-xs font-black text-slate-600">
                    중요도
                    <select
                      value={item.importance}
                      onChange={(event) =>
                        updateCommonItems(
                          commonItems.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, importance: event.target.value as Importance } : row
                          )
                        )
                      }
                      className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 text-sm font-normal"
                    >
                      {importanceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-black text-slate-600">
                    업무구분
                    <select
                      value={item.work_category_id}
                      onChange={(event) =>
                        updateCommonItems(
                          commonItems.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, work_category_id: event.target.value } : row
                          )
                        )
                      }
                      className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 text-sm font-normal"
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.category_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-black text-slate-600">
                    제목
                    <textarea
                      ref={index === commonItems.length - 1 ? lastCommonTitleRef : null}
                      required
                      value={item.title}
                      maxLength={120}
                      rows={3}
                      onChange={(event) =>
                        updateCommonItems(
                          commonItems.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, title: event.target.value } : row
                          )
                        )
                      }
                      className="mt-1 min-h-[86px] w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                      placeholder="제목"
                    />
                  </label>
                  <label className="text-xs font-black text-slate-600">
                    내용
                    <textarea
                      required
                      value={item.content}
                      rows={3}
                      onChange={(event) =>
                        updateCommonItems(
                          commonItems.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, content: event.target.value } : row
                          )
                        )
                      }
                      className="mt-1 min-h-[86px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                      placeholder={`${isCurrent ? "금주 실시사항" : "차주 예정사항"} 내용을 입력하세요.`}
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      className="icon-tool-button text-rose-600"
                      type="button"
                      aria-label="공통사항 행 삭제"
                      onClick={() => updateCommonItems(commonItems.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="glass-row grid gap-3 p-3 md:grid-cols-[110px_210px_minmax(420px,1fr)]">
                <MetaSelectGroup
                  importance={importance}
                  categoryId={categoryId}
                  categories={categories}
                  onImportanceChange={(nextImportance) => onUpdate(isCurrent ? { current_importance: nextImportance } : { next_importance: nextImportance })}
                  onCategoryChange={(nextCategoryId) => onUpdate(isCurrent ? { current_work_category_id: nextCategoryId } : { next_work_category_id: nextCategoryId })}
                />
                <label className="text-xs font-black text-slate-600">
                  내용
                  <textarea
                    value={value}
                    rows={4}
                    onChange={(event) => updatePeriodValue(event.target.value)}
                    className="mt-1 min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                    placeholder={`${isCurrent ? "금주 실시사항" : "차주 예정사항"}을 입력하세요.`}
                  />
                </label>
              </div>
            )}
            {commonValidationMessage ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {commonValidationMessage}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-5 py-4">
            {isCommonSection ? (
              <button
                type="button"
                onClick={() =>
                  updateCommonItems([
                    ...commonItems,
                    { importance, work_category_id: categoryId, title: "", content: "", sort_order: commonItems.length }
                  ])
                }
                className="tool-button"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                항목 추가
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={completeDialog} className="tool-button tool-button-primary">
              <Save className="h-4 w-4" aria-hidden="true" />
              작성 완료
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function MetaSelectGroup({
  importance,
  categoryId,
  categories,
  onImportanceChange,
  onCategoryChange
}: {
  importance: Importance;
  categoryId: string;
  categories: Category[];
  onImportanceChange: (importance: Importance) => void;
  onCategoryChange: (categoryId: string) => void;
}) {
  const selectedCategoryName = categories.find((category) => category.id === categoryId)?.category_name ?? "기타";

  return (
    <>
      <label className="text-xs font-black text-slate-600">
        중요도
        <select
          value={importance}
          onChange={(event) => onImportanceChange(event.target.value as Importance)}
          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 text-sm font-normal"
        >
          {importanceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-black text-slate-600">
        업무구분
        <div className="mt-1 flex gap-2">
          <select
            value={categoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm font-normal"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.category_name}
              </option>
            ))}
          </select>
          <span
            className={cn(
              "inline-flex h-10 min-w-11 shrink-0 items-center justify-center rounded-xl border px-2 text-xs font-black",
              importanceIconClassName(importance)
            )}
            title={selectedCategoryName}
          >
            {selectedCategoryName}
          </span>
        </div>
      </label>
    </>
  );
}
