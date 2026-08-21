"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, PencilRuler, Save, X } from "lucide-react";
import { adminEditClientReportItemAction, type AdminEditedClientReportItem } from "@/actions/reports";
import { ActionMessage } from "@/components/common/ActionMessage";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableShell } from "@/components/common/TableShell";
import { AdminEditCompareDialog, AdminEditedMark, type AdminEditCompareTarget } from "@/components/reports/AdminEditCompareDialog";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/labels";
import type { ClientReportStatus, Importance } from "@/types/enums";

export type ClientReviewTableItem = {
  id: string;
  item_period: "current" | "next";
  importance: Importance;
  title: string;
  content: string;
  sort_order: number;
  original_title: string | null;
  original_content: string | null;
  admin_edited_at: string | null;
  work_categories: { category_name: string } | null;
};

export type ClientReviewTableReport = {
  id: string;
  report_year: number;
  report_month: number;
  week_of_month: number;
  status: ClientReportStatus;
  updated_at: string;
  clients: { client_name: string } | null;
  profiles: { full_name: string } | null;
  weekly_client_report_items: ClientReviewTableItem[];
};

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

type EditDialogState = {
  item: ClientReviewTableItem;
  clientName: string;
};

export function ClientReviewTable({
  reports,
  canAdminEdit,
  hasSearchFilters
}: {
  reports: ClientReviewTableReport[];
  canAdminEdit: boolean;
  hasSearchFilters: boolean;
}) {
  const [adminEditMode, setAdminEditMode] = useState(false);
  // 관리자 수정 결과를 새로고침 없이 반영하기 위한 항목 단위 덮어쓰기 맵.
  const [itemOverrides, setItemOverrides] = useState<Map<string, AdminEditedClientReportItem>>(() => new Map());
  const [editDialog, setEditDialog] = useState<EditDialogState | null>(null);
  const [compareTarget, setCompareTarget] = useState<AdminEditCompareTarget | null>(null);
  const [actionMessage, setActionMessage] = useState<{ ok: boolean; message: string } | null>(null);

  function mergeItem(item: ClientReviewTableItem): ClientReviewTableItem {
    const override = itemOverrides.get(item.id);
    return override
      ? {
          ...item,
          title: override.title,
          content: override.content,
          original_title: override.original_title,
          original_content: override.original_content,
          admin_edited_at: override.admin_edited_at
        }
      : item;
  }

  function handleTitleClick(item: ClientReviewTableItem, clientName: string) {
    if (adminEditMode && canAdminEdit) {
      setEditDialog({ item, clientName });
      return;
    }
    if (item.admin_edited_at) {
      setCompareTarget({
        title: item.title,
        content: item.content,
        originalTitle: item.original_title,
        originalContent: item.original_content,
        adminEditedAt: item.admin_edited_at
      });
    }
  }

  function renderItems(report: ClientReviewTableReport, period: "current" | "next") {
    const values = report.weekly_client_report_items
      .filter((row) => row.item_period === period)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map(mergeItem);
    if (values.length === 0) {
      return <span className="text-slate-400">-</span>;
    }

    return (
      <ol className="space-y-2">
        {values.map((row, index) => {
          const isTitleClickable = (adminEditMode && canAdminEdit) || Boolean(row.admin_edited_at);
          return (
            <li key={`${period}-${row.id}-${index}`} className="flex gap-2">
              <span
                className={cn(
                  "mt-0.5 inline-flex h-7 min-w-11 shrink-0 items-center justify-center rounded-xl border px-2 text-xs font-black",
                  importanceIconClassName(row.importance)
                )}
                title={row.work_categories?.category_name ?? "기타"}
              >
                {row.work_categories?.category_name ?? "기타"}
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-black leading-5 text-[#012241]">
                  {isTitleClickable ? (
                    <button
                      type="button"
                      onClick={() => handleTitleClick(row, report.clients?.client_name ?? "-")}
                      className={cn(
                        "break-words text-left underline-offset-4 hover:underline",
                        adminEditMode && canAdminEdit ? "text-[#007050]" : "text-[#012241]"
                      )}
                      title={adminEditMode && canAdminEdit ? "관리자 수정" : "관리자 수정 내역 보기"}
                    >
                      {row.title}
                    </button>
                  ) : (
                    row.title
                  )}
                  {row.admin_edited_at ? <AdminEditedMark /> : null}
                </span>
                <span className="mt-0.5 block whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">
                  {row.content}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <>
      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-doodle-title">화주별 자료 검토</h2>
        {canAdminEdit && reports.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setActionMessage(null);
              setAdminEditMode((current) => !current);
            }}
            className={cn("tool-button", adminEditMode && "tool-button-primary")}
          >
            <PencilRuler className="h-4 w-4" aria-hidden="true" />
            {adminEditMode ? "관리자수정 종료" : "관리자수정"}
          </button>
        ) : null}
      </div>
      {adminEditMode && canAdminEdit ? (
        <p className="mb-2 text-xs font-bold text-[#007050]">관리자수정 모드: 항목 제목을 클릭하면 내용을 수정할 수 있습니다.</p>
      ) : null}
      <ActionMessage state={actionMessage} />
      {reports.length === 0 ? (
        <EmptyState title={hasSearchFilters ? "검색 조건에 맞는 화주자료가 없습니다." : "검토할 화주별 자료가 없습니다."} />
      ) : (
        <TableShell>
          <table className="table-sticky min-w-[1080px] w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-3">화주명</th>
                <th className="px-3 py-3">담당자</th>
                <th className="px-3 py-3">금주 실시사항</th>
                <th className="px-3 py-3">차주 예정사항</th>
                <th className="px-3 py-3">작성상태</th>
                <th className="px-3 py-3">최종수정일</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3">
                    <span className="block font-medium">{report.clients?.client_name ?? "-"}</span>
                    <span className="mt-1 block text-[11px] font-bold text-slate-400">
                      {report.report_year}.{String(report.report_month).padStart(2, "0")} {report.week_of_month}주차
                    </span>
                  </td>
                  <td className="px-3 py-3">{report.profiles?.full_name ?? "-"}</td>
                  <td className="w-[34%] px-3 py-3">{renderItems(report, "current")}</td>
                  <td className="w-[34%] px-3 py-3">{renderItems(report, "next")}</td>
                  <td className="px-3 py-3"><StatusBadge type="client" value={report.status} /></td>
                  <td className="px-3 py-3">{formatDateTime(report.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {editDialog ? (
        <AdminItemEditDialog
          item={mergeItem(editDialog.item)}
          clientName={editDialog.clientName}
          onClose={() => setEditDialog(null)}
          onSaved={(item) => {
            setItemOverrides((current) => new Map(current).set(item.id, item));
            setEditDialog(null);
            setActionMessage({ ok: true, message: "관리자 수정을 저장했습니다." });
          }}
        />
      ) : null}
      {compareTarget ? <AdminEditCompareDialog target={compareTarget} onClose={() => setCompareTarget(null)} /> : null}
    </>
  );
}

function AdminItemEditDialog({
  item,
  clientName,
  onClose,
  onSaved
}: {
  item: ClientReviewTableItem;
  clientName: string;
  onClose: () => void;
  onSaved: (item: AdminEditedClientReportItem) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (isSaving) {
      return;
    }
    if (!title.trim()) {
      setMessage("제목을 입력하세요.");
      return;
    }
    setIsSaving(true);
    setMessage(null);
    const result = await adminEditClientReportItemAction({ item_id: item.id, title, content });
    setIsSaving(false);
    if (!result.ok || !result.item) {
      setMessage(result.message);
      return;
    }
    onSaved(result.item);
  }

  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[#012241]/60 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-item-edit-title"
    >
      <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(1,34,65,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#eee6d8] px-6 py-5">
          <div className="min-w-0">
            <h2 id="admin-item-edit-title" className="text-lg font-black text-[#012241]">관리자 수정</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{clientName} · 저장 시 원본 내용이 함께 보존됩니다.</p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto bg-white px-6 py-5">
          {item.admin_edited_at ? (
            <section className="rounded-[1.25rem] border border-[#e7ddcd] bg-[#faf6ef] p-3">
              <p className="text-xs font-black text-slate-500">최초 원본 내용</p>
              <p className="mt-1.5 break-words text-sm font-black text-[#012241]">{item.original_title ?? "-"}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">
                {item.original_content || "내용 없음"}
              </p>
            </section>
          ) : null}
          <label className="block text-xs font-black text-slate-600">
            제목
            <input
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal outline-none focus:border-[#007050]"
            />
          </label>
          <label className="block text-xs font-black text-slate-600">
            내용
            <textarea
              value={content}
              rows={6}
              onChange={(event) => setContent(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-[#007050]"
            />
          </label>
          {message ? <p className="text-sm font-bold text-rose-600">{message}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#eee6d8] px-6 py-4">
          <button type="button" onClick={onClose} className="tool-button">
            <X className="h-4 w-4" aria-hidden="true" />
            취소
          </button>
          <button type="button" onClick={save} disabled={isSaving} className="tool-button tool-button-primary disabled:opacity-60">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
