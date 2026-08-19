"use client";

import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2 } from "lucide-react";
import { TableShell } from "@/components/common/TableShell";
import { cn } from "@/lib/utils/cn";
import { volumeUnitLabels } from "@/lib/utils/labels";
import type { VolumeType, VolumeUnit } from "@/types/enums";

type DepartmentVolumeClient = {
  id: string;
  client_name: string;
};

type DepartmentVolumeItem = {
  volume_type: VolumeType;
  quantity: number;
  unit: VolumeUnit;
  note: string | null;
};

export type DepartmentVolumeReport = {
  id: string;
  client_id: string;
  week_of_month: number;
  clients: { client_name: string } | null;
  weekly_volumes: DepartmentVolumeItem[];
};

type VolumeDisplayMode = "inbound" | "outbound" | "total";

const weekColumns = [1, 2, 3, 4, 5] as const;
const displayModes: {
  value: VolumeDisplayMode;
  label: string;
  className: string;
  dotClassName: string;
}[] = [
  {
    value: "inbound",
    label: "입고",
    className: "text-emerald-700",
    dotClassName: "u-dot-green"
  },
  {
    value: "outbound",
    label: "출고",
    className: "text-blue-700",
    dotClassName: "u-dot-blue"
  },
  {
    value: "total",
    label: "합계",
    className: "text-[#007050]",
    dotClassName: "u-dot-green"
  }
];

function isVolumeIncluded(item: DepartmentVolumeItem, mode: VolumeDisplayMode) {
  if (mode === "total") {
    return item.volume_type === "inbound" || item.volume_type === "outbound";
  }
  return item.volume_type === mode;
}

function summarizeByUnit(items: DepartmentVolumeItem[], mode: VolumeDisplayMode) {
  const totals = items.reduce((map, item) => {
    if (!isVolumeIncluded(item, mode)) {
      return map;
    }
    map.set(item.unit, (map.get(item.unit) ?? 0) + Number(item.quantity));
    return map;
  }, new Map<VolumeUnit, number>());

  const summaries = Array.from(totals.entries())
    .filter(([, quantity]) => quantity > 0)
    .map(([unit, quantity]) => `${quantity.toLocaleString("ko-KR")}${volumeUnitLabels[unit]}`);

  return summaries.length > 0 ? summaries.join(" · ") : "-";
}

function collectNotes(reports: DepartmentVolumeReport[], mode: VolumeDisplayMode) {
  const noteSet = new Set<string>();
  reports.forEach((report) => {
    report.weekly_volumes.forEach((item) => {
      if (!item.note?.trim() || !isVolumeIncluded(item, mode)) {
        return;
      }
      const weekLabel = `${report.week_of_month}주차`;
      noteSet.add(`${weekLabel} - ${item.note.trim()}`);
    });
  });
  return Array.from(noteSet);
}

function VolumeCell({ items, mode }: { items: DepartmentVolumeItem[]; mode: VolumeDisplayMode }) {
  const value = summarizeByUnit(items, mode);
  if (value === "-") {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <span className="block min-w-0 truncate text-[11px] font-black text-[#012241]" title={value}>
      {value}
    </span>
  );
}

export function DepartmentVolumeBoard({ clients, reports }: { clients: DepartmentVolumeClient[]; reports: DepartmentVolumeReport[] }) {
  const [selectedMode, setSelectedMode] = useState<VolumeDisplayMode>("total");

  const reportsByClientWeek = useMemo(() => {
    const map = new Map<string, DepartmentVolumeReport[]>();
    reports.forEach((report) => {
      const key = `${report.client_id}:${report.week_of_month}`;
      const values = map.get(key) ?? [];
      values.push(report);
      map.set(key, values);
    });
    return map;
  }, [reports]);

  const reportsByClient = useMemo(() => {
    const map = new Map<string, DepartmentVolumeReport[]>();
    reports.forEach((report) => {
      const values = map.get(report.client_id) ?? [];
      values.push(report);
      map.set(report.client_id, values);
    });
    return map;
  }, [reports]);

  const allItems = useMemo(() => reports.flatMap((report) => report.weekly_volumes), [reports]);
  const completedClientCount = useMemo(() => {
    return clients.filter((client) => (reportsByClient.get(client.id) ?? []).some((report) => report.weekly_volumes.length > 0)).length;
  }, [clients, reportsByClient]);
  const completionRate = clients.length > 0 ? Math.round((completedClientCount / clients.length) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px]">
        <section className="kpi-card px-3 py-2">
          <div className="flex min-h-12 flex-wrap items-center gap-3 sm:flex-nowrap">
            <div className="flex w-full shrink-0 items-center gap-2 pr-4 sm:w-44 sm:pr-8">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#007050] text-white">
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <h2 className="text-sm font-black text-[#012241]">물동량 합계</h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-3 divide-x divide-[#ece3d4]">
            {displayModes.map((mode) => (
              <div key={mode.value} className="min-w-0 px-3 first:pl-1 last:pr-1">
                <p className={cn("inline-flex items-center gap-1.5 text-[10px] font-black", mode.className)}>
                  <span className={cn("u-dot", mode.dotClassName)} aria-hidden="true" />
                  {mode.label}
                </p>
                <p className="mt-0.5 truncate text-sm font-black text-[#012241]" title={summarizeByUnit(allItems, mode.value)}>
                  {summarizeByUnit(allItems, mode.value)}
                </p>
              </div>
            ))}
            </div>
          </div>
        </section>
        <section className="kpi-card flex min-h-16 flex-col justify-center px-3 py-2">
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black text-slate-500">등록 현황</p>
              <p className="mt-0.5 text-base font-black text-[#012241]">
                {completedClientCount}건<span className="text-xs text-slate-500">/{clients.length}건</span>
              </p>
            </div>
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-[#ddd2bf] bg-white px-2 text-[11px] font-black text-[#007050]">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              {completionRate}%
            </span>
          </div>
          <span className="mini-bar mt-2 block">
            <i style={{ width: `${completionRate}%` }} />
          </span>
        </section>
      </div>

      <section className="sketch-panel p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-doodle-title">주차별 물동량 현황</h2>
          <fieldset className="flex flex-wrap gap-2" aria-label="물동량 표시 기준">
            {displayModes.map((mode) => (
              <label
                key={mode.value}
                className="filter-pill cursor-pointer px-3 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedMode === mode.value}
                  onChange={() => setSelectedMode(mode.value)}
                  aria-label={`${mode.label} 물동량 표시`}
                />
                {mode.label}
              </label>
            ))}
          </fieldset>
        </div>
        <TableShell>
          <table className="table-sticky w-full table-fixed text-left text-[12px]">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[28%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-2 py-2.5 text-[11px] font-black tracking-[0.02em] text-slate-500!">화주</th>
                {weekColumns.map((week) => (
                  <th key={week} className="px-2 py-2.5 text-center text-[11px] font-black tracking-[0.02em] text-slate-500!">{week}주차</th>
                ))}
                <th className="px-2 py-2.5 text-center text-[11px] font-black tracking-[0.02em] text-slate-500!">합계</th>
                <th className="px-2 py-2.5 text-[11px] font-black tracking-[0.02em] text-slate-500!">비고</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm font-bold text-slate-500">
                    부서에 등록된 화주가 없습니다.
                  </td>
                </tr>
              ) : (
                clients.map((client) => {
                  const clientReports = reportsByClient.get(client.id) ?? [];
                  const notes = collectNotes(clientReports, selectedMode);
                  return (
                    <tr key={client.id} className="border-t border-[#eef2f6] align-top">
                      <td className="truncate px-2 py-2.5 font-black text-[#012241]" title={client.client_name}>
                        {client.client_name}
                      </td>
                      {weekColumns.map((week) => {
                        const weekItems = (reportsByClientWeek.get(`${client.id}:${week}`) ?? []).flatMap((report) => report.weekly_volumes);
                        return (
                          <td key={week} className="px-2 py-2.5 text-center">
                            <VolumeCell items={weekItems} mode={selectedMode} />
                          </td>
                        );
                      })}
                      <td className="px-2 py-2.5 text-center">
                        <VolumeCell items={clientReports.flatMap((report) => report.weekly_volumes)} mode={selectedMode} />
                      </td>
                      <td className="px-2 py-2.5 text-slate-600">
                        {notes.length > 0 ? (
                          <div className="space-y-1">
                            {notes.map((note) => (
                              <p key={note} className="break-words leading-5">{note}</p>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableShell>
      </section>
    </div>
  );
}
