"use client";

import { type FormEvent, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { WeekSelect } from "@/components/reports/WeekSelect";
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

function inputClassName() {
  return "mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm font-semibold text-[#012241] outline-none transition focus:border-[#007050] focus:ring-2 focus:ring-[#007050]/15";
}

export function ClientReportsToolbar({
  categories,
  selectedWeekStartDate,
  filters,
  resultCount
}: {
  categories: Category[];
  selectedWeekStartDate: string;
  filters: ClientReportSearchFilters;
  resultCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query ?? "");
  const [detailOpen, setDetailOpen] = useState(() =>
    advancedSearchKeys.some((key) => Boolean(searchParams.get(key)))
  );
  const [searchData, setSearchData] = useState(filters.searchData ?? "");
  const [workCategoryId, setWorkCategoryId] = useState(filters.workCategoryId ?? "");
  const [importance, setImportance] = useState<Importance | "">(filters.importance ?? "");
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(filters.dateTo ?? "");
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

  function submitQuickSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextParams = new URLSearchParams(searchParams.toString());
    clearSearchParams(nextParams);
    if (query.trim()) {
      nextParams.set("q", query.trim());
    }
    navigate(nextParams);
  }

  function submitDetailedSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextParams = new URLSearchParams(searchParams.toString());
    const formData = new FormData(event.currentTarget);
    clearSearchParams(nextParams);
    const values = {
      work_category_id: String(formData.get("work_category_id") ?? ""),
      importance: String(formData.get("importance") ?? ""),
      search_data: String(formData.get("search_data") ?? "").trim(),
      date_from: String(formData.get("date_from") ?? ""),
      date_to: String(formData.get("date_to") ?? "")
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
    setDateFrom("");
    setDateTo("");
    if (closeDetails) {
      setDetailOpen(false);
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    clearSearchParams(nextParams);
    navigate(nextParams);
  }

  return (
    <section className="mb-3 rounded-md border border-[#e7ddcd] bg-white/90 p-3 shadow-[0_10px_26px_rgba(16,34,61,0.05)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        {detailOpen ? (
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:min-w-[380px]">
            <label className="text-xs font-bold text-slate-600">
              기간 시작
              <input
                form="client-report-detailed-search"
                name="date_from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
                className={inputClassName()}
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              기간 종료
              <input
                form="client-report-detailed-search"
                name="date_to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
                className={inputClassName()}
              />
            </label>
          </div>
        ) : (
          <WeekSelect
            key={selectedWeekStartDate}
            compactWeekLabel
            defaultWeekStartDate={selectedWeekStartDate}
            className="grid gap-2 sm:grid-cols-3"
            labelClassName="text-xs font-bold text-slate-600"
            weekLabelClassName="text-xs font-bold text-slate-600"
            controlClassName="mt-1 h-9 w-full min-w-[112px] rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-[#012241] outline-none transition focus:border-[#007050] focus:ring-2 focus:ring-[#007050]/15"
            onSelectionChange={(week) => {
              const nextParams = new URLSearchParams(searchParams.toString());
              nextParams.set("report_year", String(week.year));
              nextParams.set("report_month", String(week.month));
              nextParams.set("week_of_month", String(week.weekOfMonth));
              nextParams.set("week_start_date", week.weekStartDate);
              nextParams.delete("date_from");
              nextParams.delete("date_to");
              setDateFrom("");
              setDateTo("");
              navigate(nextParams);
            }}
          />
        )}

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end xl:justify-end">
          {hasSearch ? (
            <span className="self-center whitespace-nowrap text-xs font-black text-[#007050]">검색결과 {resultCount}건</span>
          ) : null}
          <form onSubmit={submitQuickSearch} className="flex min-w-0 flex-1 items-end gap-2 sm:flex-none">
            <label className="min-w-0 flex-1 text-xs font-bold text-slate-600 sm:w-[280px]">
              제목 검색
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="금주·차주 제목 검색"
                className={inputClassName()}
              />
            </label>
            <button type="button" onClick={() => resetSearch(true)} className="tool-button h-9 shrink-0" disabled={isPending}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              초기화
            </button>
            <button type="submit" className="tool-button tool-button-primary h-9 shrink-0" disabled={isPending}>
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              검색
            </button>
          </form>
          <button
            type="button"
            className="tool-button h-9 shrink-0"
            aria-expanded={detailOpen}
            aria-controls="client-report-detailed-search"
            onClick={() => setDetailOpen((current) => !current)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            상세검색
          </button>
        </div>
      </div>

      {detailOpen ? (
        <form
          id="client-report-detailed-search"
          onSubmit={submitDetailedSearch}
          className="mt-3 border-t border-[#e7ddcd] pt-3"
        >
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-bold text-slate-600">
              업무구분
              <select name="work_category_id" value={workCategoryId} onChange={(event) => setWorkCategoryId(event.target.value)} className={inputClassName()}>
                <option value="">전체</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.category_name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              중요도
              <select name="importance" value={importance} onChange={(event) => setImportance(event.target.value as Importance | "")} className={inputClassName()}>
                <option value="">전체</option>
                {importanceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600 xl:col-span-2">
              검색 데이터
              <input
                name="search_data"
                value={searchData}
                onChange={(event) => setSearchData(event.target.value)}
                placeholder="제목·금주·차주 내용 검색"
                className={inputClassName()}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => resetSearch()} className="tool-button h-9" disabled={isPending}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              초기화
            </button>
            <button type="submit" className="tool-button tool-button-primary h-9" disabled={isPending}>
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              검색
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
