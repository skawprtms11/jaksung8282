"use client";

import { useActionState } from "react";
import { resetPasswordAction, updatePasswordAction } from "@/actions/auth";
import { ActionMessage } from "@/components/common/ActionMessage";
import { SubmitButton } from "@/components/common/SubmitButton";

// request: 재설정 메일 요청, recovery: 메일 링크 세션(현재 비밀번호 불필요),
// forced: 관리자 초기화 후 첫 로그인(임시 비밀번호 필요), change: 일반 로그인 세션(현재 비밀번호 필요)
export type ResetPasswordMode = "request" | "recovery" | "forced" | "change";

const inputClassName =
  "mt-1 h-12 w-full rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-4 text-sm text-[#012241] focus:border-[#007050] focus:outline-none";

export function ResetPasswordForm({ mode }: { mode: ResetPasswordMode }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  const [updateState, updateAction] = useActionState(updatePasswordAction, null);

  if (mode !== "request") {
    return (
      <form action={updateAction} className="space-y-4">
        {mode === "change" || mode === "forced" ? (
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700">
              {mode === "forced" ? "관리자에게 받은 임시 비밀번호" : "현재 비밀번호"}
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-describedby={mode === "forced" ? "currentPasswordHelp" : undefined}
              required
              className={inputClassName}
            />
            {mode === "forced" ? (
              <p id="currentPasswordHelp" className="mt-1 text-xs text-slate-500">
                본인 확인을 위해 방금 로그인할 때 입력한 임시 비밀번호를 다시 입력하세요.
              </p>
            ) : null}
          </div>
        ) : null}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            새 비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="passwordConfirm" className="block text-sm font-medium text-slate-700">
            새 비밀번호 확인
          </label>
          <input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            className={inputClassName}
          />
        </div>
        <ActionMessage state={updateState} />
        <SubmitButton>비밀번호 변경</SubmitButton>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          이메일
        </label>
        <input id="email" name="email" type="email" required className={inputClassName} />
      </div>
      <ActionMessage state={state} />
      <SubmitButton>재설정 메일 발송</SubmitButton>
    </form>
  );
}
