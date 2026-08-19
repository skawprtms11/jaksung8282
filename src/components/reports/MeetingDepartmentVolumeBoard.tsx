"use client";

import { useState } from "react";
import { TableShell } from "@/components/common/TableShell";

type VolumeDisplayMode = "inbound" | "outbound" | "total";

export type MeetingDepartmentVolumeValue = {
  inbound: number;
  outbound: number;
  total: number;
};

export type MeetingDepartmentVolumeRow = {
  departmentId: string;
  departmentName: string;
  weeks: MeetingDepartmentVolumeValue[];
  totals: MeetingDepartmentVolumeValue;
  previousTotals: MeetingDepartmentVolumeValue;
};

const displayModes: { value: VolumeDisplayMode; label: string }[] = [
  { value: "inbound", label: "입고" },
  { value: "outbound", label: "출고" },
  { value: "total", label: "합계" }
];

function formatQuantity(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatChange(current: number, previous: number) {
  const difference = current - previous;
  const rate = previous === 0 ? (current === 0 ? 0 : 100) : Math.round((difference / previous) * 100);
  const differencePrefix = difference > 0 ? "+" : "";
  const ratePrefix = rate > 0 ? "+" : "";
  return `전월대비 ${differencePrefix}${formatQuantity(difference)} · ${ratePrefix}${rate}%`;
}

export function MeetingDepartmentVolumeBoard({ rows }: { rows: MeetingDepartmentVolumeRow[] }) {
  const [selectedMode, setSelectedMode] = useState<VolumeDisplayMode>("total");

  return (
    <section className="sketch-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-doodle-title">부서별 현황</h2>
        <fieldset className="flex flex-wrap gap-2" aria-label="부서별 물동량 표시 기준">
          {displayModes.map((mode) => (
            <label
              key={mode.value}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#e4dac9] bg-white/90 px-3 py-1.5 text-xs font-black text-[#012241] shadow-[0_8px_18px_rgba(16,34,61,0.05)]"
            >
              <input
                type="checkbox"
                checked={selectedMode === mode.value}
                onChange={() => setSelectedMode(mode.value)}
                aria-label={`${mode.label} 부서별 물동량 표시`}
              />
              {mode.label}
            </label>
          ))}
        </fieldset>
      </div>

      <TableShell>
        <table className="table-sticky w-full min-w-[820px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[23%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-3 py-2.5">부서</th>
              {[1, 2, 3, 4, 5].map((week) => (
                <th key={week} className="px-2 py-2.5 text-right">{week}주차</th>
              ))}
              <th className="px-3 py-2.5 text-right">합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm font-bold text-slate-500">
                  표시할 부서별 물동량 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.departmentId} className="border-t border-slate-100">
                  <td className="truncate px-3 py-3 font-black text-[#012241]" title={row.departmentName}>
                    {row.departmentName}
                  </td>
                  {[0, 1, 2, 3, 4].map((weekIndex) => (
                    <td key={weekIndex} className="px-2 py-3 text-right font-black text-[#012241]">
                      {formatQuantity(row.weeks[weekIndex]?.[selectedMode] ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <p className="text-sm font-black text-[#012241]">{formatQuantity(row.totals[selectedMode])}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                      {formatChange(row.totals[selectedMode], row.previousTotals[selectedMode])}
                    </p>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableShell>
    </section>
  );
}
