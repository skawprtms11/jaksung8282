"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/labels";
import type { Importance, ItemPeriod } from "@/types/enums";

export type MeetingPriorityItem = {
  id: string;
  title: string;
  content: string;
  importance: Extract<Importance, "very_high" | "high">;
  period: ItemPeriod;
  categoryName: string;
  departmentName: string;
  clientName: string;
};

export type MeetingOpenRequestItem = {
  id: string;
  requestDate: string;
  monthLabel: string;
  weekLabel: string;
  departmentName: string;
  clientName: string;
  categoryName: string;
  title: string;
  content: string;
  requestContent: string;
  resultContent: string | null;
};

const importanceLabels: Record<MeetingPriorityItem["importance"], string> = {
  very_high: "매우높음",
  high: "높음"
};

const periodLabels: Record<ItemPeriod, string> = {
  current: "금주",
  next: "차주"
};

function importanceClassName(importance: MeetingPriorityItem["importance"]) {
  return importance === "very_high"
    ? "border-red-100 bg-red-50 text-red-600"
    : "border-orange-100 bg-orange-50 text-orange-600";
}

export function MeetingPriorityPanel({ items, openRequests = [] }: { items: MeetingPriorityItem[]; openRequests?: MeetingOpenRequestItem[] }) {
  const [selected, setSelected] = useState<MeetingPriorityItem | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<MeetingOpenRequestItem | null>(null);
  const [visibleImportances, setVisibleImportances] = useState<MeetingPriorityItem["importance"][]>(["very_high", "high"]);
  const filteredItems = items.filter((item) => visibleImportances.includes(item.importance));
  const currentItems = filteredItems.filter((item) => item.period === "current");
  const nextItems = filteredItems.filter((item) => item.period === "next");
  const toggleImportance = (importance: MeetingPriorityItem["importance"]) => {
    setVisibleImportances((current) =>
      current.includes(importance) ? current.filter((value) => value !== importance) : [...current, importance]
    );
  };

  useEffect(() => {
    if (!selected && !selectedRequest) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setSelectedRequest(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, selectedRequest]);

  return (
    <>
      <section className="sketch-panel h-full p-3">
        <div className="mb-3 flex min-h-[54px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#012241]">핵심 이슈</p>
            <p className="text-xs font-bold text-slate-500">중요도가 높은 금주·차주 제목을 모아 봅니다.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {(Object.keys(importanceLabels) as MeetingPriorityItem["importance"][]).map((importance) => (
              <label key={importance} className="section-chip cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleImportances.includes(importance)}
                  onChange={() => toggleImportance(importance)}
                  className="h-4 w-4 accent-[#007050]"
                />
                {importanceLabels[importance]}
              </label>
            ))}
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#e6f1ec] text-[#007050]">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <OpenRequestBlock items={openRequests} onSelect={setSelectedRequest} />
          <PriorityPeriodBlock title="금주 실시사항" items={currentItems} onSelect={setSelected} />
          <PriorityPeriodBlock title="차주 예정사항" items={nextItems} onSelect={setSelected} />
        </div>
      </section>

      {selected ? (
        <IssueDetailDialog
          title={selected.title || "제목 없음"}
          labelledBy="priority-detail-title"
          subtitle={`${selected.departmentName} · ${selected.clientName}`}
          chips={[
            { label: importanceLabels[selected.importance], className: importanceClassName(selected.importance) },
            { label: periodLabels[selected.period] },
            { label: selected.categoryName }
          ]}
          sections={[{ title: "내용", value: selected.content }]}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {selectedRequest ? (
        <IssueDetailDialog
          title={selectedRequest.title || "제목 없음"}
          labelledBy="open-request-detail-title"
          subtitle={`요청등록 ${formatDateTime(selectedRequest.requestDate)}`}
          chips={[
            { label: `${compactMonthLabel(selectedRequest.monthLabel)} ${compactWeekLabel(selectedRequest.weekLabel)}` },
            { label: selectedRequest.departmentName },
            { label: selectedRequest.clientName },
            { label: selectedRequest.categoryName }
          ]}
          sections={[
            { title: "내용", value: selectedRequest.content },
            { title: "요청등록 내용", value: selectedRequest.requestContent },
            { title: "처리결과 등록내용", value: selectedRequest.resultContent ?? "등록된 처리결과가 없습니다." }
          ]}
          onClose={() => setSelectedRequest(null)}
        />
      ) : null}
    </>
  );
}

function IssueDetailDialog({
  title,
  subtitle,
  labelledBy,
  chips,
  sections,
  onClose
}: {
  title: string;
  subtitle: string;
  labelledBy: string;
  chips: { label: string; className?: string }[];
  sections: { title: string; value: string }[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.5rem] border border-white/80 bg-white shadow-[0_28px_80px_rgba(16,34,61,0.26)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span key={`${chip.label}-${chip.className ?? "chip"}`} className={cn("section-chip", chip.className)}>
                  {chip.label}
                </span>
              ))}
            </div>
            <h2 id={labelledBy} className="text-xl font-black text-[#012241]">
              {title}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button shrink-0" aria-label="상세 팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto bg-[#faf6ef] px-5 py-5">
          {sections.map((section) => (
            <DetailBox key={section.title} title={section.title} value={section.value} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailBox({ title, value }: { title: string; value: string }) {
  return (
    <section className="rounded-2xl border border-[#e7ddcd] bg-white px-4 py-4">
      <p className="mb-2 text-sm font-black text-[#012241]">{title}</p>
      <div className="min-h-20 whitespace-pre-wrap text-sm leading-7 text-slate-700">{value || "-"}</div>
    </section>
  );
}

function OpenRequestBlock({
  items,
  onSelect
}: {
  items: MeetingOpenRequestItem[];
  onSelect: (item: MeetingOpenRequestItem) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#e7ddcd] bg-white/86 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-[#012241]">확인 요청 현황</p>
        <span className="inline-flex h-6 min-w-8 items-center justify-center rounded-full bg-[#e6f1ec] px-2 text-[11px] font-black text-[#007050]">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d3c6b0] px-3 py-5 text-center text-xs font-bold text-slate-400">
          진행 중인 업무 요청이 없습니다.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#e7ddcd] bg-white">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "group grid w-full gap-1.5 border-t border-[#f0e9dd] px-2 py-1.5 text-left text-xs transition hover:bg-[#faf6ef] sm:grid-cols-[54px_58px_64px_minmax(0,1fr)] sm:items-center sm:gap-2",
                index === 0 && "border-t-0"
              )}
            >
              <span className="truncate text-[10px] font-black text-[#007050]" title={`${item.monthLabel} ${item.weekLabel}`}>
                {compactMonthLabel(item.monthLabel)} {compactWeekLabel(item.weekLabel)}
              </span>
              <span className="truncate text-[11px] font-black text-slate-500" title={item.departmentName}>
                {item.departmentName}
              </span>
              <span className="truncate text-[11px] font-black text-slate-500" title={item.clientName}>
                {item.clientName}
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="inline-flex h-6 min-w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 px-2 text-[11px] font-black text-blue-700"
                    title={item.categoryName}
                  >
                    {item.categoryName}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#012241] group-hover:text-[#007050]">
                    {item.title || "제목 없음"}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function compactMonthLabel(monthLabel: string) {
  const match = /(\d{4})년\s*(\d{1,2})월/.exec(monthLabel);
  if (!match) {
    return monthLabel;
  }
  return `${match[1].slice(2)}/${match[2].padStart(2, "0")}`;
}

function compactWeekLabel(weekLabel: string) {
  return weekLabel.replace("주차", "주");
}

function PriorityPeriodBlock({
  title,
  items,
  onSelect
}: {
  title: string;
  items: MeetingPriorityItem[];
  onSelect: (item: MeetingPriorityItem) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#e7ddcd] bg-white/86 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-[#012241]">{title}</p>
        <span className="inline-flex h-6 min-w-8 items-center justify-center rounded-full bg-[#e6f1ec] px-2 text-[11px] font-black text-[#007050]">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d3c6b0] px-3 py-5 text-center text-xs font-bold text-slate-400">
          표시할 제목이 없습니다.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#e7ddcd] bg-white">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "group grid w-full gap-1.5 border-t border-[#f0e9dd] px-2 py-1.5 text-left text-xs transition hover:bg-[#faf6ef] sm:grid-cols-[58px_64px_minmax(0,1fr)] sm:items-center sm:gap-2",
                index === 0 && "border-t-0"
              )}
            >
              <span className="truncate text-[11px] font-black text-slate-500" title={item.departmentName}>
                {item.departmentName}
              </span>
              <span className="truncate text-[11px] font-black text-slate-500" title={item.clientName}>
                {item.clientName}
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex h-6 min-w-10 shrink-0 items-center justify-center rounded-lg border px-2 text-[11px] font-black",
                      importanceClassName(item.importance)
                    )}
                    title={item.categoryName}
                  >
                    {item.categoryName}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#012241] group-hover:text-[#007050]">
                    {item.title || "제목 없음"}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
