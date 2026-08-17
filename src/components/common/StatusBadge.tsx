import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDashed,
  RotateCcw,
  Send,
  ShieldCheck
} from "lucide-react";
import type { ClientReportStatus, DepartmentSubmissionStatus, Importance } from "@/types/enums";
import { cn } from "@/lib/utils/cn";

const clientStatus: Record<ClientReportStatus, { label: string; className: string; icon: typeof Circle }> = {
  draft: { label: "저장", className: "border-slate-200 bg-slate-50 text-slate-700", icon: CircleDashed },
  submitted: { label: "확정", className: "border-blue-200 bg-blue-50 text-blue-700", icon: Send },
  approved: { label: "승인", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "반려", className: "border-rose-200 bg-rose-50 text-rose-700", icon: AlertTriangle }
};

const departmentStatus: Record<DepartmentSubmissionStatus, { label: string; className: string; icon: typeof Circle }> = {
  draft: { label: "작성 중", className: "border-slate-200 bg-slate-50 text-slate-700", icon: CircleDashed },
  submitted_to_division: { label: "사업부 검토", className: "border-blue-200 bg-blue-50 text-blue-700", icon: Send },
  division_approved: { label: "사업부 승인", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: ShieldCheck },
  division_rejected: { label: "사업부 반려", className: "border-rose-200 bg-rose-50 text-rose-700", icon: RotateCcw }
};

const importance: Record<Importance, { label: string; className: string; icon: typeof Circle }> = {
  very_high: { label: "매우높음", className: "border-red-200 bg-red-50 text-red-700", icon: AlertTriangle },
  high: { label: "높음", className: "border-orange-200 bg-orange-50 text-orange-700", icon: AlertTriangle },
  medium: { label: "보통", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: Circle },
  low: { label: "낮음", className: "border-slate-200 bg-slate-50 text-slate-600", icon: CircleDashed }
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
  const Icon = item.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold", item.className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {item.label}
    </span>
  );
}
