"use client";

import { useActionState } from "react";
import { transitionClientReportAction, transitionDepartmentSubmissionAction } from "@/actions/reports";
import { ActionMessage } from "@/components/common/ActionMessage";
import { SubmitButton } from "@/components/common/SubmitButton";
import type { ClientReportStatus, DepartmentSubmissionStatus } from "@/types/enums";

export function ClientReportTransitionForm({
  reportId,
  nextStatus,
  label
}: {
  reportId: string;
  nextStatus: ClientReportStatus;
  label: string;
}) {
  const [state, action] = useActionState(transitionClientReportAction, null);
  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={(event) => {
        if (!window.confirm(`${label} 처리하시겠습니까?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="report_id" value={reportId} />
      <input type="hidden" name="next_status" value={nextStatus} />
      {nextStatus === "rejected" ? (
        <textarea name="comment" required rows={2} placeholder="반려사유" className="w-full rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-3 py-2 text-sm text-[#012241]" />
      ) : (
        <input type="hidden" name="comment" value={label} />
      )}
      <SubmitButton variant={nextStatus === "rejected" ? "danger" : "secondary"}>{label}</SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function DepartmentTransitionForm({
  submissionId,
  nextStatus,
  label
}: {
  submissionId: string;
  nextStatus: DepartmentSubmissionStatus;
  label: string;
}) {
  const [state, action] = useActionState(transitionDepartmentSubmissionAction, null);
  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={(event) => {
        if (!window.confirm(`${label} 처리하시겠습니까?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="next_status" value={nextStatus} />
      {nextStatus === "division_rejected" ? (
        <textarea name="comment" required rows={2} placeholder="반려사유" className="w-full rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-3 py-2 text-sm text-[#012241]" />
      ) : (
        <input type="hidden" name="comment" value={label} />
      )}
      <SubmitButton variant={nextStatus === "division_rejected" ? "danger" : "secondary"}>{label}</SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
