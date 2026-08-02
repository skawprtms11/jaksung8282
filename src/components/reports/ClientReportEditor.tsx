"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ClipboardList,
  Plus,
  Save,
  Trash2,
  X
} from "lucide-react";
import { saveClientReportAction, type SavedClientReportRow } from "@/actions/reports";
import { ActionMessage } from "@/components/common/ActionMessage";
import { getCurrentWeekOption, getReportMonthByThursday, getWeekEndDate, getWeekOfMonth } from "@/lib/dates/week";
import type { ClientReportStatus, Importance, ItemPeriod, VolumeType, VolumeUnit } from "@/types/enums";

type Department = { id: string; department_name: string };
type Client = { id: string; client_name: string; department_id: string };
type Category = { id: string; category_name: string; icon_key: string };
type ItemDraft = {
  item_period: ItemPeriod;
  importance: Importance;
  work_category_id: string;
  title: string;
  content: string;
  sort_order: number;
};
type VolumeDraft = {
  volume_type: VolumeType;
  quantity: number;
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

const volumeTypeOptions: { value: VolumeType; label: string }[] = [
  { value: "inbound", label: "입고" },
  { value: "outbound", label: "출고" },
  { value: "inventory", label: "재고" },
  { value: "order", label: "주문" },
  { value: "return", label: "반품" },
  { value: "etc", label: "기타" }
];

const unitOptions: { value: VolumeUnit; label: string }[] = [
  { value: "EA", label: "EA" },
  { value: "BOX", label: "BOX" },
  { value: "CASE", label: "CASE" },
  { value: "PLT", label: "PLT" },
  { value: "case_count", label: "건" },
  { value: "TON", label: "TON" },
  { value: "CBM", label: "CBM" },
  { value: "etc", label: "기타" }
];

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

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
  onSaved?: (report?: SavedClientReportRow) => void;
  onEditDialogClosed?: () => void;
}) {
  const draftSubmitRef = useRef<HTMLButtonElement>(null);
  const [state, action] = useActionState(saveClientReportAction, null);
  const isEditMode = Boolean(initialReport);
  const selectedClient =
    clients.find((client) => client.id === initialReport?.client_id) ??
    (defaultClientId ? clients.find((client) => client.id === defaultClientId) : null);
  const departmentId = initialReport?.department_id ?? selectedClient?.department_id ?? defaultDepartmentId ?? departments[0]?.id ?? "";
  const clientId = initialReport?.client_id ?? selectedClient?.id ?? "";
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

    return items.map((item) => ({
      ...item,
      sort_order: sortOrderByPeriod[item.item_period]++
    }));
  }, [items]);
  const normalizedVolumes = useMemo(
    () => volumes.map((volume, index) => ({ ...volume, sort_order: index })),
    [volumes]
  );
  const serializedItems = useMemo(() => JSON.stringify(normalizedItems), [normalizedItems]);
  const serializedVolumes = useMemo(() => JSON.stringify(normalizedVolumes), [normalizedVolumes]);

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
      { volume_type: "inbound", quantity: 0, unit: "BOX", note: "", sort_order: current.length }
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
      addVolume();
    }
    setActiveDialog("volumes");
  }

  function updateItem(actualIndex: number, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((row, index) => (index === actualIndex ? { ...row, ...patch } : row)));
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

  return (
    <form
      id="client-report-editor-form"
      action={action}
      className="sketch-panel space-y-3 rounded-md p-3"
    >
      <input type="hidden" name="items" value={serializedItems} />
      <input type="hidden" name="volumes" value={serializedVolumes} />
      <input type="hidden" name="id" value={initialReport?.id ?? ""} />
      <input type="hidden" name="department_id" value={departmentId} />
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="report_year" value={reportMonth.year} />
      <input type="hidden" name="report_month" value={reportMonth.month} />
      <input type="hidden" name="week_of_month" value={reportWeekOfMonth} />
      <input type="hidden" name="week_start_date" value={reportWeekStartDate} />
      <input type="hidden" name="week_end_date" value={reportWeekEndDate} />
      <button ref={draftSubmitRef} type="submit" name="status" value="draft" className="hidden" aria-hidden="true" tabIndex={-1}>
        자동 저장
      </button>

      <section className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-3">
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
      </section>

      <ActionMessage state={selectionMessage ?? state} />

      {(activeDialog === "current" || activeDialog === "next") && (
        <ItemDialog
          period={activeDialog}
          items={items}
          categories={categories}
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

function EditorLaunchCard({
  title,
  count,
  icon,
  buttonLabel,
  disabled,
  onOpen
}: {
  title: string;
  count: number;
  icon: "current" | "next" | "volumes";
  buttonLabel: string;
  disabled?: boolean;
  onOpen: () => void;
}) {
  const Icon = icon === "volumes" ? Boxes : ClipboardList;

  return (
    <article className="metric-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#e8f1ff] text-[#075be8] shadow-[0_10px_22px_rgba(7,91,232,0.10)]">
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
  const title = period === "current" ? "금주 실시사항 작성" : "차주 예정사항 작성";

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="item-dialog-title">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/94 shadow-[0_28px_80px_rgba(16,34,61,0.22)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="item-dialog-title" className="text-lg font-black text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">중요도, 업무구분, 내용을 입력하면 아래 미리보기에 바로 표시됩니다.</p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[62vh] space-y-3 overflow-y-auto bg-[#f5f9ff] px-5 py-4">
          {dialogItems.map(({ item, actualIndex }) => (
            <div key={`${period}-${actualIndex}`} className="glass-row grid gap-3 p-3 md:grid-cols-[84px_105px_minmax(280px,0.95fr)_minmax(420px,1.45fr)_auto]">
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
                  required
                  value={item.content}
                  rows={3}
                  onChange={(event) => onUpdate(actualIndex, { content: event.target.value })}
                  className="mt-1 min-h-[86px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                  placeholder="작성할 내용을 입력하세요."
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
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-5 py-4">
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
  onAdd,
  onClose,
  onComplete,
  completeLabel,
  onMove,
  onRemove,
  onUpdate
}: {
  volumes: VolumeDraft[];
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="volume-dialog-title">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/94 shadow-[0_28px_80px_rgba(16,34,61,0.22)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="volume-dialog-title" className="text-lg font-black text-slate-900">
              금주 물동량 작성
            </h2>
            <p className="mt-1 text-sm text-slate-500">입고, 출고, 재고 등 여러 물동량을 등록할 수 있습니다.</p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[62vh] space-y-3 overflow-y-auto bg-[#f5f9ff] px-5 py-4">
          {volumes.map((volume, index) => (
            <div key={index} className="glass-row grid gap-2 p-3 md:grid-cols-[130px_130px_130px_1fr_auto]">
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
                  onChange={(event) => onUpdate(index, { quantity: Number(event.target.value) })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-black text-slate-600">
                단위
                <select
                  value={volume.unit}
                  onChange={(event) => onUpdate(index, { unit: event.target.value as VolumeUnit })}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 text-sm font-normal"
                >
                  {unitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
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
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-5 py-4">
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
