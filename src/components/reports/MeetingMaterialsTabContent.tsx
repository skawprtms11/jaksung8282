"use client";

import { DepartmentCommonSearchToolbar } from "@/components/reports/DepartmentCommonSearchToolbar";
import { MeetingDepartmentVolumeBoard } from "@/components/reports/MeetingDepartmentVolumeBoard";
import { MeetingFacilityConstructionBoard } from "@/components/reports/MeetingFacilityConstructionBoard";
import { MeetingHolidayWorkBoard } from "@/components/reports/MeetingHolidayWorkBoard";
import { MeetingMaterialsTable } from "@/components/reports/MeetingMaterialsTable";
import { DepartmentOpenRequestBoard } from "@/components/reports/DepartmentOpenRequestBoard";
import { MemoStatusButton } from "@/components/reports/MemoStatusButton";
import { MeetingPriorityPanel } from "@/components/reports/MeetingPriorityPanel";
import { VolumeComparisonChart } from "@/components/charts/VolumeComparisonChart";
import { TableShell } from "@/components/common/TableShell";
import type { MeetingTabData } from "@/lib/reports/meeting-materials-tab-data";
import { cn } from "@/lib/utils/cn";
import { formatCompactDate } from "@/lib/utils/labels";
import type { DepartmentSubmissionStatus } from "@/types/enums";

function compactStatus(status: DepartmentSubmissionStatus | null) {
  if (!status) return { label: "미작성", className: "border-slate-200 bg-slate-50 text-slate-600" };
  if (status === "draft") return { label: "작성 중", className: "border-slate-200 bg-slate-50 text-slate-700" };
  if (status === "submitted_to_division") return { label: "검토", className: "border-blue-200 bg-blue-50 text-blue-700" };
  if (status === "division_approved") return { label: "승인", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return { label: "반려", className: "border-rose-200 bg-rose-50 text-rose-700" };
}

function CollectionContent({ data }: {
  data: Extract<MeetingTabData, { tab: "collection" }>;
}) {
  const total = data.departments.reduce((sum, department) => sum + (data.clientCounts[department.id] ?? 0), 0);
  const completed = data.departments.reduce((sum, department) => sum + (data.writtenClientCounts[department.id] ?? 0), 0);
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="grid w-full gap-3 xl:grid-cols-2">
      <MeetingPriorityPanel items={data.priorityItems} openRequests={data.openRequestItems} />
      <section className="sketch-panel p-3">
        <div className="mb-3 flex min-h-[54px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-[#012241]">부서별 작성 모니터링</p>
            <p className="text-xs font-bold text-slate-500">작성완료 여부를 빠르게 확인합니다.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-[#e7ddcd] bg-[#fbf8f2] px-2.5 py-1.5">
            <div className="w-24 shrink-0">
              <div className="mb-1 flex items-center justify-between gap-2"><span className="text-[10px] font-black text-slate-500">작성진행률</span><span className="text-[11px] font-black text-[#007050]">{rate}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-[#e6f1ec]"><span className="block h-full rounded-full bg-gradient-to-r from-[#2fae66] to-[#007050]" style={{ width: `${rate}%` }} /></div>
            </div>
            {[{ label: "총건수", value: total, tone: "text-[#012241]" }, { label: "완료건수", value: completed, tone: "text-[#007050]" }, { label: "완료율", value: `${rate}%`, tone: "text-emerald-600" }].map((item) => (
              <div key={item.label} className="min-w-[54px] rounded-xl bg-white px-1.5 py-1 text-center"><span className="block text-[10px] font-black text-slate-400">{item.label}</span><span className={cn("block text-xs font-black", item.tone)}>{item.value}</span></div>
            ))}
          </div>
        </div>
        <TableShell>
          <table className="table-sticky w-full table-fixed text-left text-[13px]">
            <colgroup><col className="w-[34%]" /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[18%]" /><col className="w-[18%]" /></colgroup>
            <thead><tr><th className="px-2 py-2.5">부서</th><th className="px-2 py-2.5">화주</th><th className="px-2 py-2.5">완료율</th><th className="px-2 py-2.5">상태</th><th className="px-2 py-2.5">확정일</th></tr></thead>
            <tbody>{data.departments.map((department) => {
              const totalClients = data.clientCounts[department.id] ?? 0;
              const writtenClients = data.writtenClientCounts[department.id] ?? 0;
              const completionRate = totalClients > 0 ? Math.round((writtenClients / totalClients) * 100) : 0;
              const submission = data.submissions.find((row) => row.department_id === department.id);
              const status = compactStatus(submission?.status ?? null);
              return <tr key={department.id} className="border-t border-slate-100">
                <td className="truncate px-2 py-1.5 text-[12px] font-black text-[#012241]">{department.department_name}</td>
                <td className="px-2 py-1.5"><span className="font-black text-[#007050]">{writtenClients}</span><span className="text-slate-400"> / {totalClients}</span></td>
                <td className={cn("px-2 py-1.5 font-black", completionRate === 100 ? "text-emerald-600" : "text-slate-600")}>{completionRate}%</td>
                <td className="px-2 py-1.5"><span className={cn("inline-flex rounded-full border px-2 py-0.5 font-black", status.className)}>{status.label}</span></td>
                <td className="truncate px-2 py-1.5">{formatCompactDate(submission?.finalized_at)}</td>
              </tr>;
            })}</tbody>
          </table>
        </TableShell>
      </section>
    </div>
  );
}

function VolumesContent({ data }: { data: Extract<MeetingTabData, { tab: "volumes" }> }) {
  const rows = [1, 2, 3, 4, 5].map((week) => data.chartRows.find((row) => row.name === `${week}주차`) ?? { name: `${week}주차`, inbound: 0, outbound: 0, total: 0 });
  const total = rows.reduce((sum, row) => ({ inbound: sum.inbound + row.inbound, outbound: sum.outbound + row.outbound, total: sum.total + row.total }), { inbound: 0, outbound: 0, total: 0 });
  return <div className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-[1fr_460px]">
      <VolumeComparisonChart rows={data.chartRows} />
      <section className="sketch-panel p-4"><h2 className="section-doodle-title mb-3">물동량 요약</h2><TableShell>
        <table className="table-sticky w-full min-w-[420px] table-fixed text-left text-xs"><thead><tr><th className="px-3 py-2.5">주차</th><th className="px-2 py-2.5 text-right">입고</th><th className="px-2 py-2.5 text-right">출고</th><th className="px-3 py-2.5 text-right">합계</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.name} className="border-t border-slate-100"><td className="px-3 py-2 font-black text-[#012241]">{row.name}</td><td className="px-2 py-2 text-right font-bold">{row.inbound.toLocaleString("ko-KR")}</td><td className="px-2 py-2 text-right font-bold">{row.outbound.toLocaleString("ko-KR")}</td><td className="px-3 py-2 text-right font-black text-[#012241]">{row.total.toLocaleString("ko-KR")}</td></tr>)}
            <tr className="border-t border-[#ddd2bf] bg-[#faf6ef]"><td className="px-3 py-2.5 font-black">합계</td><td className="px-2 py-2.5 text-right font-black text-emerald-700">{total.inbound.toLocaleString("ko-KR")}</td><td className="px-2 py-2.5 text-right font-black text-blue-700">{total.outbound.toLocaleString("ko-KR")}</td><td className="px-3 py-2.5 text-right font-black">{total.total.toLocaleString("ko-KR")}</td></tr>
          </tbody></table>
      </TableShell></section>
    </div>
    <MeetingDepartmentVolumeBoard rows={data.departmentRows} />
  </div>;
}

export function MeetingMaterialsTabContent({ data, currentUserId, canManageAllRequests, onDataChanged }: {
  data: MeetingTabData;
  currentUserId: string;
  canManageAllRequests: boolean;
  onDataChanged?: () => void;
}) {
  if (data.tab === "collection") return <CollectionContent data={data} />;
  if (data.tab === "materials") return <div className="space-y-2">
    <div className="flex items-stretch gap-2">
      {canManageAllRequests ? <MemoStatusButton weekStartDate={data.weekStartDate} canView={canManageAllRequests} /> : null}
      <div className="min-w-0 flex-1 rounded-md border border-[#e7ddcd] bg-white/90 px-2 py-0.5 shadow-[0_10px_26px_rgba(16,34,61,0.05)]">
        <DepartmentCommonSearchToolbar key={Object.values(data.filters).join("|")} categories={data.workCategories} filters={data.filters} resultCount={data.reports.length} detailsId="meeting-materials-detailed-search" unifiedDataSearch showQuickReset inlineQuickSearch />
      </div>
    </div>
    <DepartmentOpenRequestBoard
      requests={data.confirmationRequestItems}
      currentUserId={currentUserId}
      canManageAllRequests={canManageAllRequests}
      title="확인요청현황"
      emptyMessage="진행 중인 확인요청이 없습니다."
      onDataChanged={onDataChanged}
      compact
    />
    {data.allDepartments ? (
      <section className="sketch-panel flex min-h-44 items-center justify-center p-6 text-center">
        <p className="text-sm font-black text-slate-500">부서를 선택하면 회의자료가 표시됩니다.</p>
      </section>
    ) : (
      <MeetingMaterialsTable reports={data.reports} reportAuthorNames={data.reportAuthorNames} currentUserId={currentUserId} canManageAllRequests={canManageAllRequests} emptyTitle={data.hasSearchFilters ? "검색 조건에 맞는 회의자료가 없습니다." : "선택한 주차의 회의자료가 없습니다."} onDataChanged={onDataChanged} />
    )}
  </div>;
  if (data.tab === "volumes") return <VolumesContent data={data} />;
  if (data.tab === "holiday") return <MeetingHolidayWorkBoard departments={data.departments} submissions={data.submissions} selectedWeek={data.selectedWeek} />;
  return <MeetingFacilityConstructionBoard departments={data.departments} submissions={data.submissions} />;
}
