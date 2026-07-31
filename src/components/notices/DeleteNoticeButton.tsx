"use client";

import { useActionState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteNoticeAction } from "@/actions/notices";
import { ActionMessage } from "@/components/common/ActionMessage";
import { SubmitButton } from "@/components/common/SubmitButton";

export function DeleteNoticeButton({ id }: { id: string }) {
  const router = useRouter();
  const [state, action] = useActionState(deleteNoticeAction, null);
  useEffect(() => {
    if (state?.ok) {
      router.replace("/notices");
      router.refresh();
    }
  }, [router, state]);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("공지사항을 삭제하시겠습니까?")) {
          event.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="danger">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        삭제
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
