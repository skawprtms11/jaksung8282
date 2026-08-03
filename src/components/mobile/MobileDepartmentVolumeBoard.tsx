import { ArrowDownToLine, ArrowUpFromLine, Sigma } from "lucide-react";
import type { SavedClientReportRow } from "@/actions/reports";
import { volumeUnitLabels } from "@/lib/utils/labels";

type Client = { id: string; client_name: string };
type VolumeMode = "inbound" | "outbound" | "total";

function unitLabel(volume: SavedClientReportRow["volumes"][number]) {
  return volume.unit === "etc" && volume.customUnit?.trim()
    ? volume.customUnit.trim()
    : volumeUnitLabels[volume.unit];
}

function summarizeVolumes(volumes: SavedClientReportRow["volumes"], mode: VolumeMode) {
  const totals = new Map<string, number>();
  volumes.forEach((volume) => {
    if (volume.volumeType !== "inbound" && volume.volumeType !== "outbound") return;
    if (mode !== "total" && volume.volumeType !== mode) return;
    const unit = unitLabel(volume);
    totals.set(unit, (totals.get(unit) ?? 0) + Number(volume.quantity));
  });
  return Array.from(totals.entries())
    .filter(([, quantity]) => quantity > 0)
    .map(([unit, quantity]) => `${quantity.toLocaleString("ko-KR")}${unit}`);
}

function VolumeValue({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-slate-400">-</span>;
  return <>{values.map((value) => <span key={value} className="block break-words">{value}</span>)}</>;
}

export function MobileDepartmentVolumeBoard({ clients, reports }: { clients: Client[]; reports: SavedClientReportRow[] }) {
  const reportsByClient = new Map<string, SavedClientReportRow[]>();
  reports.forEach((report) => {
    const current = reportsByClient.get(report.clientId) ?? [];
    current.push(report);
    reportsByClient.set(report.clientId, current);
  });
  const allVolumes = reports.flatMap((report) => report.volumes);
  const summaries = [
    { label: "입고", values: summarizeVolumes(allVolumes, "inbound"), icon: ArrowDownToLine, className: "text-emerald-700 bg-emerald-50" },
    { label: "출고", values: summarizeVolumes(allVolumes, "outbound"), icon: ArrowUpFromLine, className: "text-blue-700 bg-blue-50" },
    { label: "합계", values: summarizeVolumes(allVolumes, "total"), icon: Sigma, className: "text-[#075be8] bg-[#eaf3ff]" }
  ];

  return (
    <div>
      <div className="border-b border-[#d9e7f7] pb-3">
        <h2 className="text-sm font-black text-[#10223d]">물동량 합계</h2>
        <div className="mt-2 grid grid-cols-3 divide-x divide-[#d9e7f7] bg-[#f8fbff]">
          {summaries.map((summary) => {
            const Icon = summary.icon;
            return (
              <div key={summary.label} className="min-w-0 px-2 py-2.5 text-center">
                <span className={`mx-auto inline-flex h-7 w-7 items-center justify-center rounded-md ${summary.className}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <p className="mt-1 text-[11px] font-black text-slate-500">{summary.label}</p>
                <p className="mt-0.5 min-h-5 break-words text-xs font-black leading-5 text-[#10223d]"><VolumeValue values={summary.values} /></p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-3">
        <h2 className="mb-2 text-sm font-black text-[#10223d]">화주별 물동량</h2>
        <div className="overflow-x-auto border-y border-[#d9e7f7]">
          <table className="w-full table-fixed text-[11px]">
            <colgroup><col className="w-[28%]" /><col className="w-[24%]" /><col className="w-[24%]" /><col className="w-[24%]" /></colgroup>
            <thead className="bg-[#f5f9ff] text-slate-600">
              <tr><th className="px-2 py-2.5 text-left">화주</th><th className="px-1 py-2.5 text-center">입고</th><th className="px-1 py-2.5 text-center">출고</th><th className="px-1 py-2.5 text-center">합계</th></tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f8]">
              {clients.map((client) => {
                const volumes = (reportsByClient.get(client.id) ?? []).flatMap((report) => report.volumes);
                return (
                  <tr key={client.id}>
                    <th scope="row" className="break-words px-2 py-3 text-left font-black text-[#10223d]">{client.client_name}</th>
                    <td className="break-words px-1 py-3 text-center font-black text-emerald-700"><VolumeValue values={summarizeVolumes(volumes, "inbound")} /></td>
                    <td className="break-words px-1 py-3 text-center font-black text-blue-700"><VolumeValue values={summarizeVolumes(volumes, "outbound")} /></td>
                    <td className="break-words px-1 py-3 text-center font-black text-[#075be8]"><VolumeValue values={summarizeVolumes(volumes, "total")} /></td>
                  </tr>
                );
              })}
              {clients.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center font-bold text-slate-400">등록된 화주가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
