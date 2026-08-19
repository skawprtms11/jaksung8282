"use client";

import { useActionState, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, CheckCircle2, RotateCcw } from "lucide-react";
import {
  cancelSubmittedClientReportsAction,
  submitSelectedClientReportsAction,
  type SavedClientReportRow
} from "@/actions/reports";
import { ActionMessage } from "@/components/common/ActionMessage";
import { ClientReportEditor } from "@/components/reports/ClientReportEditor";
import { WeekSelect } from "@/components/reports/WeekSelect";
import type { WeekOption } from "@/lib/dates/week";

type Client = { id: string; client_name: string; department_id: string };
type Category = { id: string; category_name: string; icon_key: string };

export function MobileClientReports({
  clients,
  categories,
  departmentId,
  selectedClientId,
  selectedWeekStartDate,
  selectedReport
}: {
  clients: Client[];
  categories: Category[];
  departmentId: string;
  selectedClientId: string;
  selectedWeekStartDate: string;
  selectedReport: SavedClientReportRow | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState(selectedReport);
  const [submitState, submitAction, isSubmitting] = useActionState(submitSelectedClientReportsAction, null);
  const [cancelState, cancelAction, isCancelling] = useActionState(cancelSubmittedClientReportsAction, null);
  const displayedReport = report
    ? cancelState?.ok
      ? { ...report, status: "draft" as const, submittedAt: null }
      : submitState?.ok
        ? { ...report, status: "submitted" as const, submittedAt: new Date().toISOString() }
        : report
    : null;

  function replaceScope(values: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", "client");
    Object.entries(values).forEach(([key, value]) => next.set(key, value));
    router.replace(`/mobile?${next.toString()}`, { scroll: false });
  }

  function changeWeek(week: WeekOption) {
    replaceScope({
      report_year: String(week.year),
      report_month: String(week.month),
      week_of_month: String(week.weekOfMonth),
      week_start_date: week.weekStartDate
    });
  }

  const scopeFilters = (
    <section className="border-b border-[#e7ddcd] bg-white px-3 py-3">
      <div className="flex items-end gap-2">
        <WeekSelect
          key={selectedWeekStartDate}
          defaultWeekStartDate={selectedWeekStartDate}
          compactWeekLabel
          onSelectionChange={changeWeek}
          className="grid min-w-0 flex-1 grid-cols-3 gap-1.5"
          labelClassName="min-w-0 text-sm font-black text-slate-500"
          weekLabelClassName="min-w-0 text-sm font-black text-slate-500"
          controlClassName="mt-1 h-10 w-full min-w-0 rounded-md border border-[#ddd2bf] bg-[#fbf8f2] px-1 !text-sm !font-black text-[#012241] outline-none"
        />
        {displayedReport?.status === "draft" || displayedReport?.status === "rejected" ? (
          <form action={submitAction} className="shrink-0">
            <input type="hidden" name="report_ids" value={displayedReport.id} />
            <button type="submit" disabled={isSubmitting} className="tool-button tool-button-primary h-10 px-3 text-xs disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{isSubmitting ? "확정 중" : "확정"}</button>
          </form>
        ) : displayedReport?.status === "submitted" ? (
          <form action={cancelAction} className="shrink-0">
            <input type="hidden" name="report_ids" value={displayedReport.id} />
            <button type="submit" disabled={isCancelling} className="tool-button h-10 px-2 text-[11px] text-[#007050] disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />{isCancelling ? "취소 중" : "확정취소"}</button>
          </form>
        ) : displayedReport?.status === "approved" ? (
          <span className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-black text-emerald-700"><BadgeCheck className="h-4 w-4" />승인완료</span>
        ) : (
          <button type="button" disabled className="tool-button h-10 shrink-0 px-3 text-xs opacity-45"><CheckCircle2 className="h-4 w-4" />확정</button>
        )}
      </div>
    </section>
  );

  if (!selectedClientId) {
    return <div className="space-y-3">{scopeFilters}<section className="border-y border-[#e7ddcd] bg-white px-4 py-10 text-center text-sm font-bold text-slate-500">선택한 부서에 관리 가능한 화주가 없습니다.</section></div>;
  }

  return (
    <div className="space-y-3">
      {scopeFilters}

      <ClientReportEditor
        key={`${selectedClientId}-${selectedWeekStartDate}-${displayedReport?.id ?? "new"}-${displayedReport?.status ?? "none"}`}
        departments={[{ id: departmentId, department_name: "소속부서" }]}
        clients={clients}
        categories={categories}
        defaultDepartmentId={departmentId}
        defaultClientId={selectedClientId}
        selectedWeekStartDate={selectedWeekStartDate}
        initialReport={displayedReport?.editReport ?? null}
        autoSaveExistingReport={Boolean(displayedReport && (displayedReport.status === "draft" || displayedReport.status === "rejected"))}
        currentReportStatus={displayedReport?.status ?? null}
        mobileMode
        onSaved={(saved) => saved && setReport(saved)}
      />

      <ActionMessage state={submitState} />
      <ActionMessage state={cancelState} />
    </div>
  );
}
