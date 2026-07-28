"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarDays, CheckCircle2, ClipboardList, Hammer, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { cancelDepartmentSubmissionAction, loadDepartmentSubmissionAction, saveDepartmentSubmissionAction } from "@/actions/reports";
import { ActionMessage } from "@/components/common/ActionMessage";
import { cn } from "@/lib/utils/cn";
import { getCurrentWeekOption, type WeekOption } from "@/lib/dates/week";
import { WeekSelect } from "./WeekSelect";
import type { DepartmentSubmissionStatus, Importance } from "@/types/enums";

type Department = { id: string; department_name: string };
type Category = { id: string; category_name: string; icon_key: string };
type HolidayClientOption = { id: string; client_name: string };
type HolidayWorkerOption = { id: string; full_name: string };
type SectionValue = (typeof sections)[number]["value"];
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
  department_weekly_contents: LoadedDepartmentContent[];
};
type ContentPeriod = "current" | "next";
type ActiveDialog = { section: SectionValue; period: ContentPeriod } | null;
type DepartmentCommonContentItem = {
  importance: Importance;
  work_category_id: string;
  title: string;
  content: string;
  sort_order: number;
};
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
const sections = [
  { value: "common", label: "공통사항", icon: ClipboardList },
  { value: "facility", label: "시설공사", icon: Hammer },
  { value: "vacancy", label: "공실", icon: Building2 },
  { value: "holiday_work", label: "공휴일근무", icon: CalendarDays }
] as const;

const importanceOptions: { value: Importance; label: string }[] = [
  { value: "very_high", label: "매우높음" },
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" }
];
const COMMON_CONTENT_FORMAT = "department-common-items/v1";
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

function normalizeImportance(value: unknown, fallback: Importance): Importance {
  return importanceOptions.some((option) => option.value === value) ? (value as Importance) : fallback;
}

function parseCommonContentItems(
  value: string,
  fallbackImportance: Importance,
  fallbackCategoryId: string
): DepartmentCommonContentItem[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue) as {
      format?: string;
      items?: Array<Partial<DepartmentCommonContentItem>>;
    };
    if (parsed.format === COMMON_CONTENT_FORMAT && Array.isArray(parsed.items)) {
      return parsed.items
        .map((item, index) => ({
          importance: normalizeImportance(item.importance, fallbackImportance),
          work_category_id:
            typeof item.work_category_id === "string" && item.work_category_id ? item.work_category_id : fallbackCategoryId,
          title: String(item.title ?? ""),
          content: String(item.content ?? ""),
          sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : index
        }))
        .sort((left, right) => left.sort_order - right.sort_order);
    }
  } catch {
    // Existing plain text content is rendered as a single content row.
  }

  return [
    {
      importance: fallbackImportance,
      work_category_id: fallbackCategoryId,
      title: "내용",
      content: trimmedValue,
      sort_order: 0
    }
  ];
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
  return JSON.stringify({ format: COMMON_CONTENT_FORMAT, items: normalizedItems });
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
  reviewSlot,
  holidayClientOptions = [],
  holidayWorkerOptions = [],
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
  reviewSlot?: ReactNode;
  holidayClientOptions?: HolidayClientOption[];
  holidayWorkerOptions?: HolidayWorkerOption[];
  initialSubmission?: DepartmentSubmissionEditorInitialSubmission | null;
  initialLookupDepartmentId?: string | null;
  initialLookupWeekStartDate?: string;
  requireExplicitDepartmentSelection?: boolean;
}) {
  const [active, setActive] = useState<SectionValue>("common");
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [facilityEditingItem, setFacilityEditingItem] = useState<FacilityConstructionItem | null>(null);
  const [holidayWorkDialogOpen, setHolidayWorkDialogOpen] = useState(false);
  const [holidayWorkEditingItem, setHolidayWorkEditingItem] = useState<HolidayWorkItem | null>(null);
  const firstCategoryId = categories[0]?.id ?? "";
  const currentWeek = getCurrentWeekOption();
  const departmentId = defaultDepartmentId ?? (requireExplicitDepartmentSelection ? "" : departments[0]?.id ?? "");
  const [weekStartDate, setWeekStartDate] = useState(currentWeek.weekStartDate);
  const [submissionId, setSubmissionId] = useState(initialSubmission?.id ?? "");
  const [loadedStatus, setLoadedStatus] = useState<DepartmentSubmissionStatus | null>(initialSubmission?.status ?? null);
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
        setLoadState(null);
      }
      return result;
    },
    null
  );
  const serializedContents = useMemo(() => JSON.stringify(contents), [contents]);
  const activeContent = contents.find((content) => content.section_type === active);
  const activeSectionLabel = sections.find((section) => section.value === active)?.label ?? "공통사항";
  const effectiveStatus = loadedStatus;
  const effectiveSubmissionId = submissionId;
  const canEditSubmission = isEditableSubmissionStatus(effectiveStatus);
  const isSubmittedToDivision = effectiveStatus === "submitted_to_division";
  const isSubmissionBusy = isLoadingSubmission || isSavingSubmission || isCancellingSubmission;
  const facilityItems = useMemo(
    () => parseFacilityConstructionItems(contents.find((content) => content.section_type === "facility")?.current_week_content ?? ""),
    [contents]
  );
  const holidayWorkItems = useMemo(
    () => parseHolidayWorkItems(contents.find((content) => content.section_type === "holiday_work")?.current_week_content ?? ""),
    [contents]
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
          setContents(makeEmptyContents(firstCategoryId));
          setLoadState({ ok: false, message: result.message ?? "부서자료를 불러오지 못했습니다." });
          return;
        }

        setSubmissionId(result.submission?.id ?? "");
        setLoadedStatus(result.submission?.status ?? null);
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

  function handleWeekSelectionChange(week: WeekOption) {
    setWeekStartDate((current) => {
      if (current !== week.weekStartDate) {
        setSubmissionId("");
        setLoadedStatus(null);
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-[1rem] bg-[#f5f9ff] p-1 lg:grid-cols-4" role="tablist" aria-label="부서자료 화면 탭">
            {sections.map((section) => {
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
                    "relative flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-extrabold tracking-normal transition",
                    isSelected
                      ? "bg-white text-[#075be8] shadow-[0_8px_18px_rgba(7,91,232,0.12)]"
                      : "text-slate-500 hover:bg-white/70 hover:text-[#10223d]"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">{section.label}</span>
                  {isSelected ? (
                    <span className="absolute bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-[#075be8]" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
              className="tool-button tool-button-primary min-h-9 py-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {isSubmittedToDivision ? "확정완료" : isSavingSubmission ? "확정 중" : "확정"}
            </button>
            {isSubmittedToDivision ? (
              <button
                type="submit"
                formAction={cancelAction}
                disabled={!canSubmit || isSubmissionBusy}
                className="tool-button min-h-9 py-1.5 text-[#075be8] disabled:opacity-50"
                title={!canSubmit ? "확정취소는 부서장과 관리자만 가능합니다." : undefined}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {isCancellingSubmission ? "취소 중" : "확정취소"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {active === "facility" || active === "holiday_work" || !children ? null : (
        <div className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/80 p-2 shadow-[0_14px_34px_rgba(16,34,61,0.06)]">
          {children}
        </div>
      )}

      <section className="rounded-2xl border border-[#d9e7f7] bg-white/86 p-3 shadow-[0_14px_32px_rgba(16,34,61,0.05)]">
        {active === "holiday_work" ? null : (
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
                  onClick={() => setActiveDialog({ section: active, period: "current" })}
                  disabled={!canEditSubmission || isSubmissionBusy}
                  className="tool-button min-h-9 py-1.5 disabled:opacity-50"
                >
                  금주 실시사항 작성
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDialog({ section: active, period: "next" })}
                  disabled={!canEditSubmission || isSubmissionBusy}
                  className="tool-button min-h-9 py-1.5 disabled:opacity-50"
                >
                  차주 예정사항 작성
                </button>
              </div>
            )}
          </div>
        )}
        {active === "facility" ? (
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
        ) : activeContent ? (
          <div className="grid gap-3 md:grid-cols-2">
            <PreviewBlock
              title="금주 실시사항"
              value={activeContent.current_week_content}
              structured={active === "common"}
              importance={activeContent.current_importance}
              categoryId={activeContent.current_work_category_id}
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
              categories={categories}
              categoryName={categories.find((category) => category.id === activeContent.next_work_category_id)?.category_name ?? "기타"}
              disabled={!canEditSubmission || isSubmissionBusy}
              onEdit={() => setActiveDialog({ section: active, period: "next" })}
            />
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
      {active === "facility" || active === "holiday_work" ? null : reviewSlot}
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
    </form>
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
  categories: Category[];
  categoryName: string;
  disabled?: boolean;
  onEdit: () => void;
}) {
  const structuredItems = structured
    ? parseCommonContentItems(value, importance, categoryId).filter((item) => item.title.trim() || item.content.trim())
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
