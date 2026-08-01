"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Eye, Loader2, PackageCheck, Pencil, RotateCcw, Save, X } from "lucide-react";
import {
  cancelSubmittedClientReportsAction,
  loadClientHistoricalVolumesAction,
  submitSelectedClientReportsAction
} from "@/actions/reports";
import { ActionMessage } from "@/components/common/ActionMessage";
import { TableShell } from "@/components/common/TableShell";
import { VolumeAnalysisPanel, type VolumeAnalysisHistoricalVolume } from "@/components/reports/VolumeAnalysisPanel";
import { cn } from "@/lib/utils/cn";
import type { ClientReportEditorInitialReport } from "@/components/reports/ClientReportEditor";
import type { ClientReportStatus, Importance, ItemPeriod, VolumeType, VolumeUnit } from "@/types/enums";

type ClientReportVolume = {
  volumeType: VolumeType;
  quantity: number;
  unit: VolumeUnit;
  customUnit?: string | null;
  note?: string | null;
};
type ClientReportItem = {
  importance: Importance;
  title: string;
  content: string;
  categoryName: string;
};

export type ClientReportTableRow = {
  id: string;
  clientId: string;
  clientName: string;
  authorName: string;
  submittedAt: string | null;
  currentItems: ClientReportItem[];
  nextItems: ClientReportItem[];
  volumes: ClientReportVolume[];
  status: ClientReportStatus;
  editReport: ClientReportEditorInitialReport;
};

function isEditableStatus(status: ClientReportStatus) {
  return status === "draft" || status === "rejected";
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

function reportStatusLabel(status: ClientReportStatus) {
  if (status === "draft") {
    return "저장";
  }
  if (status === "rejected") {
    return "저장(반려)";
  }
  if (status === "submitted") {
    return "확정";
  }
  return "승인";
}

function reportStatusClassName(status: ClientReportStatus) {
  if (status === "draft") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  if (status === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "submitted") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
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

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

export function ClientReportsTable({
  reports,
  activeEditingReportId,
  onCancelEdit,
  onOpenEditDialog,
  onReportStatusChange
}: {
  reports: ClientReportTableRow[];
  activeEditingReportId?: string | null;
  onCancelEdit: () => void;
  onOpenEditDialog: (report: ClientReportEditorInitialReport, period: ItemPeriod) => void;
  onReportStatusChange?: (reportIds: string[], status: ClientReportStatus, submittedAt: string | null) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Map<string, ClientReportStatus>>(() => new Map());
  const [submittedAtOverrides, setSubmittedAtOverrides] = useState<Map<string, string | null>>(() => new Map());
  const [volumeDialogState, setVolumeDialogState] = useState<{
    report: ClientReportTableRow;
    historicalVolumes: VolumeAnalysisHistoricalVolume[];
    loading: boolean;
    message?: string;
  } | null>(null);
  const [localMessage, setLocalMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<"submit" | "cancel-submit" | null>(null);
  const displayedReports = useMemo(
    () =>
      reports
        .map((report) => ({
          ...report,
          status: statusOverrides.get(report.id) ?? report.status,
          submittedAt: submittedAtOverrides.has(report.id) ? submittedAtOverrides.get(report.id) ?? null : report.submittedAt
        })),
    [reports, statusOverrides, submittedAtOverrides]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedReports = useMemo(
    () => displayedReports.filter((report) => selectedIdSet.has(report.id)),
    [displayedReports, selectedIdSet]
  );
  const allSelected = displayedReports.length > 0 && selectedIds.length === displayedReports.length;
  const hasExpiredCancelSelection = selectedReports.some((report) => isPastConfirmationCancelWindow(report.submittedAt));
  const canCancelSubmit =
    selectedReports.length > 0 &&
    selectedReports.every((report) => report.status === "submitted") &&
    !hasExpiredCancelSelection;
  const canSubmitSelected =
    selectedReports.length > 0 && selectedReports.every((report) => isEditableStatus(report.status));
  const actionMessage = localMessage;

  function clearMessages() {
    setLocalMessage(null);
  }

  function toggleReport(reportId: string) {
    clearMessages();
    setSelectedIds((current) =>
      current.includes(reportId) ? current.filter((id) => id !== reportId) : [...current, reportId]
    );
  }

  function toggleAll() {
    clearMessages();
    setSelectedIds(allSelected ? [] : displayedReports.map((report) => report.id));
  }

  async function runBatchAction(
    form: HTMLFormElement,
    actionType: "submit" | "cancel-submit",
    action: (state: null, formData: FormData) => Promise<{ ok: boolean; message: string }>
  ) {
    const ids = selectedIds.slice();
    setPendingAction(actionType);
    setLocalMessage(null);
    const result = await action(null, new FormData(form));
    setPendingAction(null);
    setLocalMessage({ ok: result.ok, message: result.message });
    if (!result.ok) {
      return;
    }
    const nextStatus: ClientReportStatus = actionType === "submit" ? "submitted" : "draft";
    const nextSubmittedAt = actionType === "submit" ? new Date().toISOString() : null;
    setStatusOverrides((current) => {
      const next = new Map(current);
      ids.forEach((id) => next.set(id, nextStatus));
      return next;
    });
    setSubmittedAtOverrides((current) => {
      const next = new Map(current);
      ids.forEach((id) => next.set(id, nextSubmittedAt));
      return next;
    });
    onReportStatusChange?.(ids, nextStatus, nextSubmittedAt);
    setSelectedIds([]);
  }

  function openEditDialog(reportId: string, period: ItemPeriod) {
    const report = displayedReports.find((row) => row.id === reportId);
    if (report && !isEditableStatus(report.status)) {
      setLocalMessage({ ok: false, message: "확정 또는 승인된 자료는 수정할 수 없습니다." });
      return;
    }
    if (report) {
      clearMessages();
      onOpenEditDialog(report.editReport, period);
    }
  }

  function cancelEditMode() {
    onCancelEdit();
  }

  async function openVolumeDialog(report: ClientReportTableRow) {
    setVolumeDialogState({ report, historicalVolumes: [], loading: true });
    const result = await loadClientHistoricalVolumesAction({ client_id: report.clientId });
    setVolumeDialogState({
      report,
      historicalVolumes: result.historicalVolumes,
      loading: false,
      message: result.ok ? undefined : result.message
    });
  }

  function renderEditableCell(report: ClientReportTableRow, period: ItemPeriod, items: ClientReportItem[]) {
    const isEditing = activeEditingReportId === report.id && isEditableStatus(report.status);
    const canShowHoverEdit = !activeEditingReportId && isEditableStatus(report.status);
    const content = <ReportItemList items={items} />;
    if (!isEditing && !canShowHoverEdit) {
      return content;
    }

    if (canShowHoverEdit) {
      return (
        <div className="group relative -m-2 min-h-16 rounded-2xl p-2 transition hover:bg-[#f5f9ff] hover:shadow-[inset_0_0_0_1px_rgba(169,205,252,0.85)]">
          {content}
          <button
            type="button"
            onClick={() => openEditDialog(report.id, period)}
            className="icon-tool-button absolute right-2 top-2 h-8 w-8 bg-white/95 text-[#075be8] opacity-0 shadow-[0_10px_22px_rgba(16,34,61,0.10)] transition group-hover:opacity-100 group-focus-within:opacity-100"
            aria-label={`${report.clientName} ${period === "current" ? "금주 실시사항" : "차주 예정사항"} 수정`}
            title="수정"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      );
    }

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => openEditDialog(report.id, period)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openEditDialog(report.id, period);
          }
        }}
        className="w-full cursor-pointer rounded-2xl border border-dashed border-[#9db8dc] bg-white/80 px-3 py-2 text-left font-bold text-[#075be8] transition hover:border-[#075be8] hover:bg-[#eef6ff]"
      >
        {content}
        <span className="mt-2 block text-xs text-slate-500">클릭해서 수정</span>
      </div>
    );
  }

  return (
    <section className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-doodle-title">화주별 자료</h2>
        <div className="flex flex-wrap items-center gap-2">
          {activeEditingReportId ? (
            <>
              <button
                type="submit"
                name="status"
                value="draft"
                form="client-report-editor-form"
                className="tool-button tool-button-primary"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                저장
              </button>
              <button type="button" onClick={cancelEditMode} className="tool-button">
                <X className="h-4 w-4" aria-hidden="true" />
                취소
              </button>
            </>
          ) : null}
          <form
            onSubmit={(event) => {
              if (selectedIds.length === 0 || !window.confirm("선택한 화주별 자료를 확정하시겠습니까?")) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              runBatchAction(event.currentTarget, "submit", submitSelectedClientReportsAction);
            }}
          >
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="report_ids" value={id} />
            ))}
            <BatchActionButton
              variant="primary"
              pending={pendingAction === "submit"}
              disabledReason={
                activeEditingReportId
                  ? "수정 내용을 저장한 뒤 목록에서 확정하세요."
                  : selectedReports.length === 0
	                    ? "확정할 자료를 선택하세요."
	                    : !canSubmitSelected
	                      ? "저장 또는 반려 상태의 자료만 확정할 수 있습니다."
	                      : undefined
	              }
	            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              확정
            </BatchActionButton>
          </form>
          <form
            onSubmit={(event) => {
              if (!canCancelSubmit || !window.confirm("선택한 화주별 자료를 확정취소하시겠습니까?")) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              runBatchAction(event.currentTarget, "cancel-submit", cancelSubmittedClientReportsAction);
            }}
          >
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="report_ids" value={id} />
            ))}
            <BatchActionButton
              variant="secondary"
              pending={pendingAction === "cancel-submit"}
              disabledReason={
                activeEditingReportId
                  ? "수정 중에는 확정취소할 수 없습니다."
                  : selectedReports.length === 0
	                    ? "확정취소할 자료를 선택하세요."
	                    : hasExpiredCancelSelection
	                      ? "확정 후 3일이 지난 자료는 확정취소할 수 없습니다."
	                    : !canCancelSubmit
	                      ? "확정 상태의 자료만 확정취소할 수 있습니다."
	                      : undefined
	              }
	            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              확정취소
            </BatchActionButton>
          </form>
        </div>
      </div>

      <ActionMessage state={actionMessage} />

      <TableShell>
        <table className="table-sticky min-w-[920px] w-full text-left text-sm">
          <thead>
            <tr>
              <th className="w-12 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="화주별 자료 전체 선택"
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
              <th className="px-3 py-3">화주</th>
              <th className="px-3 py-3">작성자</th>
              <th className="px-3 py-3">금주실시사항</th>
              <th className="px-3 py-3">차주예정사항</th>
              <th className="px-3 py-3 text-center">물동량</th>
              <th className="px-3 py-3">상태</th>
            </tr>
          </thead>
          <tbody>
	                {displayedReports.map((report) => {
              const isEditing = activeEditingReportId === report.id;

              return (
                <tr
                  key={report.id}
                  className={cn(
                    "border-t border-slate-100 align-top",
                    isEditing ? "bg-[#eef6ff]" : "bg-white/80"
                  )}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(report.id)}
                      onChange={() => toggleReport(report.id)}
                      aria-label={`${report.clientName} 자료 선택`}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-3 font-black text-[#10223d]">{report.clientName}</td>
                  <td className="px-3 py-3">{report.authorName}</td>
                  <td className="w-[34%] px-3 py-3">{renderEditableCell(report, "current", report.currentItems)}</td>
                  <td className="w-[34%] px-3 py-3">{renderEditableCell(report, "next", report.nextItems)}</td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => openVolumeDialog(report)}
                      className="icon-tool-button mx-auto"
                      aria-label={`${report.clientName} 물동량 작성내용 확인`}
                      title="물동량 확인"
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-black", reportStatusClassName(report.status))}>
                      {reportStatusLabel(report.status)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>

      {volumeDialogState ? (
        <VolumeConfirmDialog
          report={volumeDialogState.report}
          historicalVolumes={volumeDialogState.historicalVolumes}
          loading={volumeDialogState.loading}
          message={volumeDialogState.message}
          onClose={() => setVolumeDialogState(null)}
        />
      ) : null}
    </section>
  );
}

function BatchActionButton({
  children,
  variant = "primary",
  pending,
  disabledReason
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  pending: boolean;
  disabledReason?: string;
}) {
  const variants = {
    primary: "tool-button-primary",
    secondary: "",
    danger: "tool-button-danger"
  };

  return (
    <button
      type="submit"
      disabled={pending || Boolean(disabledReason)}
      title={disabledReason}
      className={cn("focus-ring tool-button disabled:cursor-not-allowed disabled:opacity-50", variants[variant])}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function ReportItemList({ items }: { items: ClientReportItem[] }) {
  if (items.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <ol className="space-y-2">
      {items.map((item, index) => {
        return (
          <li key={`${item.title}-${index}`} className="flex gap-2">
            <span
              className={cn(
                "mt-0.5 inline-flex h-7 min-w-11 shrink-0 items-center justify-center rounded-xl border px-2 text-xs font-black",
                importanceIconClassName(item.importance)
              )}
              title={item.categoryName}
            >
              {item.categoryName}
            </span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-black leading-5 text-[#10223d]">{item.title}</span>
              <span className="mt-0.5 block whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">{item.content}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function VolumeConfirmDialog({
  report,
  historicalVolumes,
  loading,
  message,
  onClose
}: {
  report: ClientReportTableRow;
  historicalVolumes: VolumeAnalysisHistoricalVolume[];
  loading: boolean;
  message?: string;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="volume-confirm-title">
        <div className="max-h-[90vh] w-full max-w-7xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/95 shadow-[0_28px_80px_rgba(16,34,61,0.24)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f1ff] text-[#075be8]">
                <PackageCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="volume-confirm-title" className="text-lg font-black text-slate-900">
                  물동량 작성내용
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{report.clientName}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[68vh] overflow-y-auto bg-[#f5f9ff] p-5">
            {message ? (
              <div className="sketch-panel p-4 text-sm font-bold text-rose-600">{message}</div>
            ) : loading ? (
              <div className="sketch-panel p-4 text-sm font-bold text-slate-500">물동량 이력을 불러오는 중입니다.</div>
            ) : (
              <VolumeAnalysisPanel
                clientId={report.clientId}
                historicalVolumes={historicalVolumes}
                volumes={report.volumes.map((volume) => ({
                  volume_type: volume.volumeType,
                  quantity: volume.quantity,
                  unit: volume.unit
                }))}
                className="sketch-panel p-4"
              />
            )}
          </div>

          <div className="flex justify-end border-t border-slate-200 px-5 py-4">
            <button type="button" onClick={onClose} className="tool-button tool-button-primary">
              확인
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
