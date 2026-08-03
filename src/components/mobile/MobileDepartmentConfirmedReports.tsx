import { BadgeCheck, Boxes, ChevronDown, ClipboardCheck } from "lucide-react";
import type { SavedClientReportRow } from "@/actions/reports";
import { volumeTypeLabels } from "@/lib/utils/labels";
import { cn } from "@/lib/utils/cn";

const importanceLabels = { very_high: "매우높음", high: "높음", medium: "보통", low: "낮음" } as const;
type Client = { id: string; client_name: string };

function importanceIconClassName(importance: keyof typeof importanceLabels) {
  if (importance === "very_high") return "border-red-100 bg-red-50 text-red-600";
  if (importance === "high") return "border-orange-100 bg-orange-50 text-orange-500";
  if (importance === "medium") return "border-emerald-100 bg-emerald-50 text-emerald-600";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export function MobileDepartmentConfirmedReports({ clients, reports }: { clients: Client[]; reports: SavedClientReportRow[] }) {
  const reportByClient = new Map(reports.map((report) => [report.clientId, report]));
  const completedCount = clients.filter((client) => {
    const status = reportByClient.get(client.id)?.status;
    return status === "submitted" || status === "approved";
  }).length;

  return (
    <section className="mt-3 overflow-hidden rounded-md border border-[#cddbee] bg-white">
      <header className="flex min-h-11 items-center gap-2 border-b border-[#e5eef9] bg-[#f5f9ff] px-3 py-2">
        <ClipboardCheck className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
        <h2 className="text-[13px] font-black text-[#10223d]">확정된 화주자료</h2>
        <span className="ml-auto text-[11px] font-black text-slate-600">{completedCount}/{clients.length}</span>
      </header>
      {clients.length ? (
        <div className="divide-y divide-slate-200">
          {clients.map((client) => {
            const report = reportByClient.get(client.id);
            const isConfirmed = report?.status === "submitted" || report?.status === "approved";
            if (!report || !isConfirmed) {
              return (
                <div key={client.id} className="flex min-h-12 items-center gap-2 px-3 py-3">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-black text-[#10223d]">{client.client_name}</h3>
                  <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-500">미확정</span>
                </div>
              );
            }
            return (
              <details key={client.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3">
                  <div className="min-w-0"><h3 className="truncate text-sm font-black text-[#10223d]">{client.client_name}</h3><p className="mt-0.5 text-[10px] font-bold text-slate-400">{report.weekLabel}</p></div>
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700"><BadgeCheck className="h-3 w-3" aria-hidden="true" />확정</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="border-t border-slate-100 px-3 pb-3">
                  <ConfirmedItemSection title="금주 실시사항" rows={report.currentItems} />
                  <ConfirmedItemSection title="차주 예정사항" rows={report.nextItems} />
                  <div className="mt-3 border-t border-slate-100 pt-2">
                    <p className="flex items-center gap-1 text-[11px] font-black text-slate-500"><Boxes className="h-3.5 w-3.5" aria-hidden="true" />물동량</p>
                    {report.volumes.length ? <div className="mt-1 space-y-1">{report.volumes.map((volume, index) => <p key={`${volume.volumeType}-${index}`} className="text-xs font-bold text-slate-700">{volumeTypeLabels[volume.volumeType]} {volume.quantity.toLocaleString("ko-KR")} {volume.customUnit || volume.unit}</p>)}</div> : <p className="mt-1 text-[11px] text-slate-400">등록 없음</p>}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="px-3 py-7 text-center text-xs font-bold text-slate-400">소속된 화주가 없습니다.</p>
      )}
    </section>
  );
}

function ConfirmedItemSection({ title, rows }: { title: string; rows: SavedClientReportRow["currentItems"] }) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <p className="text-[11px] font-black text-slate-500">{title}</p>
      {rows.length ? <div className="mt-1 space-y-2">{rows.map((row, index) => (
        <div key={`${row.title}-${index}`} className="flex gap-2">
          <span className={cn("mt-0.5 inline-flex h-7 min-w-11 shrink-0 items-center justify-center rounded-xl border px-2 text-[10px] font-black", importanceIconClassName(row.importance))} title={`중요도 ${importanceLabels[row.importance]}`}>{row.categoryName}</span>
          <div className="min-w-0"><p className="break-words text-xs font-black text-[#10223d]">{row.title}</p><p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600">{row.content}</p></div>
        </div>
      ))}</div> : <p className="mt-1 text-[11px] text-slate-400">등록 없음</p>}
    </div>
  );
}
