import type { ClientReportStatus, DepartmentSubmissionStatus, Importance } from "@/types/enums";
import { cn } from "@/lib/utils/cn";

type StatusTone = "green" | "blue" | "amber" | "pink";

const toneDotClassName: Record<StatusTone, string> = {
  green: "u-dot-green",
  blue: "u-dot-blue",
  amber: "u-dot-amber",
  pink: "u-dot-pink"
};

const clientStatus: Record<ClientReportStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "저장", tone: "amber" },
  submitted: { label: "확정", tone: "blue" },
  approved: { label: "승인", tone: "green" },
  rejected: { label: "반려", tone: "pink" }
};

const departmentStatus: Record<DepartmentSubmissionStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "작성 중", tone: "amber" },
  submitted_to_division: { label: "사업부 검토", tone: "blue" },
  division_approved: { label: "사업부 승인", tone: "green" },
  division_rejected: { label: "사업부 반려", tone: "pink" }
};

const importance: Record<Importance, { label: string; tone: StatusTone }> = {
  very_high: { label: "매우높음", tone: "pink" },
  high: { label: "높음", tone: "amber" },
  medium: { label: "보통", tone: "green" },
  low: { label: "낮음", tone: "blue" }
};

export function StatusBadge({
  type,
  value
}: {
  type: "client" | "department" | "importance";
  value: ClientReportStatus | DepartmentSubmissionStatus | Importance;
}) {
  const item =
    type === "client"
      ? clientStatus[value as ClientReportStatus]
      : type === "department"
        ? departmentStatus[value as DepartmentSubmissionStatus]
        : importance[value as Importance];
  return (
    <span className="inline-flex items-center gap-2 text-xs font-bold text-[#012241]">
      <span className={cn("u-dot", toneDotClassName[item.tone])} aria-hidden="true" />
      {item.label}
    </span>
  );
}
