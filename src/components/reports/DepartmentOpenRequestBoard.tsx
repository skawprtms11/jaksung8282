"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Clock3, MessageSquareText } from "lucide-react";
import {
  MeetingItemDetailDialog,
  type MeetingItemDetailSelection,
  type MeetingReportItemRequest
} from "@/components/reports/MeetingMaterialsTable";
import { formatDateTime } from "@/lib/utils/labels";

export type DepartmentOpenRequestItem = {
  requestId: string;
  requestCreatedAt: string;
  weekLabel: string;
  sourceLabel: string;
  categoryName: string;
  title: string;
  requestContent: string;
  resultContent: string | null;
  selection: MeetingItemDetailSelection;
};

function updateSelectionRequest(
  selection: MeetingItemDetailSelection,
  request: MeetingReportItemRequest
): MeetingItemDetailSelection {
  const requests = selection.item.weekly_report_item_requests;
  const exists = requests.some((current) => current.id === request.id);
  return {
    ...selection,
    item: {
      ...selection.item,
      weekly_report_item_requests: exists
        ? requests.map((current) => (current.id === request.id ? request : current))
        : [...requests, request]
    }
  };
}

function removeSelectionRequest(
  selection: MeetingItemDetailSelection,
  requestId: string
): MeetingItemDetailSelection {
  return {
    ...selection,
    item: {
      ...selection.item,
      weekly_report_item_requests: selection.item.weekly_report_item_requests.filter(
        (request) => request.id !== requestId
      )
    }
  };
}

export function DepartmentOpenRequestBoard({
  requests,
  currentUserId,
  canManageAllRequests,
  title = "사업부 요청사항",
  emptyMessage = "진행 중인 사업부 요청사항이 없습니다.",
  onDataChanged,
  compact = false
}: {
  requests: DepartmentOpenRequestItem[];
  currentUserId: string;
  canManageAllRequests: boolean;
  title?: string;
  emptyMessage?: string;
  onDataChanged?: () => void;
  compact?: boolean;
}) {
  const [rows, setRows] = useState(requests);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const selected = useMemo(
    () => rows.find((request) => request.requestId === selectedRequestId)?.selection ?? null,
    [rows, selectedRequestId]
  );

  function handleRequestSaved(savedRequest: MeetingReportItemRequest) {
    setRows((current) =>
      current.flatMap((row) => {
        if (row.selection.item.request_target_key !== savedRequest.target_key) {
          return [row];
        }
        if (row.requestId === savedRequest.id && savedRequest.closed_at) {
          return [];
        }
        return [
          {
            ...row,
            requestContent: row.requestId === savedRequest.id ? savedRequest.request_content : row.requestContent,
            resultContent: row.requestId === savedRequest.id ? savedRequest.result_content : row.resultContent,
            selection: updateSelectionRequest(row.selection, savedRequest)
          }
        ];
      })
    );
    if (savedRequest.closed_at && selectedRequestId === savedRequest.id) {
      setSelectedRequestId(null);
    }
    onDataChanged?.();
  }

  function handleRequestDeleted(requestId: string) {
    setRows((current) =>
      current.flatMap((row) => {
        if (row.requestId === requestId) {
          return [];
        }
        return [{ ...row, selection: removeSelectionRequest(row.selection, requestId) }];
      })
    );
    if (selectedRequestId === requestId) {
      setSelectedRequestId(null);
    }
    onDataChanged?.();
  }

  return (
    <>
      <section
        className="overflow-hidden rounded-2xl border border-[#ddd2bf] bg-white/90 shadow-[0_12px_30px_rgba(16,34,61,0.05)]"
        aria-labelledby="department-open-request-title"
      >
        <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-[#e7ddcd] ${compact ? "px-3 py-0.5" : "px-4 py-3"}`}>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center justify-center rounded-lg border border-[#ddd2bf] bg-[#f4ede2] text-[#007050] ${compact ? "h-7 w-7" : "h-8 w-8"}`}>
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 id="department-open-request-title" className="text-sm font-black text-[#012241]">
              {title}
            </h2>
          </div>
          <span className="inline-flex h-7 items-center rounded-full border border-[#ddd2bf] bg-[#faf6ef] px-2.5 text-xs font-black text-[#007050]">
            미종결 {rows.length}건
          </span>
        </div>

        {rows.length === 0 ? (
          <p className={`text-center text-xs font-bold text-slate-400 ${compact ? "px-3 py-3" : "px-4 py-5"}`}>{emptyMessage}</p>
        ) : (
          <div className="divide-y divide-[#ece3d4]">
            {rows.map((request) => (
              <article key={request.requestId} className={`grid lg:grid-cols-[170px_minmax(0,1fr)_minmax(240px,0.8fr)_110px] lg:items-center ${compact ? "gap-2 px-3 py-0.5" : "gap-3 px-4 py-3"}`}>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-[#007050]">{request.sourceLabel}</p>
                  <p className={`${compact ? "mt-0.5" : "mt-1"} flex items-center gap-1 text-[11px] font-bold text-slate-400`}>
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {request.weekLabel}
                  </p>
                </div>
                <div className={`min-w-0 ${compact ? "flex items-center gap-2" : ""}`}>
                  <span className={`${compact ? "shrink-0" : "mb-1"} inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-black text-slate-600`}>
                    {request.categoryName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedRequestId(request.requestId)}
                    className={`${compact ? "min-w-0 truncate text-[13px]" : "block max-w-full text-sm"} text-left font-black leading-5 text-[#012241] underline-offset-4 hover:text-[#007050] hover:underline`}
                    style={compact ? { fontSize: "13px" } : undefined}
                  >
                    {request.title}
                  </button>
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-[11px] font-black text-slate-500">
                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                    요청내용
                  </p>
                  <p className={`${compact ? "mt-0.5 line-clamp-1" : "mt-1 line-clamp-2"} whitespace-pre-wrap text-xs font-bold leading-5 text-slate-600`}>
                    {request.requestContent}
                  </p>
                </div>
                <div className="lg:text-right">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${request.resultContent ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
                    {request.resultContent ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    {request.resultContent ? "처리결과 등록" : "처리대기"}
                  </span>
                  <p className={`${compact ? "mt-0.5" : "mt-1"} text-[10px] font-bold text-slate-400`}>{formatDateTime(request.requestCreatedAt)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <MeetingItemDetailDialog
          selected={selected}
          currentUserId={currentUserId}
          canManageAllRequests={canManageAllRequests}
          onClose={() => setSelectedRequestId(null)}
          onRequestSaved={handleRequestSaved}
          onRequestDeleted={handleRequestDeleted}
        />
      ) : null}
    </>
  );
}
