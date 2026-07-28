"use client";

import { useActionState } from "react";
import { resetPasswordAction, updatePasswordAction } from "@/actions/auth";
import { ActionMessage } from "@/components/common/ActionMessage";
import { SubmitButton } from "@/components/common/SubmitButton";

export function ResetPasswordForm({ canUpdatePassword }: { canUpdatePassword: boolean }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  const [updateState, updateAction] = useActionState(updatePasswordAction, null);

  if (canUpdatePassword) {
    return (
      <form action={updateAction} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            새 비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            className="mt-1 h-12 w-full rounded-2xl border border-[#d9e4f2] bg-[#f8fbff] px-4 text-sm text-[#10223d] focus:border-[#075be8] focus:outline-none"
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
            minLength={8}
            required
            className="mt-1 h-12 w-full rounded-2xl border border-[#d9e4f2] bg-[#f8fbff] px-4 text-sm text-[#10223d] focus:border-[#075be8] focus:outline-none"
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
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mt-1 h-12 w-full rounded-2xl border border-[#d9e4f2] bg-[#f8fbff] px-4 text-sm text-[#10223d] focus:border-[#075be8] focus:outline-none"
        />
      </div>
      <ActionMessage state={state} />
      <SubmitButton>재설정 메일 발송</SubmitButton>
    </form>
  );
}
