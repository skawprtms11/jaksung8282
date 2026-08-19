"use client";

import { useMemo, useState } from "react";
import { Hammer } from "lucide-react";

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

type FacilityConstructionStatus = "planned" | "in_progress" | "completed";

type FacilityConstructionItem = {
  id: string;
  start_date: string;
  completion_date: string;
  construction_name: string;
  construction_content: string;
  contractor: string;
  construction_amount: string;
  status: FacilityConstructionStatus;
  note: string;
};

type FacilityConstructionRow = FacilityConstructionItem & {
  department_name: string;
};

const FACILITY_CONTENT_FORMAT = "department-facility-constructions/v1";

const facilityStatusOptions: { value: FacilityConstructionStatus; label: string }[] = [
  { value: "planned", label: "예정" },
  { value: "in_progress", label: "진행" },
  { value: "completed", label: "완료" }
];

const facilityStatusDotClassNames: Record<FacilityConstructionStatus, string> = {
  planned: "u-dot-amber",
  in_progress: "u-dot-blue",
  completed: "u-dot-green"
};

function normalizeFacilityStatus(value: unknown): FacilityConstructionStatus {
  return facilityStatusOptions.some((option) => option.value === value) ? (value as FacilityConstructionStatus) : "planned";
}

function parseFacilityConstructionItems(value: string): FacilityConstructionItem[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue) as {
      format?: string;
      items?: Array<Partial<FacilityConstructionItem>>;
    };
    if (parsed.format === FACILITY_CONTENT_FORMAT && Array.isArray(parsed.items)) {
      return parsed.items.map((item, index) => ({
        id: typeof item.id === "string" && item.id ? item.id : `${item.start_date ?? "facility"}-${index}`,
        start_date: String(item.start_date ?? ""),
        completion_date: String(item.completion_date ?? ""),
        construction_name: String(item.construction_name ?? ""),
        construction_content: String(item.construction_content ?? ""),
        contractor: String(item.contractor ?? ""),
        construction_amount: String(item.construction_amount ?? ""),
        status: normalizeFacilityStatus(item.status),
        note: String(item.note ?? "")
      }));
    }
  } catch {
    return [];
  }

  return [];
}

function getFacilityRows(departments: DepartmentRow[], submissions: SubmissionRow[]): FacilityConstructionRow[] {
  return departments
    .flatMap((department) => {
      const submission = submissions.find((row) => row.department_id === department.id);
      const content = submission?.department_weekly_contents.find((row) => row.section_type === "facility");
      return parseFacilityConstructionItems(content?.current_week_content ?? "").map((item) => ({
        ...item,
        department_name: department.department_name
      }));
    })
    .sort((left, right) => {
      const dateCompare = left.start_date.localeCompare(right.start_date);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return left.department_name.localeCompare(right.department_name, "ko");
    });
}

export function MeetingFacilityConstructionBoard({
  departments,
  submissions
}: {
  departments: DepartmentRow[];
  submissions: SubmissionRow[];
}) {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<FacilityConstructionStatus[]>(["planned", "in_progress", "completed"]);
  const rows = useMemo(() => getFacilityRows(departments, submissions), [departments, submissions]);
  const allStatusesSelected = selectedStatuses.length === facilityStatusOptions.length;
  const normalizedKeyword = searchKeyword.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    const matchesStatus = selectedStatuses.includes(row.status);
    const matchesKeyword =
      !normalizedKeyword ||
      row.construction_name.toLowerCase().includes(normalizedKeyword) ||
      row.construction_content.toLowerCase().includes(normalizedKeyword) ||
      row.contractor.toLowerCase().includes(normalizedKeyword);
    return matchesStatus && matchesKeyword;
  });
  const toggleStatus = (status: FacilityConstructionStatus) => {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status]
    );
  };

  return (
    <section className="sketch-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#e6f1ec] text-[#007050]">
            <Hammer className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="section-doodle-title">시설공사</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">부서별 시설공사 진행 내역을 조회합니다.</p>
          </div>
        </div>
        <span className="section-chip">총 {filteredRows.length}건</span>
      </div>

      <div className="rounded-2xl border border-[#e7ddcd] bg-white/88 shadow-[0_14px_32px_rgba(16,34,61,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ece3d4] px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="section-chip cursor-pointer">
              <input
                type="checkbox"
                checked={allStatusesSelected}
                onChange={() => setSelectedStatuses(allStatusesSelected ? [] : facilityStatusOptions.map((option) => option.value))}
                className="h-4 w-4 accent-[#007050]"
              />
              전체
            </label>
            {facilityStatusOptions.map((option) => (
              <label key={option.value} className="section-chip cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(option.value)}
                  onChange={() => toggleStatus(option.value)}
                  className="h-4 w-4 accent-[#007050]"
                />
                {option.label}
              </label>
            ))}
          </div>
          <label className="w-full max-w-[320px] text-xs font-black text-slate-500">
            검색
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              className="mt-1 h-10 w-full rounded-full border border-[#e4dac9] bg-[#faf6ef] px-4 text-sm font-bold text-[#012241] outline-none"
              placeholder="공사명, 공사내용, 진행업체"
            />
          </label>
        </div>

        <div className="overflow-x-hidden">
          <table className="table-sticky w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[21%]" />
              <col className="w-[16%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-2 py-2.5 font-black !text-slate-500">부서</th>
                <th className="px-2 py-2.5 font-black !text-slate-500">시작일</th>
                <th className="px-2 py-2.5 font-black !text-slate-500">완료일</th>
                <th className="px-2 py-2.5 font-black !text-slate-500">공사명(전자결제 제목)</th>
                <th className="px-2 py-2.5 font-black !text-slate-500">공사내용</th>
                <th className="px-2 py-2.5 font-black !text-slate-500">진행업체</th>
                <th className="px-2 py-2.5 font-black !text-slate-500">공사금액</th>
                <th className="px-2 py-2.5 font-black !text-slate-500">상태</th>
                <th className="px-2 py-2.5 font-black !text-slate-500">비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    등록된 시설공사 내역이 없습니다.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    선택한 조건의 시설공사 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={`${row.department_name}-${row.id}`} className="border-t border-slate-100 align-top">
                    <td className="break-words px-2 py-2.5 font-black text-[#012241]">{row.department_name}</td>
                    <td className="break-words px-2 py-2.5">{row.start_date || "-"}</td>
                    <td className="break-words px-2 py-2.5">{row.completion_date || "-"}</td>
                    <td className="break-words px-2 py-2.5 font-black leading-5 text-[#012241]">{row.construction_name || "-"}</td>
                    <td className="whitespace-pre-wrap break-words px-2 py-2.5 leading-5 text-slate-600">{row.construction_content || "-"}</td>
                    <td className="break-words px-2 py-2.5">{row.contractor || "-"}</td>
                    <td className="break-words px-2 py-2.5">{row.construction_amount || "-"}</td>
                    <td className="px-1.5 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-[#012241]">
                        <span className={`u-dot ${facilityStatusDotClassNames[row.status]}`} aria-hidden="true" />
                        {facilityStatusOptions.find((option) => option.value === row.status)?.label ?? "예정"}
                      </span>
                    </td>
                    <td className="whitespace-pre-wrap break-words px-2 py-2.5 leading-5 text-slate-600">{row.note || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
