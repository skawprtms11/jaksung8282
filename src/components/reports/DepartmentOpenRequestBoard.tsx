"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  MeetingItemDetailDialog,
  type MeetingItemDetailSelection,
  type MeetingReportItemRequest
} from "@/components/reports/MeetingMaterialsTable";
import { cn } from "@/lib/utils/cn";
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
  const [rows, setRows] = useState(() => {
    const seen = new Set<string>();
    return requests.filter((request) => {
      if (seen.has(request.requestId)) {
        return false;
      }
      seen.add(request.requestId);
      return true;
    });
  });
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
      <section className="panel-blush overflow-hidden" aria-labelledby="department-open-request-title">
        <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-[#012241]/10 ${compact ? "px-3 py-1.5" : "px-4 py-3"}`}>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center justify-center rounded-xl bg-white/70 text-[#007050] ${compact ? "h-7 w-7" : "h-8 w-8"}`}>
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 id="department-open-request-title" className="text-sm font-black text-[#012241]">
              {title}
            </h2>
          </div>
          <span className="inline-flex items-baseline gap-1 rounded-full bg-white/75 px-3 py-1 shadow-[0_6px_16px_rgba(1,34,65,0.06)] ring-1 ring-white/80">
            <span className="text-xs font-bold text-[#4a5a6a]">미종결</span>
            <span className="text-sm font-black tabular-nums text-[#012241]">{rows.length}건</span>
          </span>
        </div>

        {rows.length === 0 ? (
          <p className={`text-center text-xs font-bold text-[#4a5a6a] ${compact ? "px-3 py-3" : "px-4 py-5"}`}>{emptyMessage}</p>
        ) : (
          <div className={compact ? "px-3 pb-2" : "px-4 pb-3"}>
            {rows.map((request, index) => (
              <article
                key={request.requestId}
                className={cn(
                  "flex items-start gap-3 border-t border-[#012241]/10",
                  compact ? "py-2" : "py-3",
                  index === 0 && "border-t-0"
                )}
              >
                <span
                  className={cn("u-dot mt-1.5", request.resultContent ? "u-dot-green" : "u-dot-amber")}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setSelectedRequestId(request.requestId)}
                    className={cn(
                      "block max-w-full text-left font-black leading-5 text-[#012241] underline-offset-4 hover:text-[#007050] hover:underline",
                      compact ? "truncate text-[13px]" : "text-sm"
                    )}
                  >
                    {request.title}
                  </button>
                  <p className="mt-1 truncate text-[11px] font-bold text-[#4a5a6a]">
                    {request.sourceLabel} · {request.categoryName} · {request.resultContent ? "처리결과 등록" : "처리대기"} ·{" "}
                    {request.weekLabel} · {formatDateTime(request.requestCreatedAt)} 등록
                  </p>
                  <p
                    className={cn(
                      "mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-[#3a4a5a]",
                      compact ? "line-clamp-1" : "line-clamp-2"
                    )}
                  >
                    {request.requestContent}
                  </p>
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
