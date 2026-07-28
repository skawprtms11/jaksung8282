"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus, X } from "lucide-react";
import { requestUserRegistrationAction, signInAction } from "@/actions/auth";
import { ActionMessage } from "@/components/common/ActionMessage";
import { SubmitButton } from "@/components/common/SubmitButton";

type DepartmentOption = { id: string; department_name: string };

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

function readSavedLoginEmail() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem("tpl_saved_login_email") ?? "";
}

export function LoginForm({ redirectTo, departments }: { redirectTo: string; departments: DepartmentOption[] }) {
  const [state, action] = useActionState(signInAction, null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [email, setEmail] = useState(readSavedLoginEmail);
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(readSavedLoginEmail()));

  function handleLoginSubmit() {
    if (rememberEmail && email.trim()) {
      window.localStorage.setItem("tpl_saved_login_email", email.trim());
      return;
    }
    window.localStorage.removeItem("tpl_saved_login_email");
  }

  return (
    <>
      <form action={action} onSubmit={handleLoginSubmit} className="space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 h-12 w-full rounded-2xl border border-[#d9e4f2] bg-[#f8fbff] px-4 text-sm text-[#10223d] focus:border-[#075be8] focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 h-12 w-full rounded-2xl border border-[#d9e4f2] bg-[#f8fbff] px-4 text-sm text-[#10223d] focus:border-[#075be8] focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input
            type="checkbox"
            checked={rememberEmail}
            onChange={(event) => setRememberEmail(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          아이디 저장
        </label>
        <ActionMessage state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton>로그인</SubmitButton>
          <button type="button" onClick={() => setIsRegisterOpen(true)} className="tool-button" aria-label="사용자 가입 요청">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            사용자 가입
          </button>
        </div>
        <Link href="/reset-password" className="block text-sm font-bold text-[#075be8]">
          비밀번호 재설정
        </Link>
      </form>

      {isRegisterOpen ? (
        <RegistrationRequestDialog departments={departments} onClose={() => setIsRegisterOpen(false)} />
      ) : null}
    </>
  );
}

function RegistrationRequestDialog({
  departments,
  onClose
}: {
  departments: DepartmentOption[];
  onClose: () => void;
}) {
  const [state, action] = useActionState(requestUserRegistrationAction, null);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="registration-request-title">
        <form action={action} className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-[#d9e4f2] bg-white shadow-[0_28px_80px_rgba(16,34,61,0.34)]">
          <div className="flex items-start justify-between gap-4 border-b border-[#d9e4f2] px-5 py-4">
            <div>
              <h2 id="registration-request-title" className="text-lg font-black text-[#10223d]">사용자 가입 요청</h2>
              <p className="mt-1 text-sm text-slate-500">회사 이메일과 소속 부서를 입력하면 승인 후 사용할 수 있습니다.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid max-h-[64vh] gap-3 overflow-y-auto p-5 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              아이디
              <input name="email" type="email" required placeholder="회사 이메일주소" className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              비밀번호
              <input name="password" type="password" required minLength={8} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              비밀번호 확인
              <input name="passwordConfirm" type="password" required minLength={8} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              사번
              <input name="employee_no" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              성함
              <input name="full_name" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              소속부서
              <select name="department_id" required className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3">
                <option value="">부서를 선택하세요</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.department_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="md:col-span-2">
              <ActionMessage state={state} />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#d9e4f2] px-5 py-4">
            <button type="button" onClick={onClose} className="tool-button">닫기</button>
            <SubmitButton>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              사용자등록 요청
            </SubmitButton>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}
