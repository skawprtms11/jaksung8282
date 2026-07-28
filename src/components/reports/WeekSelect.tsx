"use client";

import { useMemo, useState } from "react";
import { getCurrentWeekOption, getReportMonthByThursday, getWeekOptions, type WeekOption } from "@/lib/dates/week";

export function WeekSelect({
  defaultWeekStartDate,
  compactWeekLabel = false,
  className = "grid gap-3 md:grid-cols-4",
  labelClassName = "text-sm",
  weekLabelClassName = "text-sm md:col-span-2",
  controlClassName = "mt-1 h-10 w-full rounded-md border border-slate-300 px-3",
  onSelectionChange
}: {
  defaultWeekStartDate?: string;
  compactWeekLabel?: boolean;
  className?: string;
  labelClassName?: string;
  weekLabelClassName?: string;
  controlClassName?: string;
  onSelectionChange?: (week: WeekOption) => void;
}) {
  const current = getCurrentWeekOption();
  const defaultReportMonth = defaultWeekStartDate ? getReportMonthByThursday(defaultWeekStartDate) : current;
  const [year, setYear] = useState(defaultReportMonth.year);
  const [month, setMonth] = useState(defaultReportMonth.month);
  const weeks = useMemo(() => getWeekOptions(year, month), [year, month]);
  const initialSelected =
    weeks.find((week) => week.weekStartDate === defaultWeekStartDate) ??
    weeks.find((week) => week.weekOfMonth === current.weekOfMonth) ??
    weeks[0];
  const [selectedWeekStart, setSelectedWeekStart] = useState(initialSelected?.weekStartDate ?? current.weekStartDate);
  const selected = weeks.find((week) => week.weekStartDate === selectedWeekStart) ?? weeks[0] ?? current;

  function selectWeek(option: WeekOption) {
    setSelectedWeekStart(option.weekStartDate);
    onSelectionChange?.(option);
  }

  return (
    <div className={className}>
      <label className={labelClassName}>
        년도
        <select
          name="report_year"
          value={year}
          onChange={(event) => {
            const nextYear = Number(event.target.value);
            setYear(nextYear);
            const nextWeeks = getWeekOptions(nextYear, month);
            selectWeek(nextWeeks[0] ?? current);
          }}
          className={controlClassName}
        >
          {Array.from({ length: 7 }, (_, index) => current.year - 3 + index).map((value) => (
            <option key={value} value={value}>
              {value}년
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName}>
        월
        <select
          name="report_month"
          value={month}
          onChange={(event) => {
            const nextMonth = Number(event.target.value);
            setMonth(nextMonth);
            const nextWeeks = getWeekOptions(year, nextMonth);
            selectWeek(nextWeeks[0] ?? current);
          }}
          className={controlClassName}
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value}월
            </option>
          ))}
        </select>
      </label>
      <label className={weekLabelClassName}>
        주차
        <select
          name="week_of_month"
          value={selected.weekOfMonth}
          className={controlClassName}
          onChange={(event) => {
            const option = weeks.find((week) => week.weekOfMonth === Number(event.target.value));
            if (!option) {
              return;
            }
            selectWeek(option);
          }}
        >
          {weeks.map((week) => (
            <option key={week.weekStartDate} value={week.weekOfMonth}>
              {compactWeekLabel ? `${week.weekOfMonth}주차` : week.label}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="week_start_date" value={selected.weekStartDate} />
      <input type="hidden" name="week_end_date" value={selected.weekEndDate} />
    </div>
  );
}
