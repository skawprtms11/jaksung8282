"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
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

export function MeetingPriorityPanel({ items }: { items: MeetingPriorityItem[] }) {
  const [selected, setSelected] = useState<MeetingPriorityItem | null>(null);
  const veryHighItems = items.filter((item) => item.importance === "very_high");
  const highItems = items.filter((item) => item.importance === "high");

  useEffect(() => {
    if (!selected) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  return (
    <>
      <section className="sketch-panel h-full p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#10223d]">핵심 이슈</p>
            <p className="text-xs font-bold text-slate-500">매우높음과 높음 제목만 모아 봅니다.</p>
          </div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#e8f1ff] text-[#075be8]">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>

        <PriorityList title="매우높음" items={veryHighItems} onSelect={setSelected} tone="red" />
        <PriorityList title="높음" items={highItems} onSelect={setSelected} tone="orange" />
      </section>

      {selected ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="priority-detail-title">
          <div className="w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white shadow-[0_28px_80px_rgba(16,34,61,0.26)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-black", importanceClassName(selected.importance))}>
                    {importanceLabels[selected.importance]}
                  </span>
                  <span className="section-chip">{periodLabels[selected.period]}</span>
                  <span className="section-chip">{selected.categoryName}</span>
                </div>
                <h2 id="priority-detail-title" className="text-xl font-black text-[#10223d]">
                  {selected.title}
                </h2>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {selected.departmentName} · {selected.clientName}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="icon-tool-button" aria-label="상세 팝업 닫기">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="bg-[#f5f9ff] px-5 py-5">
              <div className="min-h-40 whitespace-pre-wrap rounded-2xl border border-[#d9e7f7] bg-white px-4 py-4 text-sm leading-7 text-slate-700">
                {selected.content || "-"}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PriorityList({
  title,
  items,
  tone,
  onSelect
}: {
  title: string;
  items: MeetingPriorityItem[];
  tone: "red" | "orange";
  onSelect: (item: MeetingPriorityItem) => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-[#d9e7f7] bg-white/86 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-black text-[#10223d]">{title}</p>
        <span
          className={cn(
            "inline-flex h-6 min-w-8 items-center justify-center rounded-full px-2 text-xs font-black",
            tone === "red" ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"
          )}
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#b9cce4] px-3 py-5 text-center text-xs font-bold text-slate-400">
          표시할 제목이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="w-full rounded-xl border border-[#e2ecf8] bg-[#f8fbff] px-3 py-2 text-left text-xs font-black text-[#10223d] transition hover:border-[#9fc2f6] hover:bg-white hover:text-[#075be8]"
            >
              <span className="block truncate">{item.title || "제목 없음"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
