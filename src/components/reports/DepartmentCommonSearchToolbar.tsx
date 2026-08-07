"use client";

import { type KeyboardEvent, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { ClientReportSearchFilters } from "@/lib/reports/client-report-search";
import type { Importance } from "@/types/enums";

type Category = { id: string; category_name: string };

const advancedSearchKeys = [
  "search_data",
  "work_category_id",
  "importance",
  "title",
  "current_content",
  "next_content",
  "date_from",
  "date_to"
] as const;

const importanceOptions: { value: Importance; label: string }[] = [
  { value: "very_high", label: "매우높음" },
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" }
];

const controlClassName =
  "mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#075be8] focus:ring-2 focus:ring-[#075be8]/15";

export function DepartmentCommonSearchToolbar({
  categories,
  filters,
  resultCount,
  detailsId = "department-common-detailed-search",
  unifiedDataSearch = false,
  showQuickReset = false,
  inlineQuickSearch = false
}: {
  categories: Category[];
  filters: ClientReportSearchFilters;
  resultCount: number;
  detailsId?: string;
  unifiedDataSearch?: boolean;
  showQuickReset?: boolean;
  inlineQuickSearch?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [detailOpen, setDetailOpen] = useState(() =>
    advancedSearchKeys.some((key) => Boolean(searchParams.get(key)))
  );
  const [query, setQuery] = useState(filters.query ?? "");
  const [searchData, setSearchData] = useState(filters.searchData ?? "");
  const [workCategoryId, setWorkCategoryId] = useState(filters.workCategoryId ?? "");
  const [importance, setImportance] = useState<Importance | "">(filters.importance ?? "");
  const [title, setTitle] = useState(filters.title ?? "");
  const [currentContent, setCurrentContent] = useState(filters.currentContent ?? "");
  const [nextContent, setNextContent] = useState(filters.nextContent ?? "");
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(filters.dateTo ?? "");
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const hasSearch = Boolean(filters.query || advancedSearchKeys.some((key) => searchParams.get(key)));

  function navigate(nextParams: URLSearchParams) {
    const queryString = nextParams.toString();
    startTransition(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    });
  }

  function clearSearchParams(nextParams: URLSearchParams) {
    nextParams.delete("q");
    advancedSearchKeys.forEach((key) => nextParams.delete(key));
  }

  function submitQuickSearch() {
    const nextParams = new URLSearchParams(searchParams.toString());
    clearSearchParams(nextParams);
    if (query.trim()) {
      nextParams.set("q", query.trim());
    }
    navigate(nextParams);
  }

  function submitDetailedSearch() {
    const nextParams = new URLSearchParams(searchParams.toString());
    clearSearchParams(nextParams);
    const values = unifiedDataSearch
      ? {
          work_category_id: workCategoryId,
          importance,
          search_data: searchData.trim(),
          date_from: dateFromRef.current?.value ?? dateFrom,
          date_to: dateToRef.current?.value ?? dateTo
        }
      : {
          work_category_id: workCategoryId,
          importance,
          title: title.trim(),
          current_content: currentContent.trim(),
          next_content: nextContent.trim(),
          date_from: dateFromRef.current?.value ?? dateFrom,
          date_to: dateToRef.current?.value ?? dateTo
        };
    Object.entries(values).forEach(([key, value]) => {
      if (value) {
        nextParams.set(key, value);
      }
    });
    navigate(nextParams);
  }

  function resetSearch(closeDetails = false) {
    setQuery("");
    setSearchData("");
    setWorkCategoryId("");
    setImportance("");
    setTitle("");
    setCurrentContent("");
    setNextContent("");
    setDateFrom("");
    setDateTo("");
    if (closeDetails) {
      setDetailOpen(false);
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    clearSearchParams(nextParams);
    navigate(nextParams);
  }

  function handleQuickSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitQuickSearch();
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <div className={`flex flex-wrap justify-end gap-2 ${inlineQuickSearch ? "items-center" : "items-end"}`}>
        {hasSearch ? (
          <span className="self-center whitespace-nowrap text-xs font-black text-[#075be8]">검색결과 {resultCount}건</span>
        ) : null}
        <label className={`min-w-[190px] flex-1 text-xs font-bold text-slate-600 lg:max-w-[360px] ${inlineQuickSearch ? "flex items-center gap-2" : ""}`}>
          <span className={inlineQuickSearch ? "shrink-0 whitespace-nowrap" : ""}>제목 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleQuickSearchKeyDown}
            placeholder="금주·차주 제목 검색"
            className={inlineQuickSearch ? controlClassName.replace("mt-1 ", "") : controlClassName}
          />
        </label>
        {showQuickReset ? (
          <button
            type="button"
            onClick={() => resetSearch(true)}
            className="tool-button h-9"
            disabled={isPending}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            초기화
          </button>
        ) : null}
        <button type="button" onClick={submitQuickSearch} className="tool-button tool-button-primary h-9" disabled={isPending}>
          {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          검색
        </button>
        <button
          type="button"
          onClick={() => setDetailOpen((current) => !current)}
          className="tool-button h-9"
          aria-expanded={detailOpen}
          aria-controls={detailsId}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          상세검색
        </button>
      </div>

      {detailOpen ? (
        <div id={detailsId} className="mt-2 border-t border-[#e2ebf5] pt-2">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-bold text-slate-600">
              업무구분
              <select value={workCategoryId} onChange={(event) => setWorkCategoryId(event.target.value)} className={controlClassName}>
                <option value="">전체</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.category_name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              중요도
              <select value={importance} onChange={(event) => setImportance(event.target.value as Importance | "")} className={controlClassName}>
                <option value="">전체</option>
                {importanceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {unifiedDataSearch ? (
              <label className="text-xs font-bold text-slate-600 xl:col-span-2">
                검색 데이터
                <input
                  value={searchData}
                  onChange={(event) => setSearchData(event.target.value)}
                  placeholder="제목·금주·차주 내용 검색"
                  className={controlClassName}
                />
              </label>
            ) : (
              <>
                <label className="text-xs font-bold text-slate-600">
                  제목
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className={controlClassName} />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  금주 실시사항
                  <input value={currentContent} onChange={(event) => setCurrentContent(event.target.value)} className={controlClassName} />
                </label>
                <label className="text-xs font-bold text-slate-600 xl:col-span-2">
                  차주 예정사항
                  <input value={nextContent} onChange={(event) => setNextContent(event.target.value)} className={controlClassName} />
                </label>
              </>
            )}
            <div className="grid grid-cols-2 gap-2 xl:col-span-2">
              <label className="text-xs font-bold text-slate-600">
                기간 시작
                <input ref={dateFromRef} type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className={controlClassName} />
              </label>
              <label className="text-xs font-bold text-slate-600">
                기간 종료
                <input ref={dateToRef} type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className={controlClassName} />
              </label>
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => resetSearch()} className="tool-button h-9" disabled={isPending}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              초기화
            </button>
            <button type="button" onClick={submitDetailedSearch} className="tool-button tool-button-primary h-9" disabled={isPending}>
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              검색
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
