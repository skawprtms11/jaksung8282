"use client";

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

export type VolumeAnalysisChartPoint = {
  label: string;
  inbound: number;
  outbound: number;
  all: number;
};

export type VolumeAnalysisChartSeries = {
  key: "all" | "inbound" | "outbound";
  label: string;
  color: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
}

// recharts 를 화주자료 청크에서 떼어내 누적 물동량 그래프가 보일 때만 받게 한다.
export function VolumeAnalysisChart({
  data,
  series
}: {
  data: VolumeAnalysisChartPoint[];
  series: VolumeAnalysisChartSeries[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data} margin={{ top: 10, right: 18, bottom: 6, left: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#ece3d4" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={16} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(value: number) => formatNumber(value)} width={58} />
        <Tooltip
          formatter={(value) => (typeof value === "number" ? formatNumber(value) : String(value ?? "-"))}
          labelFormatter={(label) => `${label}`}
        />
        <Legend />
        {series.map((item) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
