"use client";

import { useState, useTransition } from "react";
import { NotebookPen, X } from "lucide-react";
import { loadDepartmentMemoAction, saveDepartmentMemoAction } from "@/actions/reports";
import { cn } from "@/lib/utils/cn";

const MEMO_MAX_LENGTH = 5000;

type DepartmentMemoButtonProps = {
  departmentId: string | null;
  weekStartDate: string;
  initialContent: string;
  canEdit: boolean;
  departmentName?: string | null;
};

export function DepartmentMemoButton({
  departmentId,
  weekStartDate,
  initialContent,
  canEdit,
  departmentName
}: DepartmentMemoButtonProps) {
  const [content, setContent] = useState(initialContent);
  const [draft, setDraft] = useState(initialContent);
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // 서버가 부서/주차 변경으로 새 초기 메모를 내려주면 렌더 단계에서 로컬 상태를 재동기화한다.
  const syncKey = `${departmentId ?? ""}|${weekStartDate}|${initialContent}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setContent(initialContent);
  }

  const hasMemo = content.trim().length > 0;
  const disabled = !departmentId;

  const openDialog = () => {
    if (disabled) {
      return;
    }
    setMessage(null);
    setDraft(content);
    setIsOpen(true);
    if (departmentId) {
      loadDepartmentMemoAction({ department_id: departmentId, week_start_date: weekStartDate }).then((result) => {
        if (result.ok) {
          setContent(result.content);
          setDraft(result.content);
        }
      });
    }
  };

  const handleSave = () => {
    if (!departmentId) {
      return;
    }
    startSaving(async () => {
      const result = await saveDepartmentMemoAction({
        department_id: departmentId,
        week_start_date: weekStartDate,
        content: draft
      });
      if (result.ok) {
        setContent(draft);
        setIsOpen(false);
        setMessage(null);
      } else {
        setMessage(result.message ?? "메모 저장에 실패했습니다.");
      }
    });
  };

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        title={disabled ? "부서를 선택하세요." : "부서 메모"}
        aria-label="부서 메모"
        className={cn(
          "tool-button h-full min-h-9 shrink-0 px-3",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <NotebookPen className="h-4 w-4" aria-hidden="true" />
        메모
      </button>
      {hasMemo ? (
        <span
          className="absolute -right-1 -top-1 rounded-full border border-white bg-[#007050] px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow"
          aria-label="작성됨"
        >
          작성됨
        </span>
      ) : null}

      {isOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-[#012241]/60 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-labelledby="department-memo-title"
        >
          <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(1,34,65,0.26)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e7ddcd] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="icon-badge icon-badge-green" aria-hidden="true">
                  <NotebookPen className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="department-memo-title" className="text-lg font-black text-[#012241]">
                    부서 메모
                  </h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {(departmentName ?? "선택 부서")} · {weekStartDate.replaceAll("-", ".")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="icon-tool-button"
                aria-label="메모 팝업 닫기"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="bg-white px-5 py-4">
              <div className="rounded-[1.25rem] border border-[#e4dac9] bg-[#faf6ef] px-4 py-3">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={MEMO_MAX_LENGTH}
                  readOnly={!canEdit}
                  rows={10}
                  placeholder="부서 회의 메모를 자유롭게 작성하세요."
                  className="w-full resize-y bg-transparent text-sm font-semibold leading-6 text-[#012241] outline-none placeholder:text-slate-400"
                />
                <p className="mt-1 text-right text-[11px] font-bold text-slate-400">
                  {draft.length.toLocaleString()} / {MEMO_MAX_LENGTH.toLocaleString()}
                </p>
              </div>
              {message ? (
                <p className="mt-3 text-sm font-bold text-[#c0392b]">{message}</p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e7ddcd] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-[#e4dac9] bg-white px-4 py-2 text-sm font-black text-[#012241]"
              >
                취소
              </button>
              {canEdit ? (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="tool-button tool-button-primary min-h-9 px-4 text-sm disabled:opacity-50"
                >
                  {isSaving ? "저장 중" : "저장"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
