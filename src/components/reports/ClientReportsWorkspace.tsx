"use client";

import { useCallback, useMemo, useState } from "react";
import { ClientReportEditor, type ClientReportEditorInitialReport } from "@/components/reports/ClientReportEditor";
import { ClientReportsTable, type ClientReportTableRow } from "@/components/reports/ClientReportsTable";
import { ClientReportsToolbar } from "@/components/reports/ClientReportsToolbar";
import { EmptyState } from "@/components/common/EmptyState";
import type { SavedClientReportRow } from "@/actions/reports";
import type { ClientReportSearchFilters } from "@/lib/reports/client-report-search";
import type { ItemPeriod } from "@/types/enums";

type Department = { id: string; department_name: string };
type Client = { id: string; client_name: string; department_id: string };
type Category = { id: string; category_name: string; icon_key: string };

function isEditableReportStatus(status?: ClientReportTableRow["status"] | null) {
  return status === "draft" || status === "rejected";
}

export function ClientReportsWorkspace({
  departments,
  clients,
  categories,
  defaultDepartmentId,
  defaultClientId,
  selectedWeekStartDate,
  searchFilters,
  hasSearchFilters,
  editorReport,
  reports
}: {
  departments: Department[];
  clients: Client[];
  categories: Category[];
  defaultDepartmentId?: string | null;
  defaultClientId?: string | null;
  selectedWeekStartDate: string;
  searchFilters: ClientReportSearchFilters;
  hasSearchFilters: boolean;
  editorReport?: ClientReportTableRow | null;
  reports: ClientReportTableRow[];
}) {
  const [editingReport, setEditingReport] = useState<ClientReportEditorInitialReport | null>(null);
  const [activeDialog, setActiveDialog] = useState<ItemPeriod | "volumes" | null>(null);
  const [localReports, setLocalReports] = useState<ClientReportTableRow[]>(reports);
  const selectedReport = useMemo(
    () =>
      editingReport
        ? localReports.find((report) => report.id === editingReport.id) ?? null
        : defaultClientId
          ? localReports.find(
              (report) => report.clientId === defaultClientId && report.weekStartDate === selectedWeekStartDate
            ) ?? editorReport ?? null
          : null,
    [defaultClientId, editingReport, editorReport, localReports, selectedWeekStartDate]
  );
  const canContinueSelectedReport = !editingReport && isEditableReportStatus(selectedReport?.status);
  const editorInitialReport = editingReport ?? (canContinueSelectedReport ? selectedReport?.editReport ?? null : null);
  const autoSaveExistingReport = Boolean(canContinueSelectedReport && editorInitialReport);

  const clearEditMode = useCallback(() => {
    setEditingReport(null);
    setActiveDialog(null);
  }, []);

  const handleSaved = useCallback((report?: SavedClientReportRow) => {
    if (report) {
      setLocalReports((current) => {
        const nextReport = report as ClientReportTableRow;
        return current.some((row) => row.id === nextReport.id)
          ? current.map((row) => (row.id === nextReport.id ? nextReport : row))
          : [nextReport, ...current];
      });
    }
    clearEditMode();
  }, [clearEditMode]);

  const openEditDialog = useCallback((report: ClientReportEditorInitialReport, period: ItemPeriod) => {
    setEditingReport(report);
    setActiveDialog(period);
  }, []);

  const handleReportStatusChange = useCallback((reportIds: string[], status: ClientReportTableRow["status"], submittedAt: string | null) => {
    const reportIdSet = new Set(reportIds);
    setLocalReports((current) =>
      current.map((report) => (reportIdSet.has(report.id) ? { ...report, status, submittedAt } : report))
    );
  }, []);

  return (
    <>
      <ClientReportsToolbar
        categories={categories}
        selectedWeekStartDate={selectedWeekStartDate}
        filters={searchFilters}
        resultCount={localReports.length}
      />
      <ClientReportEditor
        key={editorInitialReport?.id ?? `${defaultDepartmentId ?? "department"}-${defaultClientId ?? "client"}-${selectedWeekStartDate}`}
        departments={departments}
        clients={clients}
        categories={categories}
        defaultDepartmentId={editorInitialReport?.department_id ?? defaultDepartmentId}
        defaultClientId={editorInitialReport?.client_id ?? defaultClientId}
        selectedWeekStartDate={selectedWeekStartDate}
        initialReport={editorInitialReport}
        autoSaveExistingReport={autoSaveExistingReport}
        currentReportStatus={selectedReport?.status ?? null}
        initialDialog={activeDialog}
        onSaved={handleSaved}
        onEditDialogClosed={() => setActiveDialog(null)}
      />
      {localReports.length === 0 ? (
        <EmptyState title={hasSearchFilters ? "검색 조건에 맞는 화주자료가 없습니다." : "선택한 주차의 화주별 자료가 없습니다."} />
      ) : (
        <ClientReportsTable
          reports={localReports}
          activeEditingReportId={editingReport?.id ?? null}
          onCancelEdit={clearEditMode}
          onOpenEditDialog={openEditDialog}
          onReportStatusChange={handleReportStatusChange}
          hideVolumes={hasSearchFilters}
        />
      )}
    </>
  );
}
