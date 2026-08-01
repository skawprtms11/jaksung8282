"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type VolumeSeriesKey = "inbound" | "outbound" | "total";

export type VolumeChartRow = {
  name: string;
  inbound: number;
  outbound: number;
  total: number;
};

const seriesOptions: { key: VolumeSeriesKey; label: string; stroke: string }[] = [
  { key: "inbound", label: "입고", stroke: "#059669" },
  { key: "outbound", label: "출고", stroke: "#2563eb" },
  { key: "total", label: "합계", stroke: "#10223d" }
];

export function VolumeComparisonChart({ rows }: { rows: VolumeChartRow[] }) {
  const [visibleSeries, setVisibleSeries] = useState<Record<VolumeSeriesKey, boolean>>({
    inbound: true,
    outbound: true,
    total: true
  });

  return (
    <section className="sketch-panel flex min-h-[320px] min-w-0 flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-doodle-title">물동량 추이</h2>
        <fieldset className="flex flex-wrap gap-2" aria-label="물동량 그래프 표시 기준">
          {seriesOptions.map((series) => (
            <label
              key={series.key}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#d9e4f2] bg-white/90 px-3 py-1.5 text-xs font-black text-[#10223d] shadow-[0_8px_18px_rgba(16,34,61,0.05)]"
            >
              <input
                type="checkbox"
                checked={visibleSeries[series.key]}
                onChange={() =>
                  setVisibleSeries((current) => ({
                    ...current,
                    [series.key]: !current[series.key]
                  }))
                }
                aria-label={`${series.label} 물동량 그래프 표시`}
              />
              {series.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div
        className="min-h-0 flex-1 rounded-xl border border-[#d9e4f2] bg-white/76 px-2 pb-1 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
        role="img"
        aria-label="주차별 입고, 출고, 합계 물동량 추이 그래프"
      >
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
            선택한 조건의 물동량 데이터가 없습니다.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 6, right: 16, bottom: 2, left: 4 }}>
              <CartesianGrid vertical={false} stroke="#dbe5f1" strokeDasharray="4 5" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={58}
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={(value) => Number(value).toLocaleString("ko-KR")}
              />
              <Tooltip
                formatter={(value, name) => [
                  Number(value ?? 0).toLocaleString("ko-KR"),
                  seriesOptions.find((series) => series.key === name)?.label ?? String(name)
                ]}
                labelFormatter={(label) => `${label}`}
                contentStyle={{
                  border: "1px solid #d9e4f2",
                  borderRadius: 8,
                  boxShadow: "0 12px 28px rgba(16,34,61,0.12)",
                  color: "#10223d",
                  fontSize: 12,
                  fontWeight: 700
                }}
              />
              {seriesOptions.map((series) =>
                visibleSeries[series.key] ? (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.key}
                    stroke={series.stroke}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#ffffff", stroke: series.stroke, strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: series.stroke, stroke: "#ffffff", strokeWidth: 2 }}
                  />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
