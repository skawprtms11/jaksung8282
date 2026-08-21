"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ClipboardList,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  X
} from "lucide-react";
import { loadClientReportForEditAction, saveClientReportAction, type SavedClientReportRow } from "@/actions/reports";
import { ActionMessage } from "@/components/common/ActionMessage";
import { getCurrentWeekOption, getReportMonthByThursday, getWeekEndDate, getWeekOfMonth } from "@/lib/dates/week";
import { cn } from "@/lib/utils/cn";
import { VOLUME_UNIT } from "@/types/enums";
import type { ClientReportStatus, Importance, ItemPeriod, VolumeType, VolumeUnit } from "@/types/enums";

type Department = { id: string; department_name: string };
type Client = { id: string; client_name: string; department_id: string };
type Category = { id: string; category_name: string; icon_key: string };
type ItemDraft = {
  // 저장 payload에 실려 DB 항목과 id 기준으로 매칭된다(요청사항·관리자수정 이력 보존). 신규 항목은 없음.
  id?: string;
  item_period: ItemPeriod;
  importance: Importance;
  work_category_id: string;
  title: string;
  content: string;
  sort_order: number;
};
type VolumeDraft = {
  volume_type: VolumeType;
  // 빈 문자열 = 아직 수량을 입력하지 않은 행. 저장 시 제외되거나(메모 없음) 0으로 변환된다.
  quantity: number | "";
  unit: VolumeUnit;
  custom_unit?: string | null;
  note?: string | null;
  sort_order: number;
};
type ActiveDialog = ItemPeriod | "volumes" | null;
export type ClientReportEditorInitialReport = {
  id: string;
  department_id: string;
  client_id: string;
  week_start_date: string;
  items: ItemDraft[];
  volumes: VolumeDraft[];
};

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

const importanceOptions: { value: Importance; label: string }[] = [
  { value: "very_high", label: "매우높음" },
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" }
];

function importanceDotClassName(importance: Importance) {
  if (importance === "very_high") return "u-dot-pink";
  if (importance === "high") return "u-dot-amber";
  if (importance === "medium") return "u-dot-green";
  return "u-dot-blue";
}

const volumeTypeOptions: { value: VolumeType; label: string }[] = [
  { value: "inbound", label: "입고" },
  { value: "outbound", label: "출고" },
  { value: "inventory", label: "재고" },
  { value: "order", label: "주문" },
  { value: "return", label: "반품" },
  { value: "etc", label: "기타" }
];

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// 저장 페이로드와 같은 규칙(빈 항목 제외, 기간별 순번 재부여)으로 직렬화해
// 팝업의 화주 전환 시 "저장 안 된 변경이 있는지"를 판별한다.
// 수량이 비어 있고 메모·단위도 없는 행은 손대지 않은 기본 행이므로 저장 대상에서 제외한다.
function normalizeVolumeDrafts(volumes: VolumeDraft[]) {
  return volumes
    .filter(
      (volume) =>
        volume.quantity !== "" || (volume.note ?? "").trim() !== "" || (volume.custom_unit ?? "").trim() !== ""
    )
    .map((volume, index) => ({
      ...volume,
      quantity: volume.quantity === "" ? 0 : volume.quantity,
      sort_order: index
    }));
}

function makeDraftSnapshot(items: ItemDraft[], volumes: VolumeDraft[]) {
  const sortOrderByPeriod: Record<ItemPeriod, number> = { current: 0, next: 0 };
  const normalizedItems = items
    .filter((item) => item.title.trim() !== "" || item.content.trim() !== "")
    .map((item) => ({ ...item, sort_order: sortOrderByPeriod[item.item_period]++ }));
  return `${JSON.stringify(normalizedItems)}|${JSON.stringify(normalizeVolumeDrafts(volumes))}`;
}

export const NO_SPECIAL_ISSUE_TEXT = "특이사항 없음";

export function ClientReportEditor({
  departments,
  clients,
  categories,
  defaultDepartmentId,
  defaultClientId,
  selectedWeekStartDate,
  initialReport,
  autoSaveExistingReport,
  currentReportStatus,
  initialDialog,
  mobileMode = false,
  onSaved,
  onEditDialogClosed
}: {
  departments: Department[];
  clients: Client[];
  categories: Category[];
  defaultDepartmentId?: string | null;
  defaultClientId?: string | null;
  selectedWeekStartDate: string;
  initialReport?: ClientReportEditorInitialReport | null;
  autoSaveExistingReport?: boolean;
  currentReportStatus?: ClientReportStatus | null;
  initialDialog?: ActiveDialog;
  mobileMode?: boolean;
  onSaved?: (report?: SavedClientReportRow) => void;
  onEditDialogClosed?: () => void;
}) {
  const draftSubmitRef = useRef<HTMLButtonElement>(null);
  const [state, action] = useActionState(saveClientReportAction, null);
  const isEditMode = Boolean(initialReport);
  const selectedClient =
    clients.find((client) => client.id === initialReport?.client_id) ??
    (defaultClientId ? clients.find((client) => client.id === defaultClientId) : null);
  const clientId = initialReport?.client_id ?? selectedClient?.id ?? "";
  // 작성 팝업에서 화주를 전환하면 대상 화주·자료 id가 헤더 선택과 달라진다. 폼 전송은 이 상태를 따른다.
  const [activeClientId, setActiveClientId] = useState(clientId);
  const [activeReportId, setActiveReportId] = useState(initialReport?.id ?? "");
  const [isSwitchingClient, setIsSwitchingClient] = useState(false);
  const activeClient = clients.find((client) => client.id === activeClientId) ?? selectedClient;
  const departmentId =
    (activeClientId !== clientId ? activeClient?.department_id : null) ??
    initialReport?.department_id ??
    selectedClient?.department_id ??
    defaultDepartmentId ??
    departments[0]?.id ??
    "";
  const fallbackWeek = getCurrentWeekOption();
  const reportWeekStartDate = /^\d{4}-\d{2}-\d{2}$/.test(initialReport?.week_start_date ?? selectedWeekStartDate)
    ? initialReport?.week_start_date ?? selectedWeekStartDate
    : fallbackWeek.weekStartDate;
  const reportWeekEndDate = getWeekEndDate(reportWeekStartDate);
  const reportMonth = getReportMonthByThursday(reportWeekStartDate);
  const reportWeekOfMonth = getWeekOfMonth(reportWeekStartDate);
  const [items, setItems] = useState<ItemDraft[]>(initialReport?.items ?? []);
  const [volumes, setVolumes] = useState<VolumeDraft[]>(initialReport?.volumes ?? []);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(initialReport ? initialDialog ?? null : null);
  const [selectionMessage, setSelectionMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const previousInitialDialogRef = useRef<ActiveDialog>(initialDialog ?? null);
  const firstCategory = categories[0]?.id ?? "";
  const needsClientSelection = !isEditMode && !clientId;
  const isConfirmedReport = currentReportStatus === "submitted" || currentReportStatus === "approved";
  const currentItems = items.filter((item) => item.item_period === "current");
  const nextItems = items.filter((item) => item.item_period === "next");
  const normalizedItems = useMemo(() => {
    const sortOrderByPeriod: Record<ItemPeriod, number> = { current: 0, next: 0 };

    // 팝업을 열기만 하면 빈 항목이 자동 추가된다. 제목·내용이 모두 빈 항목을 그대로 보내면
    // 제목 필수 검증에 걸려 저장 전체가 실패하므로(한쪽만 작성한 자료가 목록에 안 보이는 원인) 저장 대상에서 제외한다.
    return items
      .filter((item) => item.title.trim() !== "" || item.content.trim() !== "")
      .map((item) => ({
        ...item,
        sort_order: sortOrderByPeriod[item.item_period]++
      }));
  }, [items]);
  const normalizedVolumes = useMemo(() => normalizeVolumeDrafts(volumes), [volumes]);
  const serializedItems = useMemo(() => JSON.stringify(normalizedItems), [normalizedItems]);
  const serializedVolumes = useMemo(() => JSON.stringify(normalizedVolumes), [normalizedVolumes]);
  // 화주 전환 시 미저장 변경 감지용: 마지막으로 불러오거나 저장한 시점의 스냅샷과 현재 상태를 비교한다.
  const initialSnapshot = useMemo(
    () => makeDraftSnapshot(initialReport?.items ?? [], initialReport?.volumes ?? []),
    [initialReport]
  );
  const draftSnapshotRef = useRef(initialSnapshot);
  const latestSnapshotRef = useRef(initialSnapshot);

  useEffect(() => {
    latestSnapshotRef.current = `${serializedItems}|${serializedVolumes}`;
  }, [serializedItems, serializedVolumes]);

  useEffect(() => {
    if (initialDialog && previousInitialDialogRef.current !== initialDialog) {
      setActiveDialog(initialDialog);
    }
    previousInitialDialogRef.current = initialDialog ?? null;
  }, [initialDialog]);

  useEffect(() => {
    if (!state?.ok) {
      return;
    }
    draftSnapshotRef.current = latestSnapshotRef.current;
    onSaved?.(state.data);
  }, [onSaved, state]);

  function addItem(item_period: ItemPeriod) {
    setItems((current) => [
      ...current,
      {
        item_period,
        importance: "medium",
        work_category_id: firstCategory,
        title: "",
        content: "",
        sort_order: current.filter((item) => item.item_period === item_period).length
      }
    ]);
  }

  function addVolume() {
    setVolumes((current) => [
      ...current,
      { volume_type: "inbound", quantity: "", unit: VOLUME_UNIT, note: "", sort_order: current.length }
    ]);
  }

  function openItemDialog(period: ItemPeriod) {
    if (needsClientSelection) {
      setSelectionMessage({ ok: false, message: "자료를 작성하려면 최상단 화주 필터에서 특정 화주를 선택하세요." });
      return;
    }
    setSelectionMessage(null);
    if (!items.some((item) => item.item_period === period)) {
      addItem(period);
    }
    setActiveDialog(period);
  }

  function openVolumeDialog() {
    if (needsClientSelection) {
      setSelectionMessage({ ok: false, message: "자료를 작성하려면 최상단 화주 필터에서 특정 화주를 선택하세요." });
      return;
    }
    setSelectionMessage(null);
    if (volumes.length === 0) {
      // 기본으로 입고·출고 두 행을 띄워 행 추가 없이 바로 작성하게 한다.
      setVolumes([
        { volume_type: "inbound", quantity: "", unit: VOLUME_UNIT, note: "", sort_order: 0 },
        { volume_type: "outbound", quantity: "", unit: VOLUME_UNIT, note: "", sort_order: 1 }
      ]);
    }
    setActiveDialog("volumes");
  }

  function updateItem(actualIndex: number, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((row, index) => (index === actualIndex ? { ...row, ...patch } : row)));
  }

  function setNoSpecialIssue(period: ItemPeriod, checked: boolean) {
    setItems((current) => {
      const others = current.filter((item) => item.item_period !== period);
      if (checked) {
        const periodItems = current.filter((item) => item.item_period === period);
        const hasWrittenContent = periodItems.some(
          (item) =>
            (item.title.trim() && item.title.trim() !== NO_SPECIAL_ISSUE_TEXT) ||
            (item.content.trim() && item.content.trim() !== NO_SPECIAL_ISSUE_TEXT)
        );
        if (hasWrittenContent && !window.confirm(`작성 중인 내용이 '${NO_SPECIAL_ISSUE_TEXT}'으로 대체됩니다. 계속할까요?`)) {
          return current;
        }
        return [
          ...others,
          {
            item_period: period,
            importance: "low" as Importance,
            work_category_id: firstCategory,
            title: NO_SPECIAL_ISSUE_TEXT,
            content: NO_SPECIAL_ISSUE_TEXT,
            sort_order: 0
          }
        ];
      }
      return [
        ...others,
        { item_period: period, importance: "medium" as Importance, work_category_id: firstCategory, title: "", content: "", sort_order: 0 }
      ];
    });
  }

  function updateVolume(index: number, patch: Partial<VolumeDraft>) {
    setVolumes((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function closeDialogAndRemoveEditParam() {
    setActiveDialog(null);
    onEditDialogClosed?.();
  }

  function completeDialog() {
    if (isEditMode && !autoSaveExistingReport) {
      closeDialogAndRemoveEditParam();
      return;
    }
    setActiveDialog(null);
    draftSubmitRef.current?.click();
  }

  async function handleDialogClientChange(nextClientId: string) {
    if (!nextClientId || nextClientId === activeClientId || isSwitchingClient) {
      return;
    }
    const nextClient = clients.find((client) => client.id === nextClientId);
    if (!nextClient) {
      return;
    }
    if (
      latestSnapshotRef.current !== draftSnapshotRef.current &&
      !window.confirm("저장하지 않은 작성 내용이 있습니다. 화주를 변경하면 사라집니다. 계속할까요?")
    ) {
      return;
    }
    setIsSwitchingClient(true);
    setSelectionMessage(null);
    try {
      const result = await loadClientReportForEditAction({
        department_id: nextClient.department_id,
        client_id: nextClientId,
        week_start_date: reportWeekStartDate
      });
      if (!result.ok) {
        setSelectionMessage({ ok: false, message: result.message ?? "화주 자료를 불러오지 못했습니다." });
        return;
      }
      if (result.status && result.status !== "draft" && result.status !== "rejected") {
        setSelectionMessage({
          ok: false,
          message: `${nextClient.client_name} 자료는 확정 상태입니다. 확정취소 후 수정할 수 있습니다.`
        });
        return;
      }
      const loadedItems = result.report?.items ?? [];
      const loadedVolumes = result.report?.volumes ?? [];
      draftSnapshotRef.current = makeDraftSnapshot(loadedItems, loadedVolumes);
      // 열려 있는 팝업에서 바로 이어 쓸 수 있게 빈 입력칸을 보충한다.
      setItems(
        (activeDialog === "current" || activeDialog === "next") &&
          !loadedItems.some((item) => item.item_period === activeDialog)
          ? [
              ...loadedItems,
              {
                item_period: activeDialog,
                importance: "medium" as Importance,
                work_category_id: firstCategory,
                title: "",
                content: "",
                sort_order: loadedItems.filter((item) => item.item_period === activeDialog).length
              }
            ]
          : loadedItems
      );
      setVolumes(
        activeDialog === "volumes" && loadedVolumes.length === 0
          ? [
              { volume_type: "inbound", quantity: "", unit: VOLUME_UNIT, note: "", sort_order: 0 },
              { volume_type: "outbound", quantity: "", unit: VOLUME_UNIT, note: "", sort_order: 1 }
            ]
          : loadedVolumes
      );
      setActiveReportId(result.report?.id ?? "");
      setActiveClientId(nextClientId);
    } finally {
      setIsSwitchingClient(false);
    }
  }

  const dialogClientSelector =
    !mobileMode && (!isEditMode || autoSaveExistingReport) && clients.length > 0 ? (
      <label className="flex shrink-0 items-center gap-2 rounded-xl border border-[#e7ddcd] bg-[#faf6ef] px-3 py-2 text-sm font-black text-[#012241]">
        화주
        <select
          value={activeClientId}
          onChange={(event) => void handleDialogClientChange(event.target.value)}
          disabled={isSwitchingClient}
          aria-label="작성 대상 화주 선택"
          className="h-8 min-w-36 max-w-56 rounded-md border border-slate-300 bg-white px-2 text-sm font-bold text-[#012241] disabled:opacity-60"
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.client_name}
            </option>
          ))}
        </select>
        {isSwitchingClient ? <LoaderCircle className="h-4 w-4 animate-spin text-[#007050]" aria-hidden="true" /> : null}
      </label>
    ) : null;

  return (
    <form
      id="client-report-editor-form"
      action={action}
      className={mobileMode ? "space-y-2" : "sketch-panel space-y-3 rounded-md p-3"}
    >
      <input type="hidden" name="items" value={serializedItems} />
      <input type="hidden" name="volumes" value={serializedVolumes} />
      <input type="hidden" name="id" value={activeReportId} />
      <input type="hidden" name="department_id" value={departmentId} />
      <input type="hidden" name="client_id" value={activeClientId} />
      <input type="hidden" name="report_year" value={reportMonth.year} />
      <input type="hidden" name="report_month" value={reportMonth.month} />
      <input type="hidden" name="week_of_month" value={reportWeekOfMonth} />
      <input type="hidden" name="week_start_date" value={reportWeekStartDate} />
      <input type="hidden" name="week_end_date" value={reportWeekEndDate} />
      <button ref={draftSubmitRef} type="submit" name="status" value="draft" className="hidden" aria-hidden="true" tabIndex={-1}>
        자동 저장
      </button>

      <section className="space-y-3">
        {!mobileMode ? <div className="grid gap-3 lg:grid-cols-3">
          <EditorLaunchCard
            title="금주 실시사항"
            count={currentItems.length}
            icon="current"
            buttonLabel={isConfirmedReport ? "확정완료" : "금주 실시사항 작성"}
            disabled={isConfirmedReport}
            onOpen={() => openItemDialog("current")}
          />
          <EditorLaunchCard
            title="차주 예정사항"
            count={nextItems.length}
            icon="next"
            buttonLabel={isConfirmedReport ? "확정완료" : "차주 예정사항 작성"}
            disabled={isConfirmedReport}
            onOpen={() => openItemDialog("next")}
          />
          <EditorLaunchCard
            title="금주 물동량"
            count={volumes.length}
            icon="volumes"
            buttonLabel={isConfirmedReport ? "확정완료" : "물동량 작성"}
            disabled={isConfirmedReport}
            onOpen={openVolumeDialog}
          />
        </div>
        : null}
        {mobileMode ? (
          <MobileReportPreview
            clientName={selectedClient?.client_name ?? "화주 미선택"}
            currentItems={currentItems}
            nextItems={nextItems}
            volumes={volumes}
            categories={categories}
            disabled={isConfirmedReport}
            onOpenCurrent={() => openItemDialog("current")}
            onOpenNext={() => openItemDialog("next")}
            onOpenVolumes={openVolumeDialog}
          />
        ) : null}
      </section>

      <ActionMessage state={selectionMessage ?? state} />

      {(activeDialog === "current" || activeDialog === "next") && (
        <ItemDialog
          period={activeDialog}
          items={items}
          categories={categories}
          clientSelector={dialogClientSelector}
          onSetNoIssue={(checked) => setNoSpecialIssue(activeDialog, checked)}
          onAdd={() => addItem(activeDialog)}
          onClose={closeDialogAndRemoveEditParam}
          onComplete={completeDialog}
          completeLabel={isEditMode && !autoSaveExistingReport ? "작성 내용 적용" : "작성 완료 및 저장"}
          onRemove={(actualIndex) => setItems((current) => current.filter((_, index) => index !== actualIndex))}
          onUpdate={updateItem}
        />
      )}

      {activeDialog === "volumes" && (
        <VolumeDialog
          volumes={volumes}
          clientSelector={dialogClientSelector}
          onAdd={addVolume}
          onClose={closeDialogAndRemoveEditParam}
          onComplete={completeDialog}
          completeLabel={isEditMode && !autoSaveExistingReport ? "작성 내용 적용" : "작성 완료 및 저장"}
          onMove={(index, direction) =>
            setVolumes((current) => {
              const targetIndex = index + direction;
              return targetIndex < 0 || targetIndex >= current.length ? current : moveItem(current, index, targetIndex);
            })
          }
          onRemove={(index) => setVolumes((current) => current.filter((_, rowIndex) => rowIndex !== index))}
          onUpdate={updateVolume}
        />
      )}
    </form>
  );
}

function MobileReportPreview({
  clientName,
  currentItems,
  nextItems,
  volumes,
  categories,
  disabled,
  onOpenCurrent,
  onOpenNext,
  onOpenVolumes
}: {
  clientName: string;
  currentItems: ItemDraft[];
  nextItems: ItemDraft[];
  volumes: VolumeDraft[];
  categories: Category[];
  disabled: boolean;
  onOpenCurrent: () => void;
  onOpenNext: () => void;
  onOpenVolumes: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-[#ddd2bf] bg-white shadow-[0_8px_20px_rgba(16,34,61,0.04)]">
      <div className="flex min-h-12 items-center border-b border-[#ddd2bf] bg-white px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-slate-500">화주</p>
          <h2 className="truncate text-base font-black text-[#012241]">{clientName}</h2>
        </div>
      </div>
      <MobileItemPreviewSection title="금주 실시사항" items={currentItems} categories={categories} disabled={disabled} onEdit={onOpenCurrent} />
      <MobileItemPreviewSection title="차주 예정사항" items={nextItems} categories={categories} disabled={disabled} onEdit={onOpenNext} withTopBorder />
      <section className="border-t border-[#ddd2bf] bg-white">
        <div className="flex min-h-11 items-center gap-2 border-b border-[#ece3d4] bg-[#faf6ef] px-3 py-2"><Boxes className="h-4 w-4 text-[#007050]" aria-hidden="true" /><h2 className="text-sm font-black text-[#012241]">물동량</h2><span className="text-[10px] font-black text-slate-500">{volumes.length}건</span><button type="button" onClick={onOpenVolumes} disabled={disabled} className="icon-tool-button ml-auto h-8 w-8 text-[#007050] disabled:opacity-45" aria-label="물동량 작성" title={disabled ? "확정된 자료입니다." : "물동량 작성"}><Pencil className="h-4 w-4" aria-hidden="true" /></button></div>
        {volumes.length ? <div className="divide-y divide-slate-100">{volumes.map((volume, index) => (
          <div key={`${volume.volume_type}-${index}`} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0"><p className="text-xs font-black text-[#012241]">{volumeTypeOptions.find((option) => option.value === volume.volume_type)?.label ?? "기타"}</p>{volume.note ? <p className="mt-0.5 break-words text-[11px] leading-4 text-slate-500">{volume.note}</p> : null}</div>
            <p className="shrink-0 text-xs font-black text-[#007050]">{Number(volume.quantity || 0).toLocaleString("ko-KR")} {volume.custom_unit || volume.unit}</p>
          </div>
        ))}</div> : <p className="px-3 py-5 text-center text-[11px] font-bold text-slate-400">등록된 물동량이 없습니다.</p>}
      </section>
    </section>
  );
}

function MobileItemPreviewSection({ title, items, categories, disabled, onEdit, withTopBorder = false }: { title: string; items: ItemDraft[]; categories: Category[]; disabled: boolean; onEdit: () => void; withTopBorder?: boolean }) {
  return (
    <section className={cn("bg-white", withTopBorder && "border-t border-[#ddd2bf]")}>
      <div className="flex min-h-11 items-center gap-2 border-b border-[#ece3d4] bg-[#faf6ef] px-3 py-2"><ClipboardList className="h-4 w-4 text-[#007050]" aria-hidden="true" /><h2 className="text-sm font-black text-[#012241]">{title}</h2><span className="text-[10px] font-black text-slate-500">{items.length}건</span><button type="button" onClick={onEdit} disabled={disabled} className="icon-tool-button ml-auto h-8 w-8 text-[#007050] disabled:opacity-45" aria-label={`${title} 작성`} title={disabled ? "확정된 자료입니다." : `${title} 작성`}><Pencil className="h-4 w-4" aria-hidden="true" /></button></div>
      {items.length ? <div className="divide-y divide-slate-100">{items.map((item, index) => (
        <article key={`${item.title}-${index}`} className="flex gap-2 px-3 py-2.5">
          <span className="mt-1 inline-flex shrink-0 items-center gap-1.5" title={`중요도 ${importanceOptions.find((option) => option.value === item.importance)?.label ?? "낮음"}`}>
            <span className={cn("u-dot", importanceDotClassName(item.importance))} aria-hidden="true" />
            <span className="text-[10px] font-bold text-slate-500">{categories.find((category) => category.id === item.work_category_id)?.category_name ?? "기타"}</span>
          </span>
          <div className="min-w-0"><h3 className="break-words text-xs font-black text-[#012241]">{item.title || "제목 없음"}</h3><p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600">{item.content || "내용 없음"}</p></div>
        </article>
      ))}</div> : <p className="px-3 py-5 text-center text-[11px] font-bold text-slate-400">등록된 내용이 없습니다.</p>}
    </section>
  );
}

function EditorLaunchCard({
  title,
  count,
  icon,
  buttonLabel,
  disabled,
  mobileMode,
  onOpen
}: {
  title: string;
  count: number;
  icon: "current" | "next" | "volumes";
  buttonLabel: string;
  disabled?: boolean;
  mobileMode?: boolean;
  onOpen: () => void;
}) {
  const Icon = icon === "volumes" ? Boxes : ClipboardList;

  if (mobileMode) {
    return (
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        title={disabled ? "확정된 자료는 확정취소 후 수정할 수 있습니다." : undefined}
        className="flex h-[92px] min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-center text-[#012241] transition-colors hover:bg-[#faf6ef] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon className="h-4 w-4 text-[#007050]" aria-hidden="true" />
        <span className="max-w-full break-keep text-[11px] font-black leading-4">{title}</span>
        <span className="text-[10px] font-black text-slate-500">{count}건</span>
        <span className="mt-0.5 inline-flex h-6 items-center justify-center gap-1 rounded-md border border-[#d8cbb4] bg-[#faf6ef] px-2 text-[10px] font-black text-[#007050]">
          {disabled ? <Save className="h-3 w-3" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
          {disabled ? "확정완료" : "작성"}
        </span>
      </button>
    );
  }

  return (
    <article className="metric-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#e6f1ec] text-[#007050] shadow-[0_10px_22px_rgba(0, 112, 80,0.10)]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="truncate font-black text-slate-900">{title}</h2>
        </div>
        <span className="section-chip">{count}건</span>
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        title={disabled ? "확정된 자료는 확정취소 후 수정할 수 있습니다." : undefined}
        className="tool-button mt-3 min-h-9 w-full py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {disabled ? <Save className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
        {buttonLabel}
      </button>
    </article>
  );
}

function ItemDialog({
  period,
  items,
  categories,
  clientSelector,
  onSetNoIssue,
  onAdd,
  onClose,
  onComplete,
  completeLabel,
  onRemove,
  onUpdate
}: {
  period: ItemPeriod;
  items: ItemDraft[];
  categories: Category[];
  clientSelector?: React.ReactNode;
  onSetNoIssue: (checked: boolean) => void;
  onAdd: () => void;
  onClose: () => void;
  onComplete: () => void;
  completeLabel: string;
  onRemove: (actualIndex: number) => void;
  onUpdate: (actualIndex: number, patch: Partial<ItemDraft>) => void;
}) {
  const dialogItems = items
    .map((item, index) => ({ item, actualIndex: index }))
    .filter(({ item }) => item.item_period === period);
  const isNoIssueChecked =
    dialogItems.length === 1 &&
    dialogItems[0].item.title === NO_SPECIAL_ISSUE_TEXT &&
    dialogItems[0].item.content === NO_SPECIAL_ISSUE_TEXT;
  const title = period === "current" ? "금주 실시사항 작성" : "차주 예정사항 작성";

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#012241]/60 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="item-dialog-title">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(1,34,65,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#eee6d8] px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="icon-badge icon-badge-green">
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="item-dialog-title" className="text-lg font-black text-[#012241]">
                {title}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">중요도, 업무구분, 내용을 입력하면 아래 미리보기에 바로 표시됩니다.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {clientSelector}
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#e7ddcd] bg-[#faf6ef] px-3 py-2 text-sm font-black text-[#012241]">
              <input
                type="checkbox"
                checked={isNoIssueChecked}
                onChange={(event) => onSetNoIssue(event.target.checked)}
                className="h-4 w-4 accent-[#007050]"
              />
              특이사항 없음
            </label>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="max-h-[62vh] space-y-3 overflow-y-auto bg-white px-6 py-5">
          {dialogItems.map(({ item, actualIndex }) => (
            <div key={`${period}-${actualIndex}`} className="grid gap-3 rounded-[1.25rem] border border-[#e7ddcd] bg-[#faf6ef] p-4 md:grid-cols-[84px_105px_minmax(280px,0.95fr)_minmax(420px,1.45fr)_auto]">
              <label className="text-xs font-black text-slate-600">
                중요도
                <select
                  value={item.importance}
                  onChange={(event) => onUpdate(actualIndex, { importance: event.target.value as Importance })}
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
                  onChange={(event) => onUpdate(actualIndex, { work_category_id: event.target.value })}
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
                  required
                  value={item.title}
                  maxLength={120}
                  rows={3}
                  onChange={(event) => onUpdate(actualIndex, { title: event.target.value })}
                  className="mt-1 min-h-[86px] w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="제목"
                />
              </label>
              <label className="text-xs font-black text-slate-600">
                내용
                <textarea
                  value={item.content}
                  rows={3}
                  onChange={(event) => onUpdate(actualIndex, { content: event.target.value })}
                  className="mt-1 min-h-[86px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="작성할 내용을 입력하세요. (비워도 저장됩니다)"
                />
              </label>
              <div className="flex items-end gap-1">
                <button className="icon-tool-button text-rose-600" type="button" aria-label="삭제" onClick={() => onRemove(actualIndex)}>
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-[#eee6d8] px-6 py-4">
          <button type="button" onClick={onAdd} className="tool-button">
            <Plus className="h-4 w-4" aria-hidden="true" />
            항목 추가
          </button>
          <button type="button" onClick={onComplete} className="tool-button tool-button-primary">
            <Save className="h-4 w-4" aria-hidden="true" />
            {completeLabel}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function VolumeDialog({
  volumes,
  clientSelector,
  onAdd,
  onClose,
  onComplete,
  completeLabel,
  onMove,
  onRemove,
  onUpdate
}: {
  volumes: VolumeDraft[];
  clientSelector?: React.ReactNode;
  onAdd: () => void;
  onClose: () => void;
  onComplete: () => void;
  completeLabel: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<VolumeDraft>) => void;
}) {
  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#012241]/60 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="volume-dialog-title">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(1,34,65,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#eee6d8] px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="icon-badge icon-badge-green">
              <Boxes className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="volume-dialog-title" className="text-lg font-black text-[#012241]">
                금주 물동량 작성
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">입고, 출고, 재고 등 여러 물동량을 등록할 수 있습니다.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {clientSelector}
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="max-h-[62vh] space-y-3 overflow-y-auto bg-white px-6 py-5">
          {volumes.map((volume, index) => (
            <div key={index} className="grid gap-2 rounded-[1.25rem] border border-[#e7ddcd] bg-[#faf6ef] p-4 md:grid-cols-[130px_130px_130px_1fr_auto]">
              <label className="text-xs font-black text-slate-600">
                구분
                <select
                  value={volume.volume_type}
                  onChange={(event) => onUpdate(index, { volume_type: event.target.value as VolumeType })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 text-sm font-normal"
                >
                  {volumeTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black text-slate-600">
                수량
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={volume.quantity}
                  placeholder="수량 입력"
                  onChange={(event) =>
                    onUpdate(index, { quantity: event.target.value === "" ? "" : Number(event.target.value) })
                  }
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 text-sm font-normal"
                />
              </label>
              <div className="text-xs font-black text-slate-600">
                단위
                <p className="mt-1 flex h-10 w-full items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-sm font-normal text-slate-600">
                  {VOLUME_UNIT}
                </p>
              </div>
              <label className="text-xs font-black text-slate-600">
                비고
                <input
                  value={volume.note ?? ""}
                  onChange={(event) => onUpdate(index, { note: event.target.value })}
                  placeholder="비고"
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 text-sm font-normal"
                />
              </label>
              <div className="flex items-end gap-1">
                <button className="icon-tool-button" type="button" aria-label="위로 이동" onClick={() => onMove(index, -1)} disabled={index === 0}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button className="icon-tool-button" type="button" aria-label="아래로 이동" onClick={() => onMove(index, 1)} disabled={index === volumes.length - 1}>
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button className="icon-tool-button text-rose-600" type="button" aria-label="물동량 삭제" onClick={() => onRemove(index)}>
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-[#eee6d8] px-6 py-4">
          <button type="button" onClick={onAdd} className="tool-button">
            <Plus className="h-4 w-4" aria-hidden="true" />
            물동량 추가
          </button>
          <button type="button" onClick={onComplete} className="tool-button tool-button-primary">
            <Save className="h-4 w-4" aria-hidden="true" />
            {completeLabel}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
