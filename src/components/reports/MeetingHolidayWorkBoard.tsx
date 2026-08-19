"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CalendarDays, Users, X } from "lucide-react";
import type { WeekOption } from "@/lib/dates/week";

type DepartmentRow = {
  id: string;
  department_name: string;
};

type DepartmentContentRow = {
  section_type: "common" | "facility" | "vacancy" | "holiday_work";
  current_week_content: string;
  next_week_content: string;
};

type SubmissionRow = {
  id: string;
  department_id: string;
  department_weekly_contents: DepartmentContentRow[];
};

type HolidayWorkItem = {
  id: string;
  work_date: string;
  client_name: string;
  worker_names: string[];
  contract_worker_count: string;
  work_reason: string;
  is_billed: boolean;
  note: string;
};

type HolidayWorkDetail = {
  departmentName: string;
  periodLabel: string;
  items: HolidayWorkItem[];
};

type HolidayDateColumn = {
  key: string;
  label: string;
  weekday: string;
};

const HOLIDAY_WORK_CONTENT_FORMAT = "department-holiday-work/v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const weekdays = ["토", "일", "월", "화", "수", "목", "금"];

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function isoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function mmdd(date: Date) {
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getHolidayColumns(selectedWeek: WeekOption): HolidayDateColumn[] {
  const monday = new Date(`${selectedWeek.weekStartDate}T00:00:00.000Z`);
  const saturday = addDays(monday, -2);
  return weekdays.map((weekday, index) => {
    const date = addDays(saturday, index);
    return {
      key: isoDate(date),
      label: mmdd(date),
      weekday
    };
  });
}

function parseHolidayWorkItems(value: string): HolidayWorkItem[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue) as {
      format?: string;
      items?: Array<Partial<HolidayWorkItem> & { worker_name?: unknown }>;
    };
    if (parsed.format === HOLIDAY_WORK_CONTENT_FORMAT && Array.isArray(parsed.items)) {
      return parsed.items.map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : `${item.work_date}-${item.client_name}-${item.worker_name}`,
        work_date: String(item.work_date ?? ""),
        client_name: String(item.client_name ?? ""),
        worker_names: Array.isArray(item.worker_names)
          ? item.worker_names.map((workerName) => String(workerName)).filter(Boolean)
          : String(item.worker_name ?? "")
              .split(",")
              .map((workerName) => workerName.trim())
              .filter(Boolean),
        contract_worker_count: String(item.contract_worker_count ?? ""),
        work_reason: String(item.work_reason ?? ""),
        is_billed: Boolean(item.is_billed),
        note: String(item.note ?? "")
      }));
    }
  } catch {
    return [];
  }

  return [];
}

function getHolidayItemsByDepartment(submission?: SubmissionRow) {
  const content = submission?.department_weekly_contents.find((row) => row.section_type === "holiday_work");
  return parseHolidayWorkItems(content?.current_week_content ?? "");
}

function contractCount(item: HolidayWorkItem) {
  const parsed = Number(item.contract_worker_count);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function holidayCountCellClassName(count: number, tone: "employee" | "contract" = "employee") {
  if (count < 1) {
    return "bg-[#faf6ef] text-slate-300";
  }
  return tone === "employee"
    ? "bg-[#e6f1ec] text-[#007050] ring-1 ring-[#cbe7d3]"
    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
}

export function MeetingHolidayWorkBoard({
  departments,
  submissions,
  selectedWeek
}: {
  departments: DepartmentRow[];
  submissions: SubmissionRow[];
  selectedWeek: WeekOption;
}) {
  const [detail, setDetail] = useState<HolidayWorkDetail | null>(null);
  const columns = useMemo(() => getHolidayColumns(selectedWeek), [selectedWeek]);
  const periodLabel = useMemo(
    () => `${columns[0]?.label ?? ""} ${columns[0]?.weekday ?? ""} ~ ${columns[6]?.label ?? ""} ${columns[6]?.weekday ?? ""}`.trim(),
    [columns]
  );
  const periodDateKeys = useMemo(() => new Set(columns.map((column) => column.key)), [columns]);
  const departmentRows = departments
    .map((department) => {
      const submission = submissions.find((row) => row.department_id === department.id);
      const periodItems = getHolidayItemsByDepartment(submission).filter((item) => periodDateKeys.has(item.work_date));
      return {
        department,
        items: periodItems
      };
    })
    .filter((row) => row.items.length > 0);
  const allItems = departmentRows.flatMap((row) => row.items);
  const summary = {
    itemCount: allItems.length,
    employeeCount: allItems.reduce((sum, item) => sum + item.worker_names.length, 0),
    contractCount: allItems.reduce((sum, item) => sum + contractCount(item), 0),
    billedCount: allItems.filter((item) => item.is_billed).length
  };

  useEffect(() => {
    if (!detail) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetail(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detail]);

  return (
    <>
      <section className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="근무건수" value={`${summary.itemCount}건`} badgeClassName="icon-badge-blue" />
        <SummaryCard label="정직원" value={`${summary.employeeCount}명`} badgeClassName="icon-badge-green" />
        <SummaryCard label="협력사" value={`${summary.contractCount}명`} badgeClassName="icon-badge-amber" />
        <SummaryCard label="청구건수" value={`${summary.billedCount}건`} badgeClassName="icon-badge-pink" />
      </section>

      <section className="sketch-panel p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="section-doodle-title">부서별 근무현황</h2>
          </div>
          <p className="shrink-0 rounded-full border border-[#e7ddcd] bg-white/85 px-3 py-1.5 text-xs font-black text-slate-500 shadow-[0_10px_24px_rgba(16,34,61,0.04)]">
            {periodLabel}
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[#e7ddcd] bg-white/88">
          <table className="table-sticky w-full min-w-[1120px] table-fixed text-center text-xs">
            <colgroup>
              <col className="w-[14%]" />
              {columns.map((column) => (
                <Fragment key={column.key}>
                  <col className="w-[6.14%]" />
                  <col className="w-[6.14%]" />
                </Fragment>
              ))}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} className="px-3 py-3 text-left font-black !text-slate-500">부서</th>
                {columns.map((column) => (
                  <th key={column.key} colSpan={2} className="border-l border-[#e7ddcd] px-2 py-2 font-black !text-slate-500">
                    {column.label} {column.weekday}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map((column) => (
                  <Fragment key={column.key}>
                    <th key={`${column.key}-employee`} className="border-l border-[#e7ddcd] px-2 py-2 font-black !text-slate-500">정직원</th>
                    <th key={`${column.key}-contract`} className="px-2 py-2 font-black !text-slate-500">협력사</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[#e7ddcd] bg-[#fbf8f2]">
                <td className="px-3 py-3 text-left">
                  <span className="inline-flex rounded-xl bg-white px-2 py-1 font-black text-[#007050] shadow-[0_8px_18px_rgba(0, 112, 80,0.08)]">
                    합계
                  </span>
                </td>
                {columns.map((column) => {
                  const dateItems = allItems.filter((item) => item.work_date === column.key);
                  const employeeCount = dateItems.reduce((sum, item) => sum + item.worker_names.length, 0);
                  const contractorCount = dateItems.reduce((sum, item) => sum + contractCount(item), 0);
                  return (
                    <Fragment key={`summary-${column.key}`}>
                      <td className="border-l border-[#e7ddcd] px-1.5 py-2">
                        <span className={`flex h-9 w-full items-center justify-center rounded-xl text-xs font-black ${holidayCountCellClassName(employeeCount)}`}>
                          {employeeCount}
                        </span>
                      </td>
                      <td className="px-1.5 py-2">
                        <span className={`flex h-9 w-full items-center justify-center rounded-xl text-xs font-black ${holidayCountCellClassName(contractorCount, "contract")}`}>
                          {contractorCount}
                        </span>
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
              {departmentRows.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td colSpan={15} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    조회범위에 등록된 공휴일근무 데이터가 없습니다.
                  </td>
                </tr>
              ) : null}
              {departmentRows.map(({ department, items }) => {
                const periodItems = items.filter((item) => periodDateKeys.has(item.work_date));
                const openDepartmentDetail = () => {
                  if (periodItems.length > 0) {
                    setDetail({
                      departmentName: department.department_name,
                      periodLabel,
                      items: periodItems
                    });
                  }
                };

                return (
                  <tr key={department.id} className="border-t border-slate-100">
                    <td className="px-3 py-3 text-left">
                      <button
                        type="button"
                        onClick={openDepartmentDetail}
                        disabled={periodItems.length === 0}
                        className="max-w-full truncate rounded-xl px-2 py-1 text-left font-black text-[#012241] underline-offset-4 transition hover:bg-[#faf6ef] hover:text-[#007050] hover:underline disabled:cursor-default disabled:text-slate-500 disabled:no-underline"
                        title={periodItems.length > 0 ? "해당 부서의 기간 상세내역 보기" : "표시할 상세내역이 없습니다"}
                      >
                        {department.department_name}
                      </button>
                    </td>
                    {columns.map((column) => {
                      const dateItems = items.filter((item) => item.work_date === column.key);
                      const employeeCount = dateItems.reduce((sum, item) => sum + item.worker_names.length, 0);
                      const contractorCount = dateItems.reduce((sum, item) => sum + contractCount(item), 0);
                      return (
                        <Fragment key={`${department.id}-${column.key}`}>
                          <td className="border-l border-[#f4ede2] px-1.5 py-2">
                            <span className={`flex h-9 w-full items-center justify-center rounded-xl text-xs font-black ${holidayCountCellClassName(employeeCount)}`}>
                              {employeeCount}
                            </span>
                          </td>
                          <td className="px-1.5 py-2">
                            <span className={`flex h-9 w-full items-center justify-center rounded-xl text-xs font-black ${holidayCountCellClassName(contractorCount, "contract")}`}>
                              {contractorCount}
                            </span>
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {detail ? <HolidayDetailDialog detail={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

function SummaryCard({ label, value, badgeClassName }: { label: string; value: string; badgeClassName: string }) {
  return (
    <div className="kpi-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-black text-[#012241]">{value}</p>
        </div>
        <span className={`icon-badge ${badgeClassName}`}>
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function HolidayDetailDialog({ detail, onClose }: { detail: HolidayWorkDetail; onClose: () => void }) {
  const sortedItems = [...detail.items].sort((first, second) => {
    const dateCompare = first.work_date.localeCompare(second.work_date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return first.client_name.localeCompare(second.client_name);
  });

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#012241]/60 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="holiday-detail-title">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-[1.75rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(1,34,65,0.26)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#e7ddcd] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="icon-badge icon-badge-green" aria-hidden="true">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h2 id="holiday-detail-title" className="text-lg font-black text-[#012241]">
                공휴일근무 상세
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {detail.departmentName} · {detail.periodLabel}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="상세 팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto bg-white px-5 py-4">
          <div className="space-y-3">
            {sortedItems.map((item) => (
              <div key={item.id} className="rounded-[1.25rem] border border-[#e4dac9] bg-[#faf6ef] px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="section-chip">{item.work_date.replaceAll("-", ".")}</span>
                  <span className="section-chip">{item.client_name || "-"}</span>
                  <span className="section-chip">정직원 {item.worker_names.length}명</span>
                  <span className="section-chip">협력사 {contractCount(item)}명</span>
                  <span className="section-chip">{item.is_billed ? "청구" : "미청구"}</span>
                </div>
                <div className="grid gap-3 text-sm md:grid-cols-[180px_1fr]">
                  <div>
                    <p className="text-xs font-black text-slate-500">근무자</p>
                    <p className="mt-1 font-bold text-[#012241]">{item.worker_names.join(", ") || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-500">근무사유</p>
                    <p className="mt-1 whitespace-pre-wrap font-semibold leading-6 text-slate-700">{item.work_reason || "-"}</p>
                  </div>
                  {item.note ? (
                    <div className="md:col-span-2">
                      <p className="text-xs font-black text-slate-500">비고</p>
                      <p className="mt-1 whitespace-pre-wrap font-semibold leading-6 text-slate-700">{item.note}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
