"use client";

import { useState } from "react";
import { Building2, Search } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { TableShell } from "@/components/common/TableShell";
import {
  matchesNowMasterSearch,
  type CenterMasterViewRow,
  type ClientMasterViewRow
} from "@/lib/masters/now-master";

export function NowSourceNotice() {
  return (
    <p className="mb-4 rounded-[1.25rem] border border-[#e7ddcd] bg-white/82 px-4 py-3 text-sm font-semibold text-slate-600 shadow-[0_10px_26px_rgba(16,34,61,0.05)]">
      now(현황관리) 시스템이 원본이며 변경은 즉시 반영됩니다. 등록·수정은 현황관리에서 하세요.
    </p>
  );
}

function UsageBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700"
          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500"
      }
    >
      {isActive ? "사용" : "미사용"}
    </span>
  );
}

function ListFilter({
  query,
  onQueryChange,
  includeInactive,
  onIncludeInactiveChange,
  placeholder,
  shownCount,
  totalCount
}: {
  query: string;
  onQueryChange: (value: string) => void;
  includeInactive: boolean;
  onIncludeInactiveChange: (value: boolean) => void;
  placeholder: string;
  shownCount: number;
  totalCount: number;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-md border border-slate-300 bg-white px-3">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="sr-only">{placeholder}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(event) => onIncludeInactiveChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        미사용 포함
      </label>
      <span className="text-xs font-bold text-slate-500">
        {shownCount}/{totalCount}건
      </span>
    </div>
  );
}

export function NowClientMasterTable({ rows }: { rows: ClientMasterViewRow[] }) {
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const visibleRows = rows.filter(
    (row) =>
      (includeInactive || row.isActive) &&
      matchesNowMasterSearch(query, [row.clientCode, row.clientName, row.erpCode, row.laborCode, row.plCode, row.representativeClient])
  );

  return (
    <section>
      <ListFilter
        query={query}
        onQueryChange={setQuery}
        includeInactive={includeInactive}
        onIncludeInactiveChange={setIncludeInactive}
        placeholder="화주명·화주코드·ERP·노임·손익코드 검색"
        shownCount={visibleRows.length}
        totalCount={rows.length}
      />
      {visibleRows.length === 0 ? (
        <EmptyState title="표시할 화주가 없습니다." description="화주 등록·수정은 현황관리(now) 화주마스터에서 합니다." />
      ) : (
        <TableShell>
          <table className="table-sticky w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-3">화주코드</th>
                <th className="px-3 py-3">화주명</th>
                <th className="px-3 py-3">ERP코드</th>
                <th className="px-3 py-3">노임코드</th>
                <th className="px-3 py-3">손익코드</th>
                <th className="px-3 py-3">대표화주</th>
                <th className="px-3 py-3">사용여부</th>
                <th className="px-3 py-3">비고</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-semibold text-slate-600">{row.clientCode}</td>
                  <td className="px-3 py-3 font-black text-[#012241]">{row.clientName}</td>
                  <td className="px-3 py-3 text-slate-600">{row.erpCode}</td>
                  <td className="px-3 py-3 text-slate-600">{row.laborCode}</td>
                  <td className="px-3 py-3 text-slate-600">{row.plCode}</td>
                  <td className="px-3 py-3 text-slate-600">{row.representativeClient}</td>
                  <td className="px-3 py-3"><UsageBadge isActive={row.isActive} /></td>
                  <td className="px-3 py-3 text-slate-500">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </section>
  );
}

export function NowCenterMasterTable({ rows }: { rows: CenterMasterViewRow[] }) {
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const visibleRows = rows.filter(
    (row) => (includeInactive || row.isActive) && matchesNowMasterSearch(query, [row.centerName, row.address])
  );

  return (
    <section>
      <ListFilter
        query={query}
        onQueryChange={setQuery}
        includeInactive={includeInactive}
        onIncludeInactiveChange={setIncludeInactive}
        placeholder="센터명·주소 검색"
        shownCount={visibleRows.length}
        totalCount={rows.length}
      />
      {visibleRows.length === 0 ? (
        <EmptyState title="표시할 센터가 없습니다." description="센터 등록·수정은 현황관리(now) 센터마스터에서 합니다." />
      ) : (
        <TableShell>
          <table className="table-sticky w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-3">센터명</th>
                <th className="px-3 py-3">임대유형</th>
                <th className="px-3 py-3">건물유형</th>
                <th className="px-3 py-3">주소</th>
                <th className="px-3 py-3">사용여부</th>
                <th className="px-3 py-3">비고</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2 font-black text-[#012241]">
                      <Building2 className="h-4 w-4 text-[#007050]" aria-hidden="true" />
                      {row.centerName}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{row.leaseType}</td>
                  <td className="px-3 py-3 text-slate-600">{row.buildingType}</td>
                  <td className="px-3 py-3 text-slate-600">{row.address}</td>
                  <td className="px-3 py-3"><UsageBadge isActive={row.isActive} /></td>
                  <td className="px-3 py-3 text-slate-500">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </section>
  );
}
