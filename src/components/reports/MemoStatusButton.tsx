"use client";

import { useEffect, useRef, useState } from "react";
import { NotebookText, X } from "lucide-react";
import { loadWeekMemosAction, type WeekMemoItem } from "@/actions/reports";
import { cn } from "@/lib/utils/cn";

type MemoStatusButtonProps = {
  weekStartDate: string;
  canView: boolean;
  initialItems?: WeekMemoItem[];
  initialCount?: number;
};

export function MemoStatusButton({ weekStartDate, canView, initialItems, initialCount }: MemoStatusButtonProps) {
  const [items, setItems] = useState<WeekMemoItem[]>(initialItems ?? []);
  const [count, setCount] = useState(initialCount ?? initialItems?.length ?? 0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMemos = () => {
    if (!canView) {
      return;
    }
    setIsLoading(true);
    loadWeekMemosAction({ week_start_date: weekStartDate })
      .then((result) => {
        if (result.ok) {
          setItems(result.items);
          setCount(result.count);
        }
      })
      .finally(() => setIsLoading(false));
  };

  // 배지 건수를 주차 변경/초기 미제공 시 최신화한다. 초기 데이터가 있으면 해당 주차는 재조회하지 않는다.
  const syncedWeekRef = useRef<string | null>(initialItems ? weekStartDate : null);
  useEffect(() => {
    if (!canView || syncedWeekRef.current === weekStartDate) {
      return;
    }
    syncedWeekRef.current = weekStartDate;
    let active = true;
    loadWeekMemosAction({ week_start_date: weekStartDate }).then((result) => {
      if (active && result.ok) {
        setItems(result.items);
        setCount(result.count);
      }
    });
    return () => {
      active = false;
    };
  }, [weekStartDate, canView]);

  if (!canView) {
    return null;
  }

  const openDialog = () => {
    setIsOpen(true);
    fetchMemos();
  };

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={openDialog}
        title="부서별 메모현황"
        aria-label="부서별 메모현황"
        className="tool-button h-full min-h-9 shrink-0 px-3"
      >
        <NotebookText className="h-4 w-4" aria-hidden="true" />
        메모현황
      </button>
      {count > 0 ? (
        <span
          className="absolute -right-1 -top-1 rounded-full border border-white bg-[#007050] px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow"
          aria-label={`${count}개 부서 작성됨`}
        >
          {count}
        </span>
      ) : null}

      {isOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-[#012241]/60 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-labelledby="memo-status-title"
        >
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(1,34,65,0.26)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e7ddcd] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="icon-badge icon-badge-green" aria-hidden="true">
                  <NotebookText className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="memo-status-title" className="text-lg font-black text-[#012241]">
                    부서별 메모현황
                  </h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {weekStartDate.replaceAll("-", ".")} · 메모 {count}건
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="icon-tool-button"
                aria-label="메모현황 팝업 닫기"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-4">
              {isLoading && items.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-slate-400">메모현황을 불러오는 중입니다.</p>
              ) : items.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-slate-400">해당 주차에 작성된 부서 메모가 없습니다.</p>
              ) : (
                <div className="overflow-hidden rounded-[1.25rem] border border-[#e4dac9]">
                  <table className="w-full table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[26%]" />
                      <col className="w-[74%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-[#faf6ef] text-[#012241]">
                        <th className="px-4 py-2.5 font-black">부서명</th>
                        <th className="px-4 py-2.5 font-black">메모내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.departmentId} className="border-t border-[#eee4d3] align-top">
                          <td className="px-4 py-2.5 font-black text-[#012241]">{item.departmentName}</td>
                          <td className={cn("px-4 py-2.5 font-semibold leading-6 text-[#012241]")}>
                            <span className="whitespace-pre-wrap break-words">{item.content.trim() || "-"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e7ddcd] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-[#e4dac9] bg-white px-4 py-2 text-sm font-black text-[#012241]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
