"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type VolumeChartRow = {
  name: string;
  current: number;
  previous: number;
  changeLabel: string;
};

export function VolumeComparisonChart({ rows }: { rows: VolumeChartRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-[1.25rem] border border-dashed border-[#b9cce4] bg-white/82 text-sm font-semibold text-slate-500 shadow-[0_18px_42px_rgba(16,34,61,0.07)] backdrop-blur-xl">
        선택한 조건의 물동량 데이터가 없습니다.
      </div>
    );
  }
  return (
    <div className="sketch-panel h-72 p-4" role="img" aria-label="화주별 금주와 전주 물동량 비교 그래프">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value, name) => [value, name === "current" ? "금주" : "전주"]} labelFormatter={(label) => `${label}`} />
          <Bar dataKey="previous" name="전주" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="current" name="금주" fill="#075be8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
        {rows.map((row) => (
          <span key={row.name} className="section-chip">
            {row.name}: {row.changeLabel}
          </span>
        ))}
      </div>
    </div>
  );
}
