"use client";

import { createPortal } from "react-dom";
import { History, X } from "lucide-react";
import { formatDateTime } from "@/lib/utils/labels";

// 제목 우측에 붙는 관리자수정 표시. 서버 액션을 import하는 모듈과 분리해 두 목록 화면에서 공용으로 쓴다.
export function AdminEditedMark() {
  return (
    <span className="ml-1 inline-flex shrink-0 -translate-y-0.5 items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-black leading-4 text-amber-700">
      관리자수정
    </span>
  );
}

export type AdminEditCompareTarget = {
  title: string;
  content: string;
  originalTitle: string | null;
  originalContent: string | null;
  adminEditedAt: string | null;
};

// 관리자 수정이 있는 업무 항목의 기존내용/수정내용 비교 팝업.
// 부서자료(화주별 자료 검토)와 화주자료 목록 두 화면에서 공용으로 쓴다.
export function AdminEditCompareDialog({ target, onClose }: { target: AdminEditCompareTarget; onClose: () => void }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[#012241]/60 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-edit-compare-title"
    >
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(1,34,65,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#eee6d8] px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="icon-badge icon-badge-amber">
              <History className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="admin-edit-compare-title" className="text-lg font-black text-[#012241]">
                관리자 수정 내역
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {target.adminEditedAt ? `수정일시 ${formatDateTime(target.adminEditedAt)}` : "관리자 수정 내용을 비교합니다."}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-3 overflow-y-auto bg-white px-6 py-5 md:grid-cols-2">
          <section className="rounded-[1.25rem] border border-[#e7ddcd] bg-[#faf6ef] p-4">
            <p className="text-xs font-black text-slate-500">기존 내용</p>
            <h3 className="mt-2 break-words text-sm font-black text-[#012241]">{target.originalTitle ?? "-"}</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">
              {target.originalContent || "내용 없음"}
            </p>
          </section>
          <section className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-black text-amber-700">관리자 수정 내용</p>
            <h3 className="mt-2 break-words text-sm font-black text-[#012241]">{target.title}</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">
              {target.content || "내용 없음"}
            </p>
          </section>
        </div>
        <div className="flex justify-end border-t border-[#eee6d8] px-6 py-4">
          <button type="button" onClick={onClose} className="tool-button tool-button-primary">
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
