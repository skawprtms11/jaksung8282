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

function importanceDotClassName(importance: MeetingPriorityItem["importance"]) {
  return importance === "very_high" ? "u-dot-pink" : "u-dot-amber";
}

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
            <p className="text-sm font-black">핵심 이슈</p>
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
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#012241]/60 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(1,34,65,0.26)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#e7ddcd] px-5 py-4">
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
        <div className="space-y-3 overflow-y-auto bg-white px-5 py-5">
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
    <section className="rounded-[1.25rem] border border-[#e4dac9] bg-[#faf6ef] px-4 py-4">
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
    <div className="panel-blush p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-[#012241]">확인요청현황</p>
        <span className="inline-flex items-baseline gap-1 rounded-full bg-white/75 px-3 py-1 shadow-[0_6px_16px_rgba(1,34,65,0.06)] ring-1 ring-white/80">
          <span className="text-xs font-bold text-[#4a5a6a]">미종결</span>
          <span className="text-sm font-black tabular-nums text-[#012241]">{items.length}건</span>
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 py-3 text-center text-xs font-bold text-[#4a5a6a]">진행 중인 업무 요청이 없습니다.</p>
      ) : (
        <div className="mt-2">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "group flex w-full items-start gap-3 border-t border-[#012241]/10 py-3 text-left",
                index === 0 && "border-t-0"
              )}
            >
              <span className="u-dot u-dot-amber mt-1.5" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black leading-5 text-[#012241] group-hover:text-[#007050]" title={item.title || "제목 없음"}>
                  {item.title || "제목 없음"}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-bold text-[#4a5a6a]">
                  {item.departmentName} · {item.clientName} · {item.categoryName} ·{" "}
                  {compactMonthLabel(item.monthLabel)} {compactWeekLabel(item.weekLabel)}
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
    <div className="panel-dark p-4">
      <p className="text-sm font-black text-white">{title}</p>
      {items.length === 0 ? (
        <p className="mt-3 py-3 text-center text-xs font-bold text-white/45">표시할 제목이 없습니다.</p>
      ) : (
        <div className="mt-2">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "group flex w-full items-start gap-3 border-t border-white/10 py-3 text-left",
                index === 0 && "border-t-0"
              )}
            >
              <span className={cn("u-dot mt-1.5", importanceDotClassName(item.importance))} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black leading-5 text-white group-hover:text-[#7fdcae]" title={item.title || "제목 없음"}>
                  {item.title || "제목 없음"}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-bold text-white/55">
                  {item.departmentName} · {item.clientName} · {item.categoryName}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
