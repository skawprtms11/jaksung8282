"use client";

import { type ClipboardEvent, type KeyboardEvent, useActionState, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Building2, FileSpreadsheet, KeyRound, PackagePlus, Pencil, Plus, RotateCcw, Save, Search, Trash2, UserRoundCheck, X } from "lucide-react";
import {
  approveUserRegistrationRequestAction,
  deleteClientsAction,
  deleteDepartmentsAction,
  deleteUsersAction,
  importLaborCentersAction,
  rejectUserRegistrationRequestAction,
  resetUserPasswordAction,
  saveClientAction,
  saveClientAssignmentsAction,
  saveClientsBulkImportAction,
  saveDepartmentClientAssignmentsAction,
  saveDepartmentClientSelectionAction,
  saveDepartmentClientAction,
  saveDepartmentAction,
  saveUserAction
} from "@/actions/masters";
import { ActionMessage } from "@/components/common/ActionMessage";
import { EmptyState } from "@/components/common/EmptyState";
import { SubmitButton } from "@/components/common/SubmitButton";
import { TableShell } from "@/components/common/TableShell";
import { getInitialPassword, isInitialPasswordAdjusted } from "@/lib/auth/initial-password";
import { roleLabel } from "@/lib/auth/permissions";
import type { AppRole } from "@/types/enums";

type Department = { id: string; department_name: string };
type DepartmentFormValue = {
  id: string;
  department_code: string;
  department_name: string;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
};
type ClientFormValue = {
  id: string;
  client_code: string;
  client_name: string;
  notes: string | null;
  department_id: string | null;
  is_active: boolean;
  sort_order: number;
};
type ClientMasterValue = ClientFormValue & {
  departments?: Department | null;
};
type UserFormValue = {
  id: string;
  email: string;
  employee_no: string;
  full_name: string;
  department_id: string | null;
  app_role: AppRole;
  notes: string | null;
  is_active: boolean;
};
type UserMasterValue = UserFormValue & {
  created_at: string;
  updated_at: string;
  departments: Department | null;
};
type UserRegistrationRequestValue = {
  id: string;
  email: string;
  employee_no: string;
  full_name: string;
  department_id: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  departments: Department | null;
};
type AssignmentUser = { id: string; full_name: string; department_id: string | null; app_role: AppRole };
type AssignmentValue = { user_id: string; is_primary: boolean };
type DepartmentClientValue = {
  id: string;
  client_code: string;
  client_name: string;
  notes: string | null;
  department_id: string | null;
};
type DepartmentClientLinkValue = { department_id: string; client_id: string; is_active: boolean };
type DepartmentAssignmentValue = AssignmentValue & { department_id: string | null; client_id: string; is_active: boolean };
type CenterMasterValue = {
  id: string;
  source_center_id: string;
  center_name: string;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

export function CenterMasterControls({
  centers,
  canImport
}: {
  centers: CenterMasterValue[];
  canImport: boolean;
}) {
  const [state, action] = useActionState(importLaborCentersAction, null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-end gap-2 rounded-[1.25rem] border border-[#d9e7f7] bg-white/82 px-3 py-2 shadow-[0_10px_26px_rgba(16,34,61,0.05)]">
        {canImport ? (
          <form action={action}>
            <SubmitButton variant="primary">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              불러오기
            </SubmitButton>
          </form>
        ) : (
          <p className="text-sm font-bold text-slate-500">센터 정보는 읽기 전용입니다.</p>
        )}
      </div>
      <ActionMessage state={state} />
      {centers.length === 0 ? (
        <EmptyState title="센터 정보가 없습니다." description="관리자가 불러오기를 실행하면 노임마감시스템의 센터 목록이 표시됩니다." />
      ) : (
        <TableShell>
          <table className="table-sticky w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-3">센터명</th>
                <th className="px-3 py-3">주소</th>
                <th className="px-3 py-3">비고</th>
              </tr>
            </thead>
            <tbody>
              {centers.map((center) => (
                <tr key={center.id} className="border-t border-slate-100">
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2 font-black text-[#10223d]">
                      <Building2 className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
                      {center.center_name}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{center.address?.trim() || "-"}</td>
                  <td className="px-3 py-3 text-slate-500">{center.notes?.trim() || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </section>
  );
}

export function DepartmentMasterTable({
  departments,
  users,
  headCandidates,
  clients,
  departmentClientLinks,
  assignments,
  canManage
}: {
  departments: DepartmentFormValue[];
  users: AssignmentUser[];
  headCandidates: AssignmentUser[];
  clients: DepartmentClientValue[];
  departmentClientLinks: DepartmentClientLinkValue[];
  assignments: DepartmentAssignmentValue[];
  canManage: boolean;
}) {
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentFormValue | null>(null);
  const [deleteState, deleteAction] = useActionState(deleteDepartmentsAction, null);
  const selectedDepartment = departments.find((department) => department.id === selectedDepartmentIds[0]) ?? null;
  const allSelected = departments.length > 0 && selectedDepartmentIds.length === departments.length;

  function toggleDepartment(departmentId: string, checked: boolean) {
    setSelectedDepartmentIds((current) =>
      checked ? Array.from(new Set([...current, departmentId])) : current.filter((id) => id !== departmentId)
    );
  }

  function toggleAll(checked: boolean) {
    setSelectedDepartmentIds(checked ? departments.map((department) => department.id) : []);
  }

  function openEditDialog() {
    if (selectedDepartmentIds.length !== 1 || !selectedDepartment) {
      return;
    }
    setEditingDepartment(selectedDepartment);
  }

  return (
    <section className="space-y-3">
      {canManage ? (
        <div className="flex items-center justify-end gap-2 rounded-[1.25rem] border border-[#d9e7f7] bg-white/82 px-3 py-2 shadow-[0_10px_26px_rgba(16,34,61,0.05)]">
          <button
            type="button"
            onClick={openEditDialog}
            disabled={selectedDepartmentIds.length !== 1}
            title={selectedDepartmentIds.length !== 1 ? "수정할 부서를 1개만 선택하세요." : "선택한 부서 수정"}
            className="tool-button min-h-9 py-1.5 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            수정
          </button>
          <form
            action={deleteAction}
            onSubmit={(event) => {
              if (selectedDepartmentIds.length === 0 || !window.confirm("선택한 부서를 삭제할까요? 삭제된 부서는 비활성화됩니다.")) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="department_ids" value={selectedDepartmentIds.join(",")} />
            <button
              type="submit"
              disabled={selectedDepartmentIds.length === 0}
              title={selectedDepartmentIds.length === 0 ? "삭제할 부서를 선택하세요." : "선택한 부서 삭제"}
              className="tool-button tool-button-danger min-h-9 py-1.5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              삭제
            </button>
          </form>
        </div>
      ) : null}
      <ActionMessage state={deleteState} />
      <TableShell>
        <table className="table-sticky min-w-[700px] w-full text-left text-sm">
          <thead>
            <tr>
              {canManage ? (
                <th className="w-12 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => toggleAll(event.target.checked)}
                    aria-label="부서 전체 선택"
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
              ) : null}
              <th className="px-3 py-3">부서명</th>
              <th className="px-3 py-3">부서장</th>
              <th className="px-3 py-3">화주등록</th>
              <th className="px-3 py-3">비고</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((department) => {
              const headNames = users
                .filter((user) => user.department_id === department.id && user.app_role === "department_head")
                .map((user) => user.full_name);
              return (
                <tr key={department.id} className="border-t border-slate-100">
                  {canManage ? (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedDepartmentIds.includes(department.id)}
                        onChange={(event) => toggleDepartment(department.id, event.target.checked)}
                        aria-label={`${department.department_name} 선택`}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-[#075be8]" />
                      {department.department_name}
                    </span>
                  </td>
                  <td className="px-3 py-3">{headNames.join(", ") || "-"}</td>
                  <td className="px-3 py-3">
                    <DepartmentClientManager
                      department={department}
                      clients={clients}
                      departmentClientLinks={departmentClientLinks}
                      users={users}
                      assignments={assignments}
                    />
                  </td>
                  <td className="px-3 py-3 text-slate-500">{department.notes?.trim() || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>

      {editingDepartment ? (
        <DepartmentEditDialog
          department={editingDepartment}
          users={headCandidates}
          onClose={() => setEditingDepartment(null)}
        />
      ) : null}
    </section>
  );
}

function DepartmentEditDialog({
  department,
  users,
  onClose
}: {
  department: DepartmentFormValue;
  users: AssignmentUser[];
  onClose: () => void;
}) {
  const [state, action] = useActionState(saveDepartmentAction, null);
  const headCandidates = users.filter((user) => user.app_role === "department_head" || user.app_role === "manager");
  const currentHead = headCandidates.find((user) => user.department_id === department.id && user.app_role === "department_head");

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="department-edit-title">
        <form action={action} className="w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
          <input type="hidden" name="id" value={department.id} />
          <input type="hidden" name="department_code" value={department.department_code} />
          <input type="hidden" name="sort_order" value={department.sort_order} />
          <input type="hidden" name="is_active" value="true" />
          <div className="flex items-start justify-between gap-4 border-b border-[#d9e4f2] px-5 py-4">
            <div>
              <h2 id="department-edit-title" className="text-lg font-black text-[#10223d]">부서 수정</h2>
              <p className="mt-1 text-sm text-slate-500">부서명, 부서장, 비고를 수정합니다.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <label className="text-sm font-black text-[#10223d]">
              부서명
              <input name="department_name" required defaultValue={department.department_name} className="mt-1 h-11 w-full rounded-2xl border border-[#d7e4f6] px-3 text-sm font-bold outline-none focus:border-[#075be8]" />
            </label>
            <label className="text-sm font-black text-[#10223d]">
              부서장
              <select name="department_head_id" defaultValue={currentHead?.id ?? ""} className="mt-1 h-11 w-full rounded-2xl border border-[#d7e4f6] px-3 text-sm font-bold outline-none focus:border-[#075be8]">
                <option value="">선택</option>
                {headCandidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-black text-[#10223d] md:col-span-2">
              비고
              <input name="notes" defaultValue={department.notes ?? ""} className="mt-1 h-11 w-full rounded-2xl border border-[#d7e4f6] px-3 text-sm font-bold outline-none focus:border-[#075be8]" />
            </label>
            <div className="md:col-span-2">
              <ActionMessage state={state} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#d9e4f2] px-5 py-4">
            <button type="button" onClick={onClose} className="tool-button">취소</button>
            <SubmitButton>
              <Save className="h-4 w-4" aria-hidden="true" />
              저장
            </SubmitButton>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

export function DepartmentForm({ users = [] }: { users?: AssignmentUser[] }) {
  const [state, action] = useActionState(saveDepartmentAction, null);
  const [headUserId, setHeadUserId] = useState("");
  const headCandidates = users.filter((user) => user.app_role === "department_head" || user.app_role === "manager");

  return (
    <form action={action} className="sketch-panel grid gap-3 rounded-md p-4 md:grid-cols-2">
      <input type="hidden" name="sort_order" value="0" />
      <input type="hidden" name="is_active" value="true" />
      <label className="text-sm">
        부서명
        <input name="department_name" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
      </label>
      <label className="text-sm">
        부서장
        <select
          name="department_head_id"
          value={headUserId}
          onChange={(event) => setHeadUserId(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
        >
          <option value="">선택</option>
          {headCandidates.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        비고
        <input name="notes" className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
      </label>
      <div className="flex items-end justify-end gap-3 md:col-span-2">
        <SubmitButton>등록</SubmitButton>
      </div>
      <div className="md:col-span-2">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function DepartmentCreateButton({ users = [] }: { users?: AssignmentUser[] }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="tool-button tool-button-primary">
        <Plus className="h-4 w-4" aria-hidden="true" />
        부서 등록
      </button>
      {isOpen ? (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="department-create-title">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#d9e4f2] px-5 py-4">
              <div>
                <h2 id="department-create-title" className="text-lg font-black text-[#10223d]">부서 등록</h2>
                <p className="mt-1 text-sm text-slate-500">부서명, 부서장, 비고를 입력합니다.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="icon-tool-button" aria-label="팝업 닫기">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5">
              <DepartmentForm users={users} />
            </div>
          </div>
        </div>
        </ModalPortal>
      ) : null}
    </>
  );
}

export function DepartmentClientManager({
  department,
  clients,
  departmentClientLinks,
  users,
  assignments
}: {
  department: DepartmentFormValue;
  clients: DepartmentClientValue[];
  departmentClientLinks: DepartmentClientLinkValue[];
  users: AssignmentUser[];
  assignments: DepartmentAssignmentValue[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [selectedRegisteredClientIds, setSelectedRegisteredClientIds] = useState<string[]>([]);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [activeAutocompleteIndex, setActiveAutocompleteIndex] = useState(-1);
  const [stagedRegisteredClientIds, setStagedRegisteredClientIds] = useState<string[]>(() =>
    departmentClientLinks.filter((link) => link.department_id === department.id && link.is_active).map((link) => link.client_id)
  );
  const [assignmentClientId, setAssignmentClientId] = useState<string | null>(null);
  const [saveState, saveAction] = useActionState(saveDepartmentClientSelectionAction, null);
  const persistedRegisteredClientIds = departmentClientLinks.filter((link) => link.department_id === department.id && link.is_active).map((link) => link.client_id);
  const availableClients = clients.filter((client) => !stagedRegisteredClientIds.includes(client.id));
  const normalizedClientSearchQuery = clientSearchQuery.trim().toLocaleLowerCase("ko-KR");
  const filteredAvailableClients = normalizedClientSearchQuery
    ? availableClients.filter((client) =>
        `${client.client_name} ${client.client_code}`.toLocaleLowerCase("ko-KR").includes(normalizedClientSearchQuery)
      )
    : availableClients;
  const autocompleteClients = normalizedClientSearchQuery ? filteredAvailableClients.slice(0, 8) : [];
  const registeredClients = clients.filter((client) => stagedRegisteredClientIds.includes(client.id));
  const departmentUsers = users.filter((user) => user.department_id === department.id && user.app_role === "client_owner");
  const assignmentClient = registeredClients.find((client) => client.id === assignmentClientId) ?? null;
  const hasUnsavedChanges =
    stagedRegisteredClientIds.length !== persistedRegisteredClientIds.length ||
    stagedRegisteredClientIds.some((clientId) => !persistedRegisteredClientIds.includes(clientId));

  function openManager() {
    setStagedRegisteredClientIds(persistedRegisteredClientIds);
    setSelectedClientIds([]);
    setSelectedRegisteredClientIds([]);
    setClientSearchQuery("");
    setIsAutocompleteOpen(false);
    setActiveAutocompleteIndex(-1);
    setAssignmentClientId(null);
    setIsOpen(true);
  }

  function toggleClient(clientId: string, checked: boolean) {
    setSelectedClientIds((current) =>
      checked ? Array.from(new Set([...current, clientId])) : current.filter((id) => id !== clientId)
    );
  }

  function toggleRegisteredClient(clientId: string, checked: boolean) {
    setSelectedRegisteredClientIds((current) =>
      checked ? Array.from(new Set([...current, clientId])) : current.filter((id) => id !== clientId)
    );
  }

  function addSelectedClients() {
    setStagedRegisteredClientIds((current) => Array.from(new Set([...current, ...selectedClientIds])));
    setSelectedClientIds([]);
    setClientSearchQuery("");
    setIsAutocompleteOpen(false);
    setActiveAutocompleteIndex(-1);
  }

  function selectAutocompleteClient(client: DepartmentClientValue) {
    setClientSearchQuery(client.client_name);
    setIsAutocompleteOpen(false);
    setActiveAutocompleteIndex(-1);
  }

  function handleClientSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (autocompleteClients.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsAutocompleteOpen(true);
      setActiveAutocompleteIndex((current) => Math.min(current + 1, autocompleteClients.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsAutocompleteOpen(true);
      setActiveAutocompleteIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeAutocompleteIndex >= 0) {
      event.preventDefault();
      selectAutocompleteClient(autocompleteClients[activeAutocompleteIndex]);
    } else if (event.key === "Escape") {
      setIsAutocompleteOpen(false);
      setActiveAutocompleteIndex(-1);
    }
  }

  function removeSelectedClients() {
    setStagedRegisteredClientIds((current) => current.filter((clientId) => !selectedRegisteredClientIds.includes(clientId)));
    setSelectedRegisteredClientIds([]);
    if (assignmentClientId && selectedRegisteredClientIds.includes(assignmentClientId)) {
      setAssignmentClientId(null);
    }
  }

  return (
    <>
      <button type="button" onClick={openManager} className="icon-tool-button" aria-label={`${department.department_name} 화주등록`}>
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen ? (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby={`client-manager-${department.id}`}>
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#d9e4f2] px-5 py-4">
              <div>
                <h2 id={`client-manager-${department.id}`} className="text-lg font-black text-[#10223d]">{department.department_name} 화주등록</h2>
                <p className="mt-1 text-sm text-slate-500">왼쪽 화주목록에서 선택 후 등록하고, 상단 저장을 눌러 최종 반영합니다.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addSelectedClients}
                  disabled={selectedClientIds.length === 0}
                  title={selectedClientIds.length === 0 ? "등록할 화주를 선택하세요." : undefined}
                  className="focus-ring tool-button tool-button-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  등록
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <form action={saveAction}>
                  <input type="hidden" name="department_id" value={department.id} />
                  <input type="hidden" name="registered_client_ids" value={stagedRegisteredClientIds.join(",")} />
                  <SubmitButton disabledReason={!hasUnsavedChanges ? "변경된 화주 등록 내용이 없습니다." : undefined}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    저장
                  </SubmitButton>
                </form>
                <button type="button" onClick={() => setIsOpen(false)} className="icon-tool-button" aria-label="팝업 닫기">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid max-h-[76vh] gap-4 overflow-y-auto p-5 lg:grid-cols-2">
              <section className="rounded-[1.25rem] border border-[#d9e4f2] bg-[#f8fbff] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-black text-[#10223d]">화주목록</h3>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">
                    {normalizedClientSearchQuery ? `${filteredAvailableClients.length}/${availableClients.length}건` : `${availableClients.length}건`}
                  </span>
                </div>
                <div className="relative mb-3">
                  <label htmlFor={`client-search-${department.id}`} className="sr-only">화주명 또는 화주코드 검색</label>
                  <div className="flex h-10 items-center gap-2 rounded-md border border-[#b9cce4] bg-white px-3 focus-within:border-[#075be8] focus-within:ring-2 focus-within:ring-[#075be8]/15">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <input
                      id={`client-search-${department.id}`}
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={isAutocompleteOpen && autocompleteClients.length > 0}
                      aria-controls={`client-search-options-${department.id}`}
                      aria-activedescendant={activeAutocompleteIndex >= 0 ? `client-search-option-${autocompleteClients[activeAutocompleteIndex]?.id}` : undefined}
                      value={clientSearchQuery}
                      onChange={(event) => {
                        setClientSearchQuery(event.target.value);
                        setIsAutocompleteOpen(true);
                        setActiveAutocompleteIndex(-1);
                      }}
                      onFocus={() => setIsAutocompleteOpen(true)}
                      onBlur={() => setIsAutocompleteOpen(false)}
                      onKeyDown={handleClientSearchKeyDown}
                      placeholder="화주명 또는 화주코드 검색"
                      autoComplete="off"
                      className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-[#10223d] outline-none placeholder:text-slate-400"
                    />
                    {clientSearchQuery ? (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setClientSearchQuery("");
                          setIsAutocompleteOpen(false);
                          setActiveAutocompleteIndex(-1);
                        }}
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-[#075be8]"
                        aria-label="화주 검색 초기화"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  {isAutocompleteOpen && autocompleteClients.length > 0 ? (
                    <div
                      id={`client-search-options-${department.id}`}
                      role="listbox"
                      className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-20 max-h-64 overflow-y-auto rounded-md border border-[#b9cce4] bg-white p-1.5 shadow-[0_18px_40px_rgba(16,34,61,0.18)]"
                    >
                      {autocompleteClients.map((client, index) => (
                        <button
                          key={client.id}
                          id={`client-search-option-${client.id}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeAutocompleteIndex}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectAutocompleteClient(client)}
                          className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm transition ${index === activeAutocompleteIndex ? "bg-[#eaf3ff] text-[#075be8]" : "text-[#10223d] hover:bg-[#f4f8fd]"}`}
                        >
                          <span className="min-w-0 truncate font-bold">{client.client_name}</span>
                          <span className="shrink-0 text-xs font-semibold text-slate-400">{client.client_code}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {availableClients.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[#b9cce4] bg-white/80 px-4 py-10 text-center text-sm font-semibold text-slate-500">등록 가능한 미소속 화주가 없습니다.</p>
                ) : filteredAvailableClients.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[#b9cce4] bg-white/80 px-4 py-10 text-center text-sm font-semibold text-slate-500">검색 조건에 맞는 화주가 없습니다.</p>
                ) : (
                  <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                    {filteredAvailableClients.map((client) => (
                      <label key={client.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#d9e4f2] bg-white/86 px-3 py-3 text-sm transition hover:border-[#075be8]/30 hover:bg-white">
                        <input
                          type="checkbox"
                          checked={selectedClientIds.includes(client.id)}
                          onChange={(event) => toggleClient(client.id, event.target.checked)}
                          aria-label={`${client.client_name} 선택`}
                          className="h-4 w-4 shrink-0 rounded border-slate-300"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-black text-[#10223d]">{client.client_name}</span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{client.client_code}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[1.25rem] border border-[#d9e4f2] bg-[#f8fbff] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-black text-[#10223d]">등록된 화주목록</h3>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">{registeredClients.length}건</span>
                    <button
                      type="button"
                      onClick={removeSelectedClients}
                      disabled={selectedRegisteredClientIds.length === 0}
                      title={selectedRegisteredClientIds.length === 0 ? "삭제할 화주를 선택하세요." : undefined}
                      className="focus-ring tool-button tool-button-danger disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      삭제
                    </button>
                  </div>
                </div>
                {registeredClients.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[#b9cce4] bg-white/80 px-4 py-10 text-center text-sm font-semibold text-slate-500">아직 등록된 화주가 없습니다.</p>
                ) : (
                  <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
                    {registeredClients.map((client) => {
                      const assignedUsers = assignments
                        .filter((assignment) => assignment.department_id === department.id && assignment.client_id === client.id && assignment.is_active)
                        .map((assignment) => users.find((user) => user.id === assignment.user_id)?.full_name)
                        .filter(Boolean);
                      return (
                        <div
                          key={client.id}
                          className="flex w-full items-center gap-3 rounded-2xl border border-[#d9e4f2] bg-white/86 px-3 py-3 text-left text-sm transition hover:border-[#075be8]/30 hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRegisteredClientIds.includes(client.id)}
                            onChange={(event) => toggleRegisteredClient(client.id, event.target.checked)}
                            aria-label={`${client.client_name} 삭제 선택`}
                            className="h-4 w-4 shrink-0 rounded border-slate-300"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-3">
                              <span className="min-w-0">
                                <span className="block truncate font-black text-[#10223d]">{client.client_name}</span>
                                <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{client.client_code}</span>
                              </span>
                            </span>
                            <span className="mt-2 block truncate text-xs text-slate-500">
                              {assignedUsers.length > 0 ? assignedUsers.join(", ") : "담당자 미지정"}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setAssignmentClientId(client.id)}
                            disabled={!persistedRegisteredClientIds.includes(client.id)}
                            title={!persistedRegisteredClientIds.includes(client.id) ? "저장 후 담당자를 등록할 수 있습니다." : undefined}
                            className="icon-tool-button shrink-0"
                            aria-label={`${client.client_name} 담당자 등록`}
                          >
                            <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
            <div className="space-y-2 border-t border-[#d9e4f2] px-5 py-3">
              <ActionMessage state={saveState} />
              {hasUnsavedChanges ? (
                <p className="text-xs font-semibold text-amber-700">저장하지 않은 화주 등록 변경사항이 있습니다.</p>
              ) : null}
            </div>
          </div>
        </div>
        </ModalPortal>
      ) : null}

      {assignmentClient ? (
        <DepartmentClientAssignmentDialog
          department={department}
          client={assignmentClient}
          users={departmentUsers}
          assignments={assignments.filter((assignment) => assignment.department_id === department.id && assignment.client_id === assignmentClient.id && assignment.is_active)}
          onClose={() => setAssignmentClientId(null)}
        />
      ) : null}
    </>
  );
}

function DepartmentClientAssignmentDialog({
  department,
  client,
  users,
  assignments,
  onClose
}: {
  department: DepartmentFormValue;
  client: DepartmentClientValue;
  users: AssignmentUser[];
  assignments: DepartmentAssignmentValue[];
  onClose: () => void;
}) {
  const [state, action] = useActionState(saveDepartmentClientAssignmentsAction, null);
  const [selectedUserIds, setSelectedUserIds] = useState(assignments.map((assignment) => assignment.user_id));
  const [primaryUserId, setPrimaryUserId] = useState(assignments.find((assignment) => assignment.is_primary)?.user_id ?? assignments[0]?.user_id ?? "");

  function toggleUser(userId: string, checked: boolean) {
    const next = checked ? Array.from(new Set([...selectedUserIds, userId])) : selectedUserIds.filter((id) => id !== userId);
    setSelectedUserIds(next);
    if (!next.includes(primaryUserId)) {
      setPrimaryUserId(next[0] ?? "");
    }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby={`assignment-${client.id}`}>
      <form action={action} className="w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.24)]">
        <input type="hidden" name="department_id" value={department.id} />
        <input type="hidden" name="client_id" value={client.id} />
        <input type="hidden" name="user_ids" value={selectedUserIds.join(",")} />
        <input type="hidden" name="primary_user_id" value={primaryUserId} />
        <div className="flex items-start justify-between gap-4 border-b border-[#d9e4f2] px-5 py-4">
          <div>
            <h2 id={`assignment-${client.id}`} className="text-lg font-black text-[#10223d]">담당자 선정</h2>
            <p className="mt-1 text-sm text-slate-500">{department.department_name} · {client.client_name}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-5">
          {users.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#b9cce4] bg-[#f8fbff] px-4 py-10 text-center text-sm font-semibold text-slate-500">
              해당 부서에 등록 가능한 화주담당자가 없습니다.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {users.map((user) => {
                const checked = selectedUserIds.includes(user.id);
                return (
                  <label key={user.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#d9e4f2] bg-[#f8fbff] px-3 py-3 text-sm">
                    <span className="min-w-0 flex-1 font-bold text-[#10223d]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleUser(user.id, event.target.checked)}
                        className="mr-2 h-4 w-4 rounded border-slate-300"
                      />
                      {user.full_name}
                    </span>
                    <input
                      type="radio"
                      name={`primary-${client.id}`}
                      checked={primaryUserId === user.id}
                      disabled={!checked}
                      onChange={() => setPrimaryUserId(user.id)}
                      aria-label={`${user.full_name} 대표 담당자 지정`}
                    />
                  </label>
                );
              })}
            </div>
          )}
          <div className="mt-4">
            <ActionMessage state={state} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#d9e4f2] px-5 py-4">
          <button type="button" onClick={onClose} className="tool-button">닫기</button>
          <SubmitButton>
            <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
            저장
          </SubmitButton>
        </div>
      </form>
    </div>
    </ModalPortal>
  );
}

export function DepartmentClientRegistration({
  departments,
  users,
  defaultDepartmentId,
  canSelectDepartment
}: {
  departments: Department[];
  users: AssignmentUser[];
  defaultDepartmentId: string;
  canSelectDepartment: boolean;
}) {
  const [state, action] = useActionState(saveDepartmentClientAction, null);
  const [isOpen, setIsOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId || departments[0]?.id || "");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [primaryUserId, setPrimaryUserId] = useState("");
  const filteredUsers = users.filter((user) => user.department_id === departmentId);

  function toggleUser(userId: string, checked: boolean) {
    const next = checked ? [...selectedUserIds, userId] : selectedUserIds.filter((id) => id !== userId);
    setSelectedUserIds(next);
    if (!next.includes(primaryUserId)) {
      setPrimaryUserId(next[0] ?? "");
    }
  }

  return (
    <section className="sketch-panel rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-doodle-title">부서 화주 등록</h2>
          <p className="mt-1 text-sm text-slate-500">부서 소속 화주와 화주담당자를 함께 등록합니다.</p>
        </div>
        <button type="button" onClick={() => setIsOpen(true)} className="tool-button tool-button-primary">
          <Plus className="h-4 w-4" aria-hidden="true" />
          화주등록
        </button>
      </div>

      {isOpen ? (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="department-client-title">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="department-client-title" className="text-lg font-black text-slate-900">
                  화주 및 담당자 등록
                </h2>
                <p className="mt-1 text-sm text-slate-500">한 화주에 여러 담당자를 지정할 수 있습니다.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="icon-tool-button" aria-label="팝업 닫기">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form action={action} className="max-h-[72vh] space-y-4 overflow-y-auto p-5">
              <input type="hidden" name="user_ids" value={selectedUserIds.join(",")} />
              <input type="hidden" name="primary_user_id" value={primaryUserId} />
              <input type="hidden" name="sort_order" value="0" />
              <input type="hidden" name="is_active" value="true" />

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  화주코드
                  <input name="client_code" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  화주명
                  <input name="client_name" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
                </label>
              </div>

              {canSelectDepartment ? (
                <label className="block text-sm font-semibold text-slate-700">
                  부서
                  <select
                    name="department_id"
                    value={departmentId}
                    onChange={(event) => {
                      setDepartmentId(event.target.value);
                      setSelectedUserIds([]);
                      setPrimaryUserId("");
                    }}
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
                  >
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.department_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="department_id" value={departmentId} />
              )}

              <label className="block text-sm font-semibold text-slate-700">
                비고
                <textarea name="notes" rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>

              <fieldset className="glass-fieldset p-3">
                <legend className="px-1 text-sm font-black text-slate-800">화주담당자</legend>
                {filteredUsers.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[#b9cce4] bg-white/82 px-3 py-6 text-center text-sm text-slate-500">
                    선택 가능한 부서 사용자가 없습니다.
                  </p>
                ) : (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {filteredUsers.map((user) => {
                      const checked = selectedUserIds.includes(user.id);
                      return (
                        <label key={user.id} className="glass-row flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => toggleUser(user.id, event.target.checked)}
                            />{" "}
                            {user.full_name}
                          </span>
                          <input
                            type="radio"
                            name={`department-client-primary-${departmentId}`}
                            checked={primaryUserId === user.id}
                            disabled={!checked}
                            onChange={() => setPrimaryUserId(user.id)}
                            aria-label={`${user.full_name} 대표 담당자 지정`}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>

              <ActionMessage state={state} />
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setIsOpen(false)} className="tool-button">
                  취소
                </button>
                <SubmitButton>저장</SubmitButton>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      ) : null}
    </section>
  );
}

export function ClientForm({
  departments,
  variant = "panel",
  showDepartment = true,
  defaultDepartmentId
}: {
  departments: Department[];
  variant?: "panel" | "plain";
  showDepartment?: boolean;
  defaultDepartmentId?: string;
}) {
  const [state, action] = useActionState(saveClientAction, null);
  const fallbackDepartmentId = defaultDepartmentId ?? "";
  return (
    <form
      action={action}
      className={`${variant === "panel" ? "sketch-panel" : "glass-fieldset"} grid gap-3 p-4 md:grid-cols-2`}
    >
      <label className="text-sm">
        화주코드
        <input name="client_code" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
      </label>
      <label className="text-sm">
        화주명
        <input name="client_name" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
      </label>
      {showDepartment ? (
        <label className="text-sm md:col-span-2">
          소속 부서
          <select name="department_id" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3">
            <option value="">선택</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.department_name}
              </option>
            ))}
          </select>
        </label>
      ) : fallbackDepartmentId ? (
        <input type="hidden" name="department_id" value={fallbackDepartmentId} />
      ) : null}
      <label className="text-sm md:col-span-2">
        비고
        <textarea name="notes" rows={4} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <div className="flex items-end gap-3 md:col-span-2">
        <input type="hidden" name="sort_order" value="0" />
        <input type="hidden" name="is_active" value="true" />
        <SubmitButton>등록</SubmitButton>
      </div>
      <div className="md:col-span-2">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function ClientEditForm({
  client,
  departments,
  variant = "details",
  showDepartment = true
}: {
  client: ClientFormValue;
  departments: Department[];
  variant?: "details" | "plain";
  showDepartment?: boolean;
}) {
  const [state, action] = useActionState(saveClientAction, null);
  const form = (
    <form action={action} className={`${variant === "details" ? "mt-3" : ""} grid gap-2 md:grid-cols-6`}>
      <input type="hidden" name="id" value={client.id} />
      <input name="client_code" defaultValue={client.client_code} className="h-9 rounded-md border border-slate-300 px-2 text-sm" />
      <input name="client_name" defaultValue={client.client_name} className="h-9 rounded-md border border-slate-300 px-2 text-sm md:col-span-2" />
      <input name="notes" defaultValue={client.notes ?? ""} className="h-9 rounded-md border border-slate-300 px-2 text-sm md:col-span-2" placeholder="비고" />
      {showDepartment ? (
        <select name="department_id" defaultValue={client.department_id ?? ""} className="h-9 rounded-md border border-slate-300 px-2 text-sm md:col-span-2">
          <option value="">부서 미지정</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.department_name}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="department_id" value={client.department_id ?? ""} />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" value="true" defaultChecked={client.is_active} />
        사용
      </label>
      <input type="hidden" name="sort_order" value={client.sort_order} />
      <div className="md:col-span-6">
        <SubmitButton variant="secondary">변경사항 저장</SubmitButton>
      </div>
      <div className="md:col-span-6">
        <ActionMessage state={state} />
      </div>
    </form>
  );

  if (variant === "plain") {
    return form;
  }

  return (
    <details className="glass-row p-3">
      <summary className="cursor-pointer text-sm font-bold text-[#075be8]">수정·비활성화</summary>
      {form}
    </details>
  );
}

export function ClientMasterControls({
  departments,
  clients
}: {
  departments: Department[];
  clients: ClientMasterValue[];
}) {
  const [mode, setMode] = useState<"edit" | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isBulkRegisterOpen, setIsBulkRegisterOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [deleteState, deleteAction] = useActionState(deleteClientsAction, null);
  const [checkedClientIds, setCheckedClientIds] = useState<string[]>([]);
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const clientIdSet = new Set(clients.map((client) => client.id));
  const selectedVisibleClientIds = checkedClientIds.filter((clientId) => clientIdSet.has(clientId));
  const allChecked = clients.length > 0 && selectedVisibleClientIds.length === clients.length;

  function toggleClient(clientId: string, checked: boolean) {
    setCheckedClientIds((current) =>
      checked ? Array.from(new Set([...current, clientId])) : current.filter((id) => id !== clientId)
    );
  }

  function toggleAll(checked: boolean) {
    setCheckedClientIds(checked ? clients.map((client) => client.id) : []);
  }

  return (
    <section className="sketch-panel space-y-4 rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setIsRegisterOpen(true)}
          className="tool-button"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          수기등록
        </button>
        <button
          type="button"
          onClick={() => setIsBulkRegisterOpen(true)}
          className="tool-button"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          일괄등록
        </button>
        <button
          type="button"
          onClick={() => setMode("edit")}
          className={`tool-button ${mode === "edit" ? "tool-button-primary" : ""}`}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          수정
        </button>
        </div>
        <form action={deleteAction}>
          <input type="hidden" name="client_ids" value={selectedVisibleClientIds.join(",")} />
          <SubmitButton
            variant="danger"
            disabledReason={selectedVisibleClientIds.length === 0 ? "삭제할 화주를 선택하세요." : undefined}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            삭제
          </SubmitButton>
        </form>
      </div>
      <ActionMessage state={deleteState} />

      {isRegisterOpen ? (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="client-register-title">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="client-register-title" className="text-lg font-black text-slate-900">
                  화주 수기등록
                </h2>
                <p className="mt-1 text-sm text-slate-500">화주코드, 화주명, 비고만 입력합니다.</p>
              </div>
              <button type="button" onClick={() => setIsRegisterOpen(false)} className="icon-tool-button" aria-label="팝업 닫기">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5">
              <ClientForm
                departments={departments}
                variant="plain"
                showDepartment={false}
              />
            </div>
          </div>
        </div>
        </ModalPortal>
      ) : null}

      {isBulkRegisterOpen ? (
        <ClientBulkRegisterDialog onClose={() => setIsBulkRegisterOpen(false)} />
      ) : null}

      {mode === "edit" ? (
        <div className="glass-fieldset space-y-3 p-4">
          <label className="block text-sm font-semibold text-slate-700">
            수정할 화주
            <select
              value={selectedClientId}
              onChange={(event) => setSelectedClientId(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.client_code} · {client.client_name}
                </option>
              ))}
            </select>
          </label>
          {selectedClient ? (
            <ClientEditForm client={selectedClient} departments={departments} variant="plain" showDepartment={false} />
          ) : (
            <p className="rounded-2xl border border-dashed border-[#b9cce4] bg-white/82 px-3 py-6 text-center text-sm text-slate-500">
              수정할 화주가 없습니다.
            </p>
          )}
        </div>
      ) : null}

      {clients.length === 0 ? (
        <EmptyState title="화주 정보가 없습니다." />
      ) : (
        <TableShell>
          <table className="table-sticky min-w-[720px] w-full text-left text-sm">
            <thead>
              <tr>
                <th className="w-12 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(event) => toggleAll(event.target.checked)}
                    aria-label="전체 화주 선택"
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                <th className="px-3 py-3">화주코드</th>
                <th className="px-3 py-3">화주명</th>
                <th className="px-3 py-3">비고</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-t border-slate-100">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedVisibleClientIds.includes(client.id)}
                      onChange={(event) => toggleClient(client.id, event.target.checked)}
                      aria-label={`${client.client_name} 선택`}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-900">{client.client_code}</td>
                  <td className="px-3 py-3 text-slate-700">{client.client_name}</td>
                  <td className="px-3 py-3 text-slate-500">{client.notes?.trim() || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </section>
  );
}

type ClientBulkImportRow = {
  id: string;
  client_code: string;
  client_name: string;
  notes: string;
};
type ClientBulkImportField = keyof Omit<ClientBulkImportRow, "id">;
const clientBulkImportFields: ClientBulkImportField[] = ["client_code", "client_name", "notes"];

function createEmptyClientImportRows(count = 1): ClientBulkImportRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `client-import-${Date.now()}-${index}`,
    client_code: "",
    client_name: "",
    notes: ""
  }));
}

function parseClientImportClipboard(text: string, startField: ClientBulkImportField) {
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean));

  const [firstRow] = rows;
  const hasHeader =
    firstRow?.[0]?.replace(/\s/g, "") === "화주코드" &&
    firstRow?.[1]?.replace(/\s/g, "") === "화주명";

  const startFieldIndex = hasHeader ? 0 : clientBulkImportFields.indexOf(startField);
  return (hasHeader ? rows.slice(1) : rows).map((cells, index) => ({
    id: `client-import-paste-${Date.now()}-${index}`,
    client_code: cells[0 - startFieldIndex] ?? "",
    client_name: cells[1 - startFieldIndex] ?? "",
    notes: cells[2 - startFieldIndex] ?? ""
  }));
}

function ClientBulkRegisterDialog({ onClose }: { onClose: () => void }) {
  const [state, action] = useActionState(saveClientsBulkImportAction, null);
  const [rows, setRows] = useState<ClientBulkImportRow[]>(() => createEmptyClientImportRows());
  const enteredRows = useMemo(
    () => rows
      .map(({ client_code, client_name, notes }) => ({
        client_code: client_code.trim(),
        client_name: client_name.trim(),
        notes: notes.trim()
      }))
      .filter((row) => row.client_code || row.client_name || row.notes),
    [rows]
  );
  const incompleteRowNumbers = useMemo(
    () => rows
      .map((row, index) => ({
        index,
        hasValue: Boolean(row.client_code.trim() || row.client_name.trim() || row.notes.trim()),
        isComplete: Boolean(row.client_code.trim() && row.client_name.trim())
      }))
      .filter((row) => row.hasValue && !row.isComplete)
      .map((row) => row.index + 1),
    [rows]
  );
  const savableRows = useMemo(
    () => enteredRows.filter((row) => row.client_code && row.client_name),
    [enteredRows]
  );
  const serializedRows = useMemo(() => JSON.stringify(savableRows), [savableRows]);

  function updateCell(rowIndex: number, field: ClientBulkImportField, value: string) {
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row))
    );
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, startIndex: number, startField: ClientBulkImportField) {
    const pastedRows = parseClientImportClipboard(event.clipboardData.getData("text"), startField);
    if (pastedRows.length === 0) {
      return;
    }

    event.preventDefault();
    setRows((current) => {
      const preservedRows = current
        .slice(0, startIndex)
        .filter((row) => row.client_code.trim() || row.client_name.trim() || row.notes.trim());
      const nextRows = [...preservedRows, ...pastedRows];
      return nextRows.length > 0 ? nextRows : createEmptyClientImportRows();
    });
  }

  const disabledReason =
    incompleteRowNumbers.length > 0
      ? `${incompleteRowNumbers.slice(0, 5).join(", ")}행의 화주코드와 화주명을 입력하세요.`
      : savableRows.length === 0
        ? "등록할 화주를 입력하세요."
        : enteredRows.length > 2000
          ? "한 번에 2000건까지 등록할 수 있습니다."
          : undefined;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="client-bulk-register-title">
        <form action={action} className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
          <input type="hidden" name="rows" value={serializedRows} />
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="client-bulk-register-title" className="text-lg font-black text-slate-900">
                화주 일괄등록
              </h2>
              <p className="mt-1 text-sm text-slate-500">엑셀에서 화주코드, 화주명, 비고 3개 컬럼을 복사해 첫 칸에 붙여넣습니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRows(createEmptyClientImportRows())}
                className="tool-button"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                초기화
              </button>
              <SubmitButton disabledReason={disabledReason}>
                <Save className="h-4 w-4" aria-hidden="true" />
                저장
              </SubmitButton>
              <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="overflow-hidden rounded-md border border-[#d9e4f2] bg-white">
              <table className="min-w-[760px] w-full table-fixed text-left text-sm">
                <thead className="bg-[#f5f9ff] text-xs font-black text-[#10223d]">
                  <tr>
                    <th className="w-14 px-3 py-3 text-center">No</th>
                    <th className="w-[24%] px-3 py-3">화주코드</th>
                    <th className="w-[30%] px-3 py-3">화주명</th>
                    <th className="px-3 py-3">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-500">{index + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.client_code}
                          onPaste={(event) => handlePaste(event, index, "client_code")}
                          onChange={(event) => updateCell(index, "client_code", event.target.value)}
                          className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          aria-label={`${index + 1}행 화주코드`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.client_name}
                          onPaste={(event) => handlePaste(event, index, "client_name")}
                          onChange={(event) => updateCell(index, "client_name", event.target.value)}
                          className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          aria-label={`${index + 1}행 화주명`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.notes}
                          onPaste={(event) => handlePaste(event, index, "notes")}
                          onChange={(event) => updateCell(index, "notes", event.target.value)}
                          className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          aria-label={`${index + 1}행 비고`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setRows((current) => [...current, ...createEmptyClientImportRows(5)])}
                className="tool-button"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                행추가
              </button>
              <p className="text-xs font-semibold text-slate-500">
                저장 대상 {savableRows.length}건{incompleteRowNumbers.length > 0 ? ` · 미완성 ${incompleteRowNumbers.length}건` : ""}
              </p>
            </div>
            <div className="mt-3">
              <ActionMessage state={state} />
            </div>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}

export function UserForm({ departments }: { departments: Department[] }) {
  const [state, action] = useActionState(saveUserAction, null);
  const roles: { value: AppRole; label: string }[] = [
    { value: "admin", label: "관리자" },
    { value: "department_head", label: "부서장" },
    { value: "manager", label: "매니저" },
    { value: "client_owner", label: "화주담당자" }
  ];
  return (
    <form action={action} className="sketch-panel space-y-4 rounded-md p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          이메일
          <input name="email" type="email" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
        </label>
        <label className="text-sm">
          사번
          <input name="employee_no" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
        </label>
        <label className="text-sm">
          성함
          <input name="full_name" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          소속 부서
          <select name="department_id" className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3">
            <option value="">미지정</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.department_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          관리권한
          <select name="app_role" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3">
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input type="checkbox" name="invite" value="true" defaultChecked />
          초대 메일 발송
        </label>
      </div>
      <label className="block text-sm">
        비고
        <textarea name="notes" rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <input type="hidden" name="is_active" value="true" />
      <ActionMessage state={state} />
      <SubmitButton>사용자 저장</SubmitButton>
    </form>
  );
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function UserEditDialog({
  user,
  departments,
  onClose
}: {
  user: UserMasterValue;
  departments: Department[];
  onClose: () => void;
}) {
  const [state, action] = useActionState(saveUserAction, null);
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby={`user-edit-${user.id}`}>
        <form action={action} className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
          <input type="hidden" name="id" value={user.id} />
          <input type="hidden" name="invite" value="false" />
          <div className="flex items-start justify-between gap-4 border-b border-[#d9e4f2] px-5 py-4">
            <div>
              <h2 id={`user-edit-${user.id}`} className="text-lg font-black text-[#10223d]">사용자 수정</h2>
              <p className="mt-1 text-sm text-slate-500">{user.full_name} 사용자의 기본정보와 권한을 수정합니다.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid max-h-[66vh] gap-3 overflow-y-auto p-5 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              사번
              <input name="employee_no" defaultValue={user.employee_no} required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              성함
              <input name="full_name" defaultValue={user.full_name} required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              메일주소(아이디)
              <input name="email" type="email" defaultValue={user.email} required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              부서
              <select name="department_id" defaultValue={user.department_id ?? ""} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3">
                <option value="">미지정</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.department_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              관리권한
              <select name="app_role" defaultValue={user.app_role} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3">
                <option value="admin">관리자</option>
                <option value="department_head">부서장</option>
                <option value="manager">매니저</option>
                <option value="client_owner">화주담당자</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              사용여부
              <select name="is_active" defaultValue={String(user.is_active)} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3">
                <option value="true">사용</option>
                <option value="false">미사용</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              비고
              <textarea name="notes" defaultValue={user.notes ?? ""} rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <div className="md:col-span-2">
              <ActionMessage state={state} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#d9e4f2] px-5 py-4">
            <button type="button" onClick={onClose} className="tool-button">닫기</button>
            <SubmitButton>
              <Save className="h-4 w-4" aria-hidden="true" />
              저장
            </SubmitButton>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}

function UserPasswordResetDialog({ user, onClose }: { user: UserMasterValue; onClose: () => void }) {
  const [state, action] = useActionState(resetUserPasswordAction, null);
  const initialPassword = getInitialPassword(user.employee_no);
  const isAdjusted = isInitialPasswordAdjusted(user.employee_no);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby={`user-password-reset-${user.id}`}>
        <form action={action} className="w-full max-w-md overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
          <input type="hidden" name="user_id" value={user.id} />
          <div className="flex items-start justify-between gap-4 border-b border-[#d9e4f2] px-5 py-4">
            <div>
              <h2 id={`user-password-reset-${user.id}`} className="text-lg font-black text-[#10223d]">비밀번호 초기화</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">{user.full_name} · {user.employee_no}</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="p-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold leading-6 text-amber-900">
              비밀번호를 초기화 하시겠습니까? 초기화시 비밀번호는 사번과 동일합니다
              {isAdjusted ? (
                <p className="mt-2 border-t border-amber-200 pt-2 text-amber-950">
                  단, 6자리 미만 사번은 뒤에 0을 추가합니다. 이 계정의 초기 비밀번호는 {initialPassword}입니다.
                </p>
              ) : null}
            </div>
            <div className="mt-3">
              <ActionMessage state={state} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#d9e4f2] px-5 py-4">
            <button type="button" onClick={onClose} className="tool-button">취소</button>
            <SubmitButton variant="danger">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              초기화
            </SubmitButton>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}

export function UserMasterControls({
  departments,
  users,
  filters,
  registrationRequests = [],
  canManageUsers = true
}: {
  departments: Department[];
  users: UserMasterValue[];
  filters: { q?: string; department_id?: string };
  registrationRequests?: UserRegistrationRequestValue[];
  canManageUsers?: boolean;
}) {
  const [checkedUserIds, setCheckedUserIds] = useState<string[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [passwordResetUserId, setPasswordResetUserId] = useState<string | null>(null);
  const [deleteState, deleteAction] = useActionState(deleteUsersAction, null);
  const [approveState, approveAction] = useActionState(approveUserRegistrationRequestAction, null);
  const [rejectState, rejectAction] = useActionState(rejectUserRegistrationRequestAction, null);
  const selectedUsers = users.filter((user) => checkedUserIds.includes(user.id));
  const editingUser = users.find((user) => user.id === editingUserId) ?? null;
  const passwordResetUser = users.find((user) => user.id === passwordResetUserId) ?? null;
  const allChecked = users.length > 0 && selectedUsers.length === users.length;

  function toggleUser(userId: string, checked: boolean) {
    setCheckedUserIds((current) => checked ? Array.from(new Set([...current, userId])) : current.filter((id) => id !== userId));
  }

  function toggleAll(checked: boolean) {
    setCheckedUserIds(checked ? users.map((user) => user.id) : []);
  }

  return (
    <section className="sketch-panel space-y-4 rounded-md p-4">
      <div className="glass-fieldset p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-doodle-title">사용자등록 요청</h2>
          <span className="section-chip">{registrationRequests.length}건 대기</span>
        </div>
        <ActionMessage state={approveState ?? rejectState} />
        {registrationRequests.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[#b7cbe6] bg-white/82 px-4 py-6 text-center text-sm font-bold text-slate-500">
            승인 대기 중인 사용자등록 요청이 없습니다.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-[#d9e4f2] bg-white/90">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-[#f5f9ff] text-xs font-black text-[#10223d]">
                <tr>
                  <th className="px-3 py-3">사번</th>
                  <th className="px-3 py-3">성함</th>
                  <th className="px-3 py-3">메일주소(아이디)</th>
                  <th className="px-3 py-3">소속부서</th>
                  <th className="px-3 py-3">요청일</th>
                  <th className="px-3 py-3">승인처리</th>
                </tr>
              </thead>
              <tbody>
                {registrationRequests.map((request) => (
                  <tr key={request.id} className="border-t border-slate-100">
                    <td className="px-3 py-3">{request.employee_no}</td>
                    <td className="px-3 py-3 font-black text-[#10223d]">{request.full_name}</td>
                    <td className="px-3 py-3 text-slate-700">{request.email}</td>
                    <td className="px-3 py-3">{request.departments?.department_name ?? "-"}</td>
                    <td className="px-3 py-3">{formatDateOnly(request.requested_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={approveAction}>
                          <input type="hidden" name="request_id" value={request.id} />
                          <SubmitButton>
                            <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
                            승인
                          </SubmitButton>
                        </form>
                        <form action={rejectAction}>
                          <input type="hidden" name="request_id" value={request.id} />
                          <SubmitButton variant="danger">
                            <X className="h-4 w-4" aria-hidden="true" />
                            반려
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <form className="grid w-full gap-2 md:w-auto md:grid-cols-[220px_180px_auto]">
          <input name="q" defaultValue={filters.q ?? ""} placeholder="성함 검색" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
          <select name="department_id" defaultValue={filters.department_id ?? ""} className="h-10 rounded-md border border-slate-300 px-3 text-sm">
            <option value="">전체 부서</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.department_name}
              </option>
            ))}
          </select>
          <button className="tool-button tool-button-primary">
            <Search className="h-4 w-4" aria-hidden="true" />
            조회
          </button>
        </form>
        {canManageUsers ? (
          <>
            <form action={deleteAction}>
              <input type="hidden" name="user_ids" value={checkedUserIds.join(",")} />
              <SubmitButton
                variant="danger"
                disabledReason={checkedUserIds.length === 0 ? "삭제할 사용자를 선택하세요." : undefined}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                삭제
              </SubmitButton>
            </form>
            <button
              type="button"
              onClick={() => selectedUsers[0] ? setEditingUserId(selectedUsers[0].id) : undefined}
              disabled={selectedUsers.length !== 1}
              title={selectedUsers.length !== 1 ? "수정할 사용자를 1명만 선택하세요." : undefined}
              className="focus-ring tool-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              수정
            </button>
          </>
        ) : null}
      </div>

      <ActionMessage state={deleteState} />

      {users.length === 0 ? (
        <EmptyState title="사용자 정보가 없습니다." />
      ) : (
        <TableShell>
          <table className="table-sticky min-w-[1100px] w-full text-left text-sm">
            <thead>
              <tr>
                <th className="w-12 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(event) => toggleAll(event.target.checked)}
                    aria-label="전체 사용자 선택"
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                <th className="px-3 py-3">사번</th>
                <th className="px-3 py-3">성함</th>
                <th className="px-3 py-3">메일주소(아이디)</th>
                <th className="px-3 py-3">부서</th>
                <th className="px-3 py-3">관리권한</th>
                <th className="px-3 py-3">사용여부</th>
                {canManageUsers ? <th className="px-3 py-3 text-center">비밀번호 초기화</th> : null}
                <th className="px-3 py-3">확인일</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={checkedUserIds.includes(user.id)}
                      onChange={(event) => toggleUser(user.id, event.target.checked)}
                      aria-label={`${user.full_name} 선택`}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-3">{user.employee_no}</td>
                  <td className="px-3 py-3 font-black text-[#10223d]">{user.full_name}</td>
                  <td className="px-3 py-3 text-slate-700">{user.email}</td>
                  <td className="px-3 py-3">{user.departments?.department_name ?? "-"}</td>
                  <td className="px-3 py-3">{roleLabel(user.app_role)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${user.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      {user.is_active ? "사용" : "미사용"}
                    </span>
                  </td>
                  {canManageUsers ? (
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setPasswordResetUserId(user.id)}
                        className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-800 transition hover:bg-amber-100"
                        aria-label={`${user.full_name} 비밀번호 초기화`}
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        초기화
                      </button>
                    </td>
                  ) : null}
                  <td className="px-3 py-3">{formatDateOnly(user.updated_at || user.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {editingUser ? <UserEditDialog user={editingUser} departments={departments} onClose={() => setEditingUserId(null)} /> : null}
      {passwordResetUser ? <UserPasswordResetDialog user={passwordResetUser} onClose={() => setPasswordResetUserId(null)} /> : null}
    </section>
  );
}

export function ClientAssignmentForm({
  clientId,
  users,
  assignments
}: {
  clientId: string;
  users: AssignmentUser[];
  assignments: AssignmentValue[];
}) {
  const [state, action] = useActionState(saveClientAssignmentsAction, null);
  const [selected, setSelected] = useState(assignments.map((assignment) => assignment.user_id));
  const [primary, setPrimary] = useState(assignments.find((assignment) => assignment.is_primary)?.user_id ?? selected[0] ?? "");
  return (
    <details className="glass-row p-3">
      <summary className="cursor-pointer text-sm font-bold text-[#075be8]">담당자 등록</summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="user_ids" value={selected.join(",")} />
        <input type="hidden" name="primary_user_id" value={primary} />
        <div className="grid gap-2 md:grid-cols-2">
          {users.map((user) => {
            const checked = selected.includes(user.id);
            return (
              <label key={user.id} className="glass-row flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked ? [...selected, user.id] : selected.filter((id) => id !== user.id);
                      setSelected(next);
                      if (!next.includes(primary)) {
                        setPrimary(next[0] ?? "");
                      }
                    }}
                  />{" "}
                  {user.full_name}
                </span>
                <input
                  type="radio"
                  name={`primary-${clientId}`}
                  checked={primary === user.id}
                  disabled={!checked}
                  onChange={() => setPrimary(user.id)}
                  aria-label={`${user.full_name} 대표 담당자 지정`}
                />
              </label>
            );
          })}
        </div>
        <SubmitButton variant="secondary">담당자 저장</SubmitButton>
        <ActionMessage state={state} />
      </form>
    </details>
  );
}
