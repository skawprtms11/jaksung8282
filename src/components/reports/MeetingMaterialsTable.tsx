"use client";

import { useMemo, useState, useTransition } from "react";
import { BadgeCheck, CheckCircle2, MessageSquarePlus, Pencil, Save, Trash2, X } from "lucide-react";
import {
  closeReportItemRequestAction,
  deleteReportItemRequestAction,
  deleteReportItemRequestResultAction,
  saveReportItemRequestAction,
  saveReportItemRequestResultAction
} from "@/actions/reports";
import { EmptyState } from "@/components/common/EmptyState";
import { TableShell } from "@/components/common/TableShell";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/labels";
import type { Importance, ItemPeriod } from "@/types/enums";

export type MeetingReportItemRequest = {
  id: string;
  target_type: "client_item" | "department_common";
  target_key: string;
  report_item_id: string | null;
  department_submission_id: string | null;
  section_type: "common" | "facility" | "vacancy" | "holiday_work" | null;
  item_period: ItemPeriod | null;
  item_sort_order: number | null;
  request_content: string;
  request_author_name: string;
  request_author_department_name: string | null;
  result_content: string | null;
  result_author_name: string | null;
  result_author_department_name: string | null;
  result_created_by: string | null;
  result_created_at: string | null;
  result_updated_at: string | null;
  closed_by: string | null;
  closed_author_name: string | null;
  closed_author_department_name: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type MeetingReportItem = {
  id: string;
  item_period: ItemPeriod;
  title: string | null;
  content: string;
  importance: Importance;
  work_categories: { category_name: string } | null;
  weekly_report_item_requests: MeetingReportItemRequest[];
  request_target_key: string;
  request_target_type: "client_item" | "department_common";
  request_department_submission_id: string | null;
  request_item_sort_order: number | null;
};

export type MeetingMaterialsReport = {
  id: string;
  department_id: string;
  client_id: string;
  departments?: { department_name: string } | null;
  clients?: { client_name: string } | null;
  weekly_client_report_items: MeetingReportItem[];
};

type SelectedItem = {
  reportId: string;
  clientName: string;
  departmentName: string;
  isCommon: boolean;
  item: MeetingReportItem;
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

function periodLabel(period: ItemPeriod) {
  return period === "current" ? "금주 실시사항" : "차주 예정사항";
}

function updateRequestInReports(
  reports: MeetingMaterialsReport[],
  request: MeetingReportItemRequest
): MeetingMaterialsReport[] {
  let hasChanged = false;
  const nextReports = reports.map((report) => {
    let hasChangedItem = false;
    const nextItems = report.weekly_client_report_items.map((item) => {
      if (item.request_target_key !== request.target_key) {
        return item;
      }
      hasChanged = true;
      hasChangedItem = true;
      const exists = item.weekly_report_item_requests.some((row) => row.id === request.id);
      return {
        ...item,
        weekly_report_item_requests: exists
          ? item.weekly_report_item_requests.map((row) => (row.id === request.id ? request : row))
          : [...item.weekly_report_item_requests, request]
      };
    });
    return hasChangedItem ? { ...report, weekly_client_report_items: nextItems } : report;
  });
  return hasChanged ? nextReports : reports;
}

function removeRequestFromReports(reports: MeetingMaterialsReport[], requestId: string): MeetingMaterialsReport[] {
  let hasChanged = false;
  const nextReports = reports.map((report) => {
    let hasChangedItem = false;
    const nextItems = report.weekly_client_report_items.map((item) => {
      const nextRequests = item.weekly_report_item_requests.filter((request) => request.id !== requestId);
      if (nextRequests.length === item.weekly_report_item_requests.length) {
        return item;
      }
      hasChanged = true;
      hasChangedItem = true;
      return { ...item, weekly_report_item_requests: nextRequests };
    });
    return hasChangedItem ? { ...report, weekly_client_report_items: nextItems } : report;
  });
  return hasChanged ? nextReports : reports;
}

export function MeetingMaterialsTable({
  reports,
  currentUserId,
  canManageAllRequests
}: {
  reports: MeetingMaterialsReport[];
  currentUserId: string;
  canManageAllRequests: boolean;
}) {
  const [reportRows, setReportRows] = useState(reports);
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  if (reportRows.length === 0) {
    return <EmptyState title="선택한 주차의 회의자료가 없습니다." />;
  }

  function openItem(report: MeetingMaterialsReport, item: MeetingReportItem) {
    setSelected({
      reportId: report.id,
      clientName: report.clients?.client_name ?? "-",
      departmentName: report.departments?.department_name ?? "-",
      isCommon: report.client_id === "common",
      item
    });
  }

  function handleRequestSaved(request: MeetingReportItemRequest) {
    setReportRows((current) => updateRequestInReports(current, request));
    setSelected((current) => {
      if (current?.item.request_target_key !== request.target_key) {
        return current;
      }
      const exists = current.item.weekly_report_item_requests.some((row) => row.id === request.id);
      return {
        ...current,
        item: {
          ...current.item,
          weekly_report_item_requests: exists
            ? current.item.weekly_report_item_requests.map((row) => (row.id === request.id ? request : row))
            : [...current.item.weekly_report_item_requests, request]
        }
      };
    });
  }

  function handleRequestDeleted(requestId: string) {
    setReportRows((current) => removeRequestFromReports(current, requestId));
    setSelected((current) =>
      current
        ? {
            ...current,
            item: {
              ...current.item,
              weekly_report_item_requests: current.item.weekly_report_item_requests.filter((request) => request.id !== requestId)
            }
          }
        : current
    );
  }

  return (
    <>
      <TableShell>
        <table className="table-sticky w-full min-w-[1100px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[190px]" />
            <col className="w-[455px]" />
            <col className="w-[455px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-3 py-3">화주</th>
              <th className="px-3 py-3">금주 실시사항</th>
              <th className="px-3 py-3">차주 예정사항</th>
            </tr>
          </thead>
          <tbody>
            {reportRows.map((report) => {
              const isCommonRow = report.client_id === "common";
              return (
                <tr
                  key={report.id}
                  className={cn("border-t align-top", isCommonRow ? "border-[#bfd9ff] bg-[#eef6ff]" : "border-slate-100")}
                >
                  <td className="px-3 py-4">
                    <div className={cn("font-black", isCommonRow ? "text-[#075be8]" : "text-[#10223d]")}>
                      {report.clients?.client_name ?? "-"}
                    </div>
                    <div className="mt-1 text-xs font-bold text-slate-400">{report.departments?.department_name ?? "-"}</div>
                  </td>
                  <td className="px-3 py-4">
                    <MeetingWorkItemList rows={report.weekly_client_report_items} period="current" isCommon={isCommonRow} onOpen={(item) => openItem(report, item)} />
                  </td>
                  <td className="px-3 py-4">
                    <MeetingWorkItemList rows={report.weekly_client_report_items} period="next" isCommon={isCommonRow} onOpen={(item) => openItem(report, item)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>

      {selected ? (
        <ItemDetailDialog
          selected={selected}
          currentUserId={currentUserId}
          canManageAllRequests={canManageAllRequests}
          onClose={() => setSelected(null)}
          onRequestSaved={handleRequestSaved}
          onRequestDeleted={handleRequestDeleted}
        />
      ) : null}
    </>
  );
}

function MeetingWorkItemList({
  rows,
  period,
  isCommon,
  onOpen
}: {
  rows: MeetingReportItem[];
  period: ItemPeriod;
  isCommon: boolean;
  onOpen: (item: MeetingReportItem) => void;
}) {
  const values = rows.filter((row) => row.item_period === period);
  if (values.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <ol className="space-y-3">
      {values.map((row, index) => {
        const hasRequest = row.weekly_report_item_requests.length > 0;
        const hasResult = row.weekly_report_item_requests.some((request) => Boolean(request.result_content));
        const hasClosed = row.weekly_report_item_requests.some((request) => Boolean(request.closed_at));
        return (
          <li key={`${period}-${row.id}-${index}`} className={cn("flex gap-2.5 rounded-2xl px-3 py-2.5", isCommon ? "bg-white/82" : "bg-[#f8fbff]")}>
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
              <button
                type="button"
                onClick={() => onOpen(row)}
                className="group flex max-w-full items-center gap-1.5 text-left"
              >
                <span className="block break-words text-[15px] font-black leading-6 text-[#10223d] underline-offset-4 group-hover:text-[#075be8] group-hover:underline">
                  {row.title?.trim() || "제목 없음"}
                </span>
                {hasRequest ? (
                  <MessageSquarePlus className="h-4 w-4 shrink-0 text-[#075be8]" aria-label="요청사항 등록됨" />
                ) : null}
                {hasResult ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="처리결과 등록됨" /> : null}
                {hasClosed ? <BadgeCheck className="h-4 w-4 shrink-0 text-violet-600" aria-label="종결됨" /> : null}
              </button>
              <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{row.content}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ItemDetailDialog({
  selected,
  currentUserId,
  canManageAllRequests,
  onClose,
  onRequestSaved,
  onRequestDeleted
}: {
  selected: SelectedItem;
  currentUserId: string;
  canManageAllRequests: boolean;
  onClose: () => void;
  onRequestSaved: (request: MeetingReportItemRequest) => void;
  onRequestDeleted: (requestId: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [isRequestFormOpen, setIsRequestFormOpen] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editingRequestText, setEditingRequestText] = useState("");
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [resultText, setResultText] = useState("");
  const requestable =
    selected.item.request_target_type === "client_item" ||
    (selected.item.request_target_type === "department_common" &&
      Boolean(selected.item.request_department_submission_id) &&
      typeof selected.item.request_item_sort_order === "number");

  const requests = useMemo(
    () => [...selected.item.weekly_report_item_requests].sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [selected.item.weekly_report_item_requests]
  );

  function saveRequest(id?: string) {
    const content = (id ? editingRequestText : requestText).trim();
    if (!content) {
      setMessage("요청사항을 입력하세요.");
      return;
    }
    const formData = new FormData();
    if (id) {
      formData.set("id", id);
    }
    formData.set("target_type", selected.item.request_target_type);
    if (selected.item.request_target_type === "client_item") {
      formData.set("report_item_id", selected.item.id);
    } else if (selected.item.request_department_submission_id && typeof selected.item.request_item_sort_order === "number") {
      formData.set("department_submission_id", selected.item.request_department_submission_id);
      formData.set("item_period", selected.item.item_period);
      formData.set("item_sort_order", String(selected.item.request_item_sort_order));
    }
    formData.set("request_content", content);
    startTransition(async () => {
      const result = await saveReportItemRequestAction(formData);
      setMessage(result.message);
      if (result.ok && result.data) {
        onRequestSaved(result.data);
        setRequestText("");
        setEditingRequestId(null);
        setEditingRequestText("");
        setIsRequestFormOpen(false);
      }
    });
  }

  function deleteRequest(id: string) {
    if (!window.confirm("요청사항을 삭제할까요?")) {
      return;
    }
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const result = await deleteReportItemRequestAction(formData);
      setMessage(result.message);
      if (result.ok) {
        onRequestDeleted(id);
      }
    });
  }

  function saveResult(requestId: string) {
    const content = resultText.trim();
    if (!content) {
      setMessage("처리결과를 입력하세요.");
      return;
    }
    const formData = new FormData();
    formData.set("id", requestId);
    formData.set("result_content", content);
    startTransition(async () => {
      const result = await saveReportItemRequestResultAction(formData);
      setMessage(result.message);
      if (result.ok && result.data) {
        onRequestSaved(result.data);
        setEditingResultId(null);
        setResultText("");
      }
    });
  }

  function deleteResult(requestId: string) {
    if (!window.confirm("처리결과를 삭제할까요?")) {
      return;
    }
    const formData = new FormData();
    formData.set("id", requestId);
    startTransition(async () => {
      const result = await deleteReportItemRequestResultAction(formData);
      setMessage(result.message);
      if (result.ok && result.data) {
        onRequestSaved(result.data);
      }
    });
  }

  function closeRequest(requestId: string) {
    if (!window.confirm("요청사항을 종결처리할까요?")) {
      return;
    }
    const formData = new FormData();
    formData.set("id", requestId);
    startTransition(async () => {
      const result = await closeReportItemRequestAction(formData);
      setMessage(result.message);
      if (result.ok && result.data) {
        onRequestSaved(result.data);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="meeting-item-detail-title">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.5rem] border border-white/80 bg-white shadow-[0_28px_80px_rgba(16,34,61,0.26)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="section-chip">{selected.clientName}</span>
              <span className="section-chip">{selected.departmentName}</span>
              <span className="section-chip">{periodLabel(selected.item.item_period)}</span>
              <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-black", importanceIconClassName(selected.item.importance))}>
                {selected.item.work_categories?.category_name ?? "기타"}
              </span>
            </div>
            <h2 id="meeting-item-detail-title" className="text-xl font-black text-[#10223d]">
              {selected.item.title?.trim() || "제목 없음"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="상세 팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto bg-[#f5f9ff] px-5 py-5">
          <section className="rounded-2xl border border-[#d9e7f7] bg-white px-4 py-4">
            <p className="mb-2 text-sm font-black text-[#10223d]">내용</p>
            <div className="min-h-32 whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.item.content || "-"}</div>
          </section>

          <section className="mt-4 rounded-2xl border border-[#d9e7f7] bg-white px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-[#10223d]">요청사항</p>
                <p className="text-xs font-bold text-slate-500">내용 확인 중 필요한 요청과 처리결과를 기록합니다.</p>
              </div>
              {requestable ? (
                <button type="button" onClick={() => setIsRequestFormOpen((current) => !current)} className="tool-button min-h-9 py-1.5">
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                  요청사항 등록
                </button>
              ) : null}
            </div>

            {!requestable ? (
              <p className="rounded-xl border border-dashed border-[#b9cce4] px-3 py-5 text-center text-xs font-bold text-slate-400">
                요청사항을 등록할 수 있는 항목 정보를 확인할 수 없습니다.
              </p>
            ) : null}

            {isRequestFormOpen && requestable ? (
              <div className="mb-3 rounded-2xl border border-[#d9e7f7] bg-[#f8fbff] p-3">
                <label className="block text-xs font-black text-slate-500" htmlFor="new-report-item-request">
                  요청사항
                </label>
                <textarea
                  id="new-report-item-request"
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  className="mt-2 min-h-24 w-full rounded-2xl border border-[#d7e4f6] bg-white px-3 py-3 text-sm font-bold text-[#10223d] outline-none focus:border-[#075be8]"
                  placeholder="요청사항을 입력하세요."
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setIsRequestFormOpen(false)} className="tool-button min-h-9 py-1.5">
                    취소
                  </button>
                  <button type="button" onClick={() => saveRequest()} disabled={isPending} className="tool-button tool-button-primary min-h-9 py-1.5">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    등록
                  </button>
                </div>
              </div>
            ) : null}

            {requests.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#b9cce4] px-3 py-5 text-center text-xs font-bold text-slate-400">
                등록된 요청사항이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => {
                  const isClosed = Boolean(request.closed_at);
                  const canEditRequest = !isClosed && (canManageAllRequests || request.created_by === currentUserId);
                  const canEditResult =
                    !isClosed &&
                    (!request.result_created_by || canManageAllRequests || request.result_created_by === currentUserId);
                  const canCloseRequest =
                    Boolean(request.result_content) &&
                    !isClosed &&
                    (canManageAllRequests || request.created_by === currentUserId || request.result_created_by === currentUserId);
                  return (
                    <article key={request.id} className="rounded-2xl border border-[#e2ecf8] bg-[#f8fbff] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-[#075be8]">
                            {request.request_author_name}
                            {request.request_author_department_name ? ` · ${request.request_author_department_name}` : ""}
                          </p>
                          <p className="mt-0.5 text-[11px] font-bold text-slate-400">{formatDateTime(request.created_at)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {isClosed ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">
                              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              종결
                            </span>
                          ) : null}
                          {canCloseRequest ? (
                            <button
                              type="button"
                              onClick={() => closeRequest(request.id)}
                              disabled={isPending}
                              className="tool-button min-h-8 py-1 text-xs text-violet-700"
                            >
                              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              종결
                            </button>
                          ) : null}
                          {canEditRequest ? (
                            <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRequestId(request.id);
                                setEditingRequestText(request.request_content);
                              }}
                              className="icon-tool-button h-8 w-8"
                              aria-label="요청사항 수정"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => deleteRequest(request.id)} className="icon-tool-button h-8 w-8 text-rose-600" aria-label="요청사항 삭제">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {editingRequestId === request.id ? (
                        <div className="mt-2">
                          <textarea
                            value={editingRequestText}
                            onChange={(event) => setEditingRequestText(event.target.value)}
                            className="min-h-20 w-full rounded-2xl border border-[#d7e4f6] bg-white px-3 py-3 text-sm font-bold text-[#10223d] outline-none focus:border-[#075be8]"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingRequestId(null)} className="tool-button min-h-8 py-1 text-xs">
                              취소
                            </button>
                            <button type="button" onClick={() => saveRequest(request.id)} disabled={isPending} className="tool-button tool-button-primary min-h-8 py-1 text-xs">
                              저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 whitespace-pre-wrap text-sm font-bold leading-6 text-[#10223d]">{request.request_content}</p>
                      )}

                      {isClosed ? (
                        <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2">
                          <p className="text-xs font-black text-violet-700">종결 정보</p>
                          <p className="mt-1 text-[11px] font-bold text-violet-500">
                            {request.closed_author_name ?? "-"}
                            {request.closed_author_department_name ? ` · ${request.closed_author_department_name}` : ""}
                            {request.closed_at ? ` · ${formatDateTime(request.closed_at)}` : ""}
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-3 rounded-2xl border border-[#d9e7f7] bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-xs font-black text-emerald-700">처리결과</p>
                          {request.result_content && canEditResult ? (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingResultId(request.id);
                                  setResultText(request.result_content ?? "");
                                }}
                                className="icon-tool-button h-8 w-8"
                                aria-label="처리결과 수정"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button type="button" onClick={() => deleteResult(request.id)} className="icon-tool-button h-8 w-8 text-rose-600" aria-label="처리결과 삭제">
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {request.result_content && editingResultId !== request.id ? (
                          <div>
                            <p className="whitespace-pre-wrap text-sm font-bold leading-6 text-slate-700">{request.result_content}</p>
                            <p className="mt-2 text-[11px] font-bold text-slate-400">
                              {request.result_author_name ?? "-"}
                              {request.result_author_department_name ? ` · ${request.result_author_department_name}` : ""}
                              {request.result_updated_at ? ` · ${formatDateTime(request.result_updated_at)}` : ""}
                            </p>
                          </div>
                        ) : null}
                        {!request.result_content || editingResultId === request.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingResultId === request.id ? resultText : ""}
                              onChange={(event) => {
                                setEditingResultId(request.id);
                                setResultText(event.target.value);
                              }}
                              className="min-h-20 w-full rounded-2xl border border-[#d7e4f6] bg-[#f8fbff] px-3 py-3 text-sm font-bold text-[#10223d] outline-none focus:border-[#075be8]"
                              placeholder="처리결과를 입력하세요."
                              disabled={!canEditResult}
                            />
                            <div className="flex justify-end gap-2">
                              {editingResultId === request.id && request.result_content ? (
                                <button type="button" onClick={() => setEditingResultId(null)} className="tool-button min-h-8 py-1 text-xs">
                                  취소
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => saveResult(request.id)}
                                disabled={isPending || !canEditResult}
                                className="tool-button tool-button-primary min-h-8 py-1 text-xs"
                              >
                                처리결과 등록
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {message ? <p className="mt-3 rounded-xl bg-[#eef6ff] px-3 py-2 text-xs font-black text-[#075be8]">{message}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
