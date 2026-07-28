"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { VolumeType, VolumeUnit } from "@/types/enums";

export type VolumeAnalysisHistoricalVolume = {
  client_id: string;
  week_start_date: string;
  volume_type: VolumeType;
  quantity: number;
  unit: VolumeUnit;
};

export type VolumeAnalysisDraftVolume = {
  volume_type: VolumeType;
  quantity: number;
  unit: VolumeUnit;
};

type VolumeSeriesKey = "all" | "inbound" | "outbound";
type VolumeChartPoint = {
  label: string;
  inbound: number;
  outbound: number;
  all: number;
};
type VolumeTableRow = {
  label: string;
  average: number;
  current: number;
  change: number;
  changeRate: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
}

function formatChangeRate(current: number, base: number) {
  if (base === 0) {
    return current > 0 ? "신규" : "0%";
  }

  return `${formatNumber(((current - base) / base) * 100)}%`;
}

function makeWeekLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}.${day}`;
}

function buildVolumeAnalysis(
  historicalVolumes: VolumeAnalysisHistoricalVolume[],
  draftVolumes: VolumeAnalysisDraftVolume[],
  clientId: string
): { chartData: VolumeChartPoint[]; rows: VolumeTableRow[] } {
  const weeklyMap = new Map<string, { inbound: number; outbound: number }>();

  historicalVolumes
    .filter((volume) => volume.client_id === clientId)
    .forEach((volume) => {
      if (volume.volume_type !== "inbound" && volume.volume_type !== "outbound") {
        return;
      }

      const current = weeklyMap.get(volume.week_start_date) ?? { inbound: 0, outbound: 0 };
      current[volume.volume_type] += volume.quantity;
      weeklyMap.set(volume.week_start_date, current);
    });

  const sortedHistorical = Array.from(weeklyMap.entries()).sort(([left], [right]) => left.localeCompare(right));
  const currentInbound = draftVolumes
    .filter((volume) => volume.volume_type === "inbound")
    .reduce((sum, volume) => sum + volume.quantity, 0);
  const currentOutbound = draftVolumes
    .filter((volume) => volume.volume_type === "outbound")
    .reduce((sum, volume) => sum + volume.quantity, 0);

  let inboundCumulative = 0;
  let outboundCumulative = 0;
  const chartData = sortedHistorical.map(([weekStartDate, value]) => {
    inboundCumulative += value.inbound;
    outboundCumulative += value.outbound;

    return {
      label: makeWeekLabel(weekStartDate),
      inbound: inboundCumulative,
      outbound: outboundCumulative,
      all: inboundCumulative + outboundCumulative
    };
  });

  if (currentInbound > 0 || currentOutbound > 0) {
    chartData.push({
      label: "작성자료",
      inbound: inboundCumulative + currentInbound,
      outbound: outboundCumulative + currentOutbound,
      all: inboundCumulative + outboundCumulative + currentInbound + currentOutbound
    });
  }

  const weekCount = Math.max(sortedHistorical.length, 1);
  const historicalInboundAverage =
    sortedHistorical.reduce((sum, [, value]) => sum + value.inbound, 0) / weekCount;
  const historicalOutboundAverage =
    sortedHistorical.reduce((sum, [, value]) => sum + value.outbound, 0) / weekCount;
  const currentTotal = currentInbound + currentOutbound;
  const averageTotal = historicalInboundAverage + historicalOutboundAverage;

  return {
    chartData,
    rows: [
      {
        label: "입고",
        average: historicalInboundAverage,
        current: currentInbound,
        change: currentInbound - historicalInboundAverage,
        changeRate: formatChangeRate(currentInbound, historicalInboundAverage)
      },
      {
        label: "출고",
        average: historicalOutboundAverage,
        current: currentOutbound,
        change: currentOutbound - historicalOutboundAverage,
        changeRate: formatChangeRate(currentOutbound, historicalOutboundAverage)
      },
      {
        label: "합계",
        average: averageTotal,
        current: currentTotal,
        change: currentTotal - averageTotal,
        changeRate: formatChangeRate(currentTotal, averageTotal)
      }
    ]
  };
}

export function VolumeAnalysisPanel({
  historicalVolumes,
  volumes,
  clientId,
  className = "sketch-panel p-4"
}: {
  historicalVolumes: VolumeAnalysisHistoricalVolume[];
  volumes: VolumeAnalysisDraftVolume[];
  clientId: string;
  className?: string;
}) {
  const [visibleSeries, setVisibleSeries] = useState<Record<VolumeSeriesKey, boolean>>({
    all: true,
    inbound: true,
    outbound: true
  });
  const volumeAnalysis = useMemo(
    () => buildVolumeAnalysis(historicalVolumes, volumes, clientId),
    [clientId, historicalVolumes, volumes]
  );
  const seriesOptions: { key: VolumeSeriesKey; label: string; color: string }[] = [
    { key: "all", label: "전체", color: "#075be8" },
    { key: "inbound", label: "입고", color: "#0f766e" },
    { key: "outbound", label: "출고", color: "#f59e0b" }
  ];

  return (
    <section className={className}>
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="glass-fieldset min-w-0 p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
              <div>
                <h2 className="section-doodle-title">최근 1년 누적 물동량</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">입고와 출고 수량을 기준으로 누적 추이를 표시합니다.</p>
              </div>
            </div>
            <fieldset className="flex flex-wrap gap-2" aria-label="그래프 표시 항목">
              {seriesOptions.map((series) => (
                <label key={series.key} className="inline-flex items-center gap-1.5 rounded-full border border-[#d9e4f2] bg-white/90 px-3 py-1.5 text-xs font-black text-[#10223d] shadow-[0_8px_18px_rgba(16,34,61,0.05)]">
                  <input
                    type="checkbox"
                    checked={visibleSeries[series.key]}
                    onChange={() =>
                      setVisibleSeries((current) => ({
                        ...current,
                        [series.key]: !current[series.key]
                      }))
                    }
                    aria-label={`${series.label} 그래프 표시`}
                  />
                  {series.label}
                </label>
              ))}
            </fieldset>
          </div>
          <div className="h-40 rounded-2xl border border-[#d9e4f2] bg-white/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] md:h-44">
            {volumeAnalysis.chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                최근 1년 물동량 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={volumeAnalysis.chartData} margin={{ top: 10, right: 18, bottom: 6, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={16} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value: number) => formatNumber(value)} width={58} />
                  <Tooltip
                    formatter={(value) => (typeof value === "number" ? formatNumber(value) : String(value ?? "-"))}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Legend />
                  {seriesOptions.map((series) =>
                    visibleSeries[series.key] ? (
                      <Line
                        key={series.key}
                        type="monotone"
                        dataKey={series.key}
                        name={series.label}
                        stroke={series.color}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                    ) : null
                  )}
                </RechartsLineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="glass-fieldset p-4">
          <h2 className="section-doodle-title">물동량 비교표</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[#d9e4f2] bg-white/90">
            <table className="min-w-[390px] w-full text-left text-sm">
              <thead className="bg-[#f5f9ff] text-xs font-black text-[#10223d]">
                <tr>
                  <th className="px-3 py-3">구분</th>
                  <th className="px-3 py-3 text-right">1년평균</th>
                  <th className="px-3 py-3 text-right">금주</th>
                  <th className="px-3 py-3 text-right">증감</th>
                  <th className="px-3 py-3 text-right">증감율</th>
                </tr>
              </thead>
              <tbody>
                {volumeAnalysis.rows.map((row) => (
                  <tr key={row.label} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-black text-slate-800">{row.label}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatNumber(row.average)}</td>
                    <td className="px-3 py-3 text-right font-black text-slate-900">{formatNumber(row.current)}</td>
                    <td className={`px-3 py-3 text-right font-black ${row.change >= 0 ? "text-[#0f766e]" : "text-rose-600"}`}>
                      {row.change >= 0 ? "+" : ""}
                      {formatNumber(row.change)}
                    </td>
                    <td className={`px-3 py-3 text-right font-black ${row.change >= 0 ? "text-[#0f766e]" : "text-rose-600"}`}>
                      {row.changeRate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
