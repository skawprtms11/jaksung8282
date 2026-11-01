"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Copy, KeyRound, Loader2, PackagePlus, Pencil, RotateCcw, Save, Search, Trash2, UserRoundCheck, X } from "lucide-react";
import {
  approveUserRegistrationRequestAction,
  deleteUsersAction,
  rejectUserRegistrationRequestAction,
  resetUserPasswordAction,
  revokeUserSessionsAction,
  saveClientAssignmentsAction,
  saveDepartmentClientAssignmentsAction,
  saveDepartmentHeadAction,
  saveUserAction
} from "@/actions/masters";
import { ActionMessage } from "@/components/common/ActionMessage";
import { EmptyState } from "@/components/common/EmptyState";
import { SubmitButton } from "@/components/common/SubmitButton";
import { TableShell } from "@/components/common/TableShell";
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
  const [headDepartment, setHeadDepartment] = useState<DepartmentFormValue | null>(null);

  return (
    <section className="space-y-3">
      <TableShell>
        <table className="table-sticky min-w-[700px] w-full text-left text-sm">
          <thead>
            <tr>
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
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-[#007050]" />
                      {department.department_name}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2">
                      {headNames.join(", ") || "-"}
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setHeadDepartment(department)}
                          className="icon-tool-button"
                          aria-label={`${department.department_name} 부서장 지정`}
                          title="부서장 지정"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </span>
                  </td>
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

      {headDepartment ? (
        <DepartmentHeadDialog
          department={headDepartment}
          users={headCandidates}
          onClose={() => setHeadDepartment(null)}
        />
      ) : null}
    </section>
  );
}

function DepartmentHeadDialog({
  department,
  users,
  onClose
}: {
  department: DepartmentFormValue;
  users: AssignmentUser[];
  onClose: () => void;
}) {
  const [state, action] = useActionState(saveDepartmentHeadAction, null);
  const headCandidates = users.filter((user) => user.app_role === "department_head" || user.app_role === "manager");
  const currentHead = headCandidates.find((user) => user.department_id === department.id && user.app_role === "department_head");

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="department-head-title">
        <form action={action} className="w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
          <input type="hidden" name="department_id" value={department.id} />
          <div className="flex items-start justify-between gap-4 border-b border-[#e4dac9] px-5 py-4">
            <div>
              <h2 id="department-head-title" className="text-lg font-black text-[#012241]">부서장 지정</h2>
              <p className="mt-1 text-sm text-slate-500">{department.department_name} · 부서명·비고·사용여부는 현황관리에서 수정합니다.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-3 p-5">
            <label className="block text-sm font-black text-[#012241]">
              부서장
              <select name="department_head_id" required defaultValue={currentHead?.id ?? ""} className="mt-1 h-11 w-full rounded-2xl border border-[#e4dac9] px-3 text-sm font-bold outline-none focus:border-[#007050]">
                <option value="">선택</option>
                {headCandidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name}
                  </option>
                ))}
              </select>
            </label>
            <ActionMessage state={state} />
          </div>
          <div className="flex justify-end gap-2 border-t border-[#e4dac9] px-5 py-4">
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
  const [assignmentClientId, setAssignmentClientId] = useState<string | null>(null);
  const registeredClientIds = departmentClientLinks
    .filter((link) => link.department_id === department.id && link.is_active)
    .map((link) => link.client_id);
  const registeredClients = clients.filter((client) => registeredClientIds.includes(client.id));
  const departmentUsers = users.filter((user) => user.department_id === department.id && user.app_role === "client_owner");
  const assignmentClient = registeredClients.find((client) => client.id === assignmentClientId) ?? null;

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="icon-tool-button" aria-label={`${department.department_name} 등록 화주`}>
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen ? (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby={`client-manager-${department.id}`}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e4dac9] px-5 py-4">
              <div>
                <h2 id={`client-manager-${department.id}`} className="text-lg font-black text-[#012241]">{department.department_name} 등록 화주</h2>
                <p className="mt-1 text-sm text-slate-500">화주 등록·해제는 현황관리(now) 부서마스터에서 합니다. 여기서는 화주담당자만 지정합니다.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="icon-tool-button" aria-label="팝업 닫기">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <section className="max-h-[76vh] overflow-y-auto p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-black text-[#012241]">등록된 화주목록</h3>
                <span className="rounded-full bg-[#fbf8f2] px-3 py-1 text-xs font-bold text-slate-500">{registeredClients.length}건</span>
              </div>
              {registeredClients.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[#d3c6b0] bg-white/80 px-4 py-10 text-center text-sm font-semibold text-slate-500">현황관리에 등록된 화주가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {registeredClients.map((client) => {
                    const assignedUsers = assignments
                      .filter((assignment) => assignment.department_id === department.id && assignment.client_id === client.id && assignment.is_active)
                      .map((assignment) => users.find((user) => user.id === assignment.user_id)?.full_name)
                      .filter(Boolean);
                    return (
                      <div
                        key={client.id}
                        className="flex w-full items-center gap-3 rounded-2xl border border-[#e4dac9] bg-white/86 px-3 py-3 text-left text-sm transition hover:border-[#007050]/30 hover:bg-white"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-black text-[#012241]">{client.client_name}</span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{client.client_code}</span>
                          <span className="mt-2 block truncate text-xs text-slate-500">
                            {assignedUsers.length > 0 ? assignedUsers.join(", ") : "담당자 미지정"}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setAssignmentClientId(client.id)}
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
      <form action={action} className="w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.24)]">
        <input type="hidden" name="department_id" value={department.id} />
        <input type="hidden" name="client_id" value={client.id} />
        <input type="hidden" name="user_ids" value={selectedUserIds.join(",")} />
        <input type="hidden" name="primary_user_id" value={primaryUserId} />
        <div className="flex items-start justify-between gap-4 border-b border-[#e4dac9] px-5 py-4">
          <div>
            <h2 id={`assignment-${client.id}`} className="text-lg font-black text-[#012241]">담당자 선정</h2>
            <p className="mt-1 text-sm text-slate-500">{department.department_name} · {client.client_name}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-5">
          {users.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#d3c6b0] bg-[#fbf8f2] px-4 py-10 text-center text-sm font-semibold text-slate-500">
              해당 부서에 등록 가능한 화주담당자가 없습니다.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {users.map((user) => {
                const checked = selectedUserIds.includes(user.id);
                return (
                  <label key={user.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-3 py-3 text-sm">
                    <span className="min-w-0 flex-1 font-bold text-[#012241]">
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
        <div className="flex justify-end gap-2 border-t border-[#e4dac9] px-5 py-4">
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
        <form action={action} className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
          <input type="hidden" name="id" value={user.id} />
          <input type="hidden" name="invite" value="false" />
          <div className="flex items-start justify-between gap-4 border-b border-[#e4dac9] px-5 py-4">
            <div>
              <h2 id={`user-edit-${user.id}`} className="text-lg font-black text-[#012241]">사용자 수정</h2>
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
          <div className="flex justify-end gap-2 border-t border-[#e4dac9] px-5 py-4">
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
  const [copyMessage, setCopyMessage] = useState("");
  const temporaryPassword = state?.ok ? state.data?.temporaryPassword ?? "" : "";
  const [revokeState, revokeAction, isRevoking] = useActionState(revokeUserSessionsAction, null);
  // 재시도로 세션 종료에 성공하면 경고 대신 완료 메시지를 보여준다.
  const sessionRevokeFailed = state?.ok ? Boolean(state.data?.sessionRevokeFailed) && !revokeState?.ok : false;

  async function copyTemporaryPassword() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopyMessage("복사했습니다.");
    } catch {
      setCopyMessage("복사하지 못했습니다. 직접 선택해 복사하세요.");
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby={`user-password-reset-${user.id}`}>
        <form action={action} className="w-full max-w-md overflow-hidden rounded-[1.5rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
          <input type="hidden" name="user_id" value={user.id} />
          <div className="flex items-start justify-between gap-4 border-b border-[#e4dac9] px-5 py-4">
            <div>
              <h2 id={`user-password-reset-${user.id}`} className="text-lg font-black text-[#012241]">비밀번호 초기화</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">{user.full_name} · {user.employee_no}</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="p-5">
            {temporaryPassword ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-bold leading-6 text-emerald-900">
                <p>임시 비밀번호</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 select-all rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-base tracking-wider text-[#012241]">
                    {temporaryPassword}
                  </code>
                  <button type="button" onClick={copyTemporaryPassword} className="icon-tool-button" aria-label="임시 비밀번호 복사">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {copyMessage ? <p className="mt-1 text-xs text-emerald-700">{copyMessage}</p> : null}
                <p className="mt-2 border-t border-emerald-200 pt-2 text-emerald-950">
                  이 창을 닫으면 임시 비밀번호를 다시 볼 수 없습니다. 사용자에게 안전한 경로로 전달하세요. 사용자는 첫 로그인 때 새 비밀번호로 변경해야 합니다.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold leading-6 text-amber-900">
                비밀번호를 초기화 하시겠습니까? 무작위 임시 비밀번호가 발급되며, 사용자는 첫 로그인 때 비밀번호를 변경해야 합니다.
              </div>
            )}
            {sessionRevokeFailed ? (
              <div role="alert" className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900">
                <p>경고: 비밀번호는 초기화됐지만 이 사용자의 기존 로그인 세션을 종료하지 못했습니다. 세션 종료를 다시 시도하고, 계속 실패하면 시스템 담당자에게 요청하세요.</p>
                <button type="submit" formAction={revokeAction} disabled={isRevoking} className="focus-ring tool-button mt-2 disabled:cursor-not-allowed disabled:opacity-50">
                  {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                  세션 종료 다시 시도
                </button>
                {revokeState && !revokeState.ok ? <p className="mt-2 text-red-700">{revokeState.message}</p> : null}
              </div>
            ) : (
              <div className="mt-3">
                <ActionMessage state={revokeState?.ok ? revokeState : state} />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-[#e4dac9] px-5 py-4">
            <button type="button" onClick={onClose} className="tool-button">{temporaryPassword ? "닫기" : "취소"}</button>
            {temporaryPassword ? null : (
              <SubmitButton variant="danger">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                초기화
              </SubmitButton>
            )}
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
          <div className="mt-3 rounded-2xl border border-dashed border-[#d3c6b0] bg-white/82 px-4 py-6 text-center text-sm font-bold text-slate-500">
            승인 대기 중인 사용자등록 요청이 없습니다.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-[#e4dac9] bg-white/90">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-[#faf6ef] text-xs font-black text-[#012241]">
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
                    <td className="px-3 py-3 font-black text-[#012241]">{request.full_name}</td>
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
                  <td className="px-3 py-3 font-black text-[#012241]">{user.full_name}</td>
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
      <summary className="cursor-pointer text-sm font-bold text-[#007050]">담당자 등록</summary>
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
