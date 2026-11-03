"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type VacancyTrendChartPoint = {
  label: string;
  simple_storage_area: number;
  vacancy_area: number;
};

function formatArea(value: number) {
  return Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

// recharts 를 부서자료 편집기 청크에서 떼어내 공실현황 그래프가 보일 때만 받게 한다.
export function DepartmentVacancyTrendChart({
  data,
  showSimpleStorage,
  showVacancy
}: {
  data: VacancyTrendChartPoint[];
  showSimpleStorage: boolean;
  showVacancy: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 30, right: 18, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#e7ddcd" strokeDasharray="4 4" />
        <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={58} />
        <Tooltip
          formatter={(value, name) => [formatArea(Number(value)), name === "simple_storage_area" ? "단순보관" : "공실면적"]}
          labelFormatter={(label) => `${label} 월평균`}
          contentStyle={{ borderRadius: 16, border: "1px solid #e7ddcd", fontWeight: 800 }}
        />
        {showSimpleStorage ? (
          <Line type="monotone" dataKey="simple_storage_area" name="단순보관" stroke="#2fae66" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
        ) : null}
        {showVacancy ? (
          <Line type="monotone" dataKey="vacancy_area" name="공실면적" stroke="#f97316" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}
