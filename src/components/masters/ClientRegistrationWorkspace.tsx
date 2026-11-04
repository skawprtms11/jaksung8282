"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CloudDownload, Loader2, Save, Search, UserRoundCheck, X } from "lucide-react";
import {
  importStaffFromNowAction,
  saveDepartmentClientAssignmentsAction,
  saveDepartmentOperatingClientsAction
} from "@/actions/client-registrations";
import { ActionMessage } from "@/components/common/ActionMessage";
import { EmptyState } from "@/components/common/EmptyState";
import { roleLabel } from "@/lib/auth/permissions";
import { matchesNowMasterSearch } from "@/lib/masters/now-master";
import {
  formatNowStaffLabel,
  nextPrimaryUserId,
  type ClientRegistrationRow,
  type DepartmentNowStaff
} from "@/lib/masters/operating-clients";
import type { ActionResult } from "@/lib/utils/form";
import { formatDateTime } from "@/lib/utils/labels";
import type { AppRole } from "@/types/enums";

export type ClientRegistrationUser = { id: string; full_name: string; app_role: AppRole };

function sameIdSet(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function ClientRegistrationWorkspace({
  department,
  initialRows,
  users,
  initialNowStaff,
  canManage
}: {
  department: { id: string; department_name: string };
  initialRows: ClientRegistrationRow[];
  users: ClientRegistrationUser[];
  initialNowStaff: DepartmentNowStaff;
  canManage: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [checkedIds, setCheckedIds] = useState(
    () => new Set(initialRows.filter((row) => row.isOperating).map((row) => row.clientId))
  );
  const [query, setQuery] = useState("");
  const [operatingOnly, setOperatingOnly] = useState(false);
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [nowStaff, setNowStaff] = useState(initialNowStaff);
  const [isImporting, startImporting] = useTransition();
  const [assignmentClientId, setAssignmentClientId] = useState<string | null>(null);

  const savedIds = useMemo(() => new Set(rows.filter((row) => row.isOperating).map((row) => row.clientId)), [rows]);
  const isDirty = !sameIdSet(savedIds, checkedIds);
  const userNameById = useMemo(() => new Map(users.map((user) => [user.id, user.full_name])), [users]);
  const visibleRows = rows.filter(
    (row) =>
      (!operatingOnly || checkedIds.has(row.clientId)) &&
      matchesNowMasterSearch(query, [
        row.clientCode,
        row.clientName,
        ...row.assigneeIds.map((userId) => userNameById.get(userId)),
        ...(nowStaff.byClient[row.clientId] ?? []).map((staff) => staff.name)
      ])
  );
  // 현황 담당자가 있지만 이 부서 연결 목록에 없는 화주(화면 행이 없어 건수로만 안내)
  const rowClientIds = new Set(rows.map((row) => row.clientId));
  const unlistedStaffClientCount = Object.keys(nowStaff.byClient).filter((clientId) => !rowClientIds.has(clientId)).length;
  const assignmentRow = rows.find((row) => row.clientId === assignmentClientId) ?? null;

  function toggleOperating(clientId: string, checked: boolean) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(clientId);
      } else {
        next.delete(clientId);
      }
      return next;
    });
  }

  function toggleVisible(checked: boolean) {
    setCheckedIds((current) => {
      const next = new Set(current);
      visibleRows.forEach((row) => (checked ? next.add(row.clientId) : next.delete(row.clientId)));
      return next;
    });
  }

  function saveOperating() {
    const clientIds = rows.filter((row) => checkedIds.has(row.clientId)).map((row) => row.clientId);
    startSaving(async () => {
      const result = await saveDepartmentOperatingClientsAction({ department_id: department.id, client_ids: clientIds });
      setState(result);
      if (result.ok) {
        const saved = new Set(clientIds);
        setRows((current) => current.map((row) => ({ ...row, isOperating: saved.has(row.clientId) })));
      }
    });
  }

  function importFromNow() {
    if (!window.confirm("기준 월 최신 자료로 이 부서의 현황 담당자를 모두 바꿉니다. 진행하시겠습니까?")) {
      return;
    }
    startImporting(async () => {
      const result = await importStaffFromNowAction(department.id);
      setState(result);
      if (result.ok && result.data) {
        setNowStaff(result.data.nowStaff);
      }
    });
  }

  const allVisibleChecked = visibleRows.length > 0 && visibleRows.every((row) => checkedIds.has(row.clientId));

  return (
    <section className="space-y-3">
      <p className="rounded-[1.25rem] border border-[#e7ddcd] bg-white/82 px-4 py-3 text-sm font-semibold text-slate-600">
        {department.department_name} · 부서-화주 연결은 현황관리(now)가 원본입니다. 여기서는 연결된 화주 중 운영 화주와 화주별 담당자만
        등록합니다. 운영 화주만 화주자료·헤더·모바일 작성 목록에 나타납니다.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-md border border-slate-300 bg-white px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="sr-only">화주명·화주코드·담당자 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="화주명·화주코드·담당자 검색"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={operatingOnly}
            onChange={(event) => setOperatingOnly(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          운영 화주만
        </label>
        <span className="text-xs font-bold text-slate-500">
          운영 {checkedIds.size}/{rows.length}건 · 표시 {visibleRows.length}건
        </span>
        {canManage ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={importFromNow}
              disabled={isImporting || isSaving}
              className="tool-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CloudDownload className="h-4 w-4" aria-hidden="true" />
              )}
              {isImporting ? "가져오는 중…" : "현황에서 가져오기"}
            </button>
            <button
              type="button"
              onClick={saveOperating}
              disabled={!isDirty || isSaving || isImporting}
              className="tool-button tool-button-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              운영 화주 저장
            </button>
          </div>
        ) : null}
      </div>

      <p className="text-xs font-bold text-slate-500">
        {nowStaff.baseMonth
          ? `현황 담당자: 현황 기준 ${nowStaff.baseMonth} · 가져온 시각 ${formatDateTime(nowStaff.importedAt)}`
          : "현황 담당자: 아직 가져오지 않았습니다."}
        {" "}· 현황관리 인원상세에서 화주별 비중 1% 이상 담당자(부서장 제외)를 가져온 참고 명단이며, 로그인 담당자 지정과 별개입니다.
        {unlistedStaffClientCount > 0 ? ` 이 부서 연결 목록에 없는 화주 ${unlistedStaffClientCount}곳은 표시하지 않습니다.` : ""}
      </p>

      <ActionMessage state={state} />

      {rows.length === 0 ? (
        <EmptyState title="현황관리에서 이 부서에 연결된 화주가 없습니다." description="부서-화주 연결은 현황관리(now) 부서마스터에서 합니다." />
      ) : visibleRows.length === 0 ? (
        <EmptyState title="조건에 맞는 화주가 없습니다." />
      ) : (
        <div className="overflow-hidden rounded-[1.25rem] border border-[#e4dac9] bg-white/88 shadow-[0_18px_42px_rgba(16,34,61,0.07)]">
          <div className="hidden grid-cols-[4.5rem_8rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_3.5rem] items-center gap-3 border-b border-[#e4dac9] bg-[#fbf8f2] px-4 py-3 text-xs font-black text-slate-500 md:grid">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allVisibleChecked}
                disabled={!canManage || isSaving}
                onChange={(event) => toggleVisible(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
                aria-label="표시된 화주 모두 운영 선택"
              />
              운영
            </label>
            <span>화주코드</span>
            <span>화주명</span>
            <span>담당자</span>
            <span>현황 담당자</span>
            <span className="text-right">지정</span>
          </div>
          <ul>
            {visibleRows.map((row) => {
              const checked = checkedIds.has(row.clientId);
              const changed = checked !== row.isOperating;
              const assigneeNames = row.assigneeIds.map((userId) => ({
                id: userId,
                name: userNameById.get(userId) ?? "-",
                isPrimary: userId === row.primaryUserId
              }));
              const clientNowStaff = nowStaff.byClient[row.clientId] ?? [];
              return (
                <li
                  key={row.clientId}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-3 text-sm first:border-t-0 md:grid-cols-[4.5rem_8rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_3.5rem]"
                >
                  <label className="row-span-2 flex items-center gap-2 md:row-span-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canManage || isSaving}
                      onChange={(event) => toggleOperating(row.clientId, event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                      aria-label={`${row.clientName} 운영 여부`}
                    />
                    {changed ? <span className="text-[11px] font-black text-amber-600">변경</span> : null}
                  </label>
                  <span className="col-start-2 truncate text-xs font-semibold text-slate-500 md:col-start-auto md:text-sm">{row.clientCode}</span>
                  <span className="col-start-2 row-start-2 truncate font-black text-[#012241] md:col-start-auto md:row-start-auto">{row.clientName}</span>
                  <span className="col-span-3 flex min-w-0 flex-wrap gap-1 md:col-span-1">
                    {assigneeNames.length > 0 ? (
                      assigneeNames.map((assignee) => (
                        <span
                          key={assignee.id}
                          className={
                            assignee.isPrimary
                              ? "rounded-full bg-[#e6f1ec] px-2 py-0.5 text-xs font-bold text-[#007050]"
                              : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600"
                          }
                        >
                          {assignee.name}
                          {assignee.isPrimary ? " (대표)" : ""}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">담당자 미지정</span>
                    )}
                  </span>
                  <span className="col-span-3 flex min-w-0 flex-wrap items-center gap-1 md:col-span-1">
                    <span className="text-[11px] font-black text-slate-400 md:hidden">현황</span>
                    {clientNowStaff.length > 0 ? (
                      clientNowStaff.map((staff, index) => (
                        <span
                          key={`${row.clientId}:${index}`}
                          className="rounded-full border border-[#e4dac9] bg-[#fbf8f2] px-2 py-0.5 text-xs font-bold text-slate-600"
                        >
                          {formatNowStaffLabel(staff)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </span>
                  <span className="col-start-3 row-span-2 row-start-1 flex justify-end md:col-start-auto md:row-span-1 md:row-start-auto">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => setAssignmentClientId(row.clientId)}
                        disabled={!row.isOperating || changed || isSaving}
                        className="icon-tool-button disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`${row.clientName} 담당자 지정`}
                        title={row.isOperating && !changed ? "담당자 지정" : "운영 화주로 저장한 뒤 담당자를 지정하세요."}
                      >
                        <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {assignmentRow ? (
        <AssignmentDialog
          departmentId={department.id}
          departmentName={department.department_name}
          row={assignmentRow}
          users={users}
          onClose={() => setAssignmentClientId(null)}
          onSaved={(userIds, primaryUserId) =>
            setRows((current) =>
              current.map((row) =>
                row.clientId === assignmentRow.clientId
                  ? {
                      ...row,
                      assigneeIds: [...userIds].sort(
                        (left, right) => Number(right === primaryUserId) - Number(left === primaryUserId)
                      ),
                      primaryUserId
                    }
                  : row
              )
            )
          }
        />
      ) : null}
    </section>
  );
}

function AssignmentDialog({
  departmentId,
  departmentName,
  row,
  users,
  onClose,
  onSaved
}: {
  departmentId: string;
  departmentName: string;
  row: ClientRegistrationRow;
  users: ClientRegistrationUser[];
  onClose: () => void;
  onSaved: (userIds: string[], primaryUserId: string | null) => void;
}) {
  const [selectedUserIds, setSelectedUserIds] = useState(row.assigneeIds);
  const [primaryUserId, setPrimaryUserId] = useState(row.primaryUserId ?? row.assigneeIds[0] ?? "");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [isSaving, startSaving] = useTransition();
  const visibleUsers = users.filter((user) => matchesNowMasterSearch(query, [user.full_name, roleLabel(user.app_role)]));

  function toggleUser(userId: string, checked: boolean) {
    const next = checked ? [...new Set([...selectedUserIds, userId])] : selectedUserIds.filter((id) => id !== userId);
    setSelectedUserIds(next);
    setPrimaryUserId(nextPrimaryUserId(next, primaryUserId));
  }

  function save() {
    startSaving(async () => {
      const result = await saveDepartmentClientAssignmentsAction({
        department_id: departmentId,
        client_id: row.clientId,
        user_ids: selectedUserIds,
        primary_user_id: primaryUserId || null
      });
      setState(result);
      if (result.ok && result.data) {
        onSaved(result.data.userIds, result.data.primaryUserId);
      }
    });
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-md sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`assignment-${row.clientId}`}
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#e4dac9] px-5 py-4">
          <div className="min-w-0">
            <h2 id={`assignment-${row.clientId}`} className="text-lg font-black text-[#012241]">화주 담당자 지정</h2>
            <p className="mt-1 truncate text-sm text-slate-500">
              {departmentName} · {row.clientName} · 여러 명을 고르고 대표 1명을 지정합니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <label className="mb-3 flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="sr-only">사용자 검색</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름·역할 검색"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
            />
          </label>
          {users.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#d3c6b0] bg-[#fbf8f2] px-4 py-10 text-center text-sm font-semibold text-slate-500">
              이 부서에 소속된 활성 사용자가 없습니다.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleUsers.map((user) => {
                const checked = selectedUserIds.includes(user.id);
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-3 py-3 text-sm"
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-2 font-bold text-[#012241]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleUser(user.id, event.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300"
                      />
                      <span className="truncate">{user.full_name}</span>
                      <span className="shrink-0 text-xs font-semibold text-slate-500">{roleLabel(user.app_role)}</span>
                    </label>
                    <label className="flex shrink-0 items-center gap-1 text-xs font-bold text-slate-500">
                      <input
                        type="radio"
                        name={`primary-${row.clientId}`}
                        checked={primaryUserId === user.id}
                        disabled={!checked}
                        onChange={() => setPrimaryUserId(user.id)}
                        aria-label={`${user.full_name} 대표 담당자 지정`}
                      />
                      대표
                    </label>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4">
            <ActionMessage state={state} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[#e4dac9] px-5 py-4">
          <span className="text-xs font-bold text-slate-500">선택 {selectedUserIds.length}명</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="tool-button">닫기</button>
            <button type="button" onClick={save} disabled={isSaving} className="tool-button tool-button-primary disabled:opacity-50">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserRoundCheck className="h-4 w-4" aria-hidden="true" />}
              저장
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
