"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { saveCollectionEntryAction } from "@/actions/data-collections";
import { ActionMessage } from "@/components/common/ActionMessage";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/labels";

export type DepartmentCollectionItem = {
  id: string;
  title: string;
  description: string;
  example: string;
  imageUrl: string | null;
  columns: string[];
  widths: number[];
  entryMode: "grid" | "link";
  linkUrl: string | null;
  createdAt: string;
};

export type DepartmentCollectionEntry = {
  rows: string[][];
  isCompleted: boolean;
};

const MAX_ENTRY_ROWS = 300;

function caretAtStart(element: HTMLTextAreaElement) {
  return (element.selectionStart ?? 0) === 0 && (element.selectionEnd ?? 0) === 0;
}

function caretAtEnd(element: HTMLTextAreaElement) {
  return (element.selectionStart ?? 0) === element.value.length && (element.selectionEnd ?? 0) === element.value.length;
}

function caretAtFirstLine(element: HTMLTextAreaElement) {
  return !element.value.slice(0, element.selectionStart ?? 0).includes("\n");
}

function caretAtLastLine(element: HTMLTextAreaElement) {
  return !element.value.slice(element.selectionEnd ?? 0).includes("\n");
}

// 셀 내용에 맞춰 행 높이를 자동 조정한다.
function autoResizeCell(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

export function DepartmentCollectionWorkspace({
  departmentId,
  collections,
  initialEntries,
  canEdit
}: {
  departmentId: string;
  collections: DepartmentCollectionItem[];
  initialEntries: Record<string, DepartmentCollectionEntry>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(collections[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Record<string, DepartmentCollectionEntry>>(() => {
    const next: Record<string, DepartmentCollectionEntry> = {};
    collections.forEach((collection) => {
      const entry = initialEntries[collection.id];
      next[collection.id] = {
        rows: entry && entry.rows.length > 0 ? entry.rows.map((row) => [...row]) : [Array(collection.columns.length).fill("")],
        isCompleted: entry?.isCompleted ?? false
      };
    });
    return next;
  });
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const tableRef = useRef<HTMLTableElement>(null);

  // router.refresh 등으로 취합건 목록·컬럼 수가 바뀌면 드래프트를 보충·보정한다.
  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      collections.forEach((collection) => {
        const existing = next[collection.id];
        if (!existing) {
          const entry = initialEntries[collection.id];
          next[collection.id] = {
            rows: entry && entry.rows.length > 0 ? entry.rows.map((row) => [...row]) : [Array(collection.columns.length).fill("")],
            isCompleted: entry?.isCompleted ?? false
          };
          return;
        }
        if (existing.rows.some((row) => row.length !== collection.columns.length)) {
          next[collection.id] = {
            ...existing,
            rows: existing.rows.map((row) => Array.from({ length: collection.columns.length }, (_, index) => row[index] ?? ""))
          };
        }
      });
      return next;
    });
  }, [collections, initialEntries]);

  const selected = collections.find((collection) => collection.id === selectedId) ?? collections[0] ?? null;
  const draft = selected ? drafts[selected.id] : null;

  function entryStatus(collectionId: string) {
    const entry = initialEntries[collectionId];
    if (!entry) {
      return { label: "작성중", className: "border-slate-200 bg-slate-50 text-slate-500" };
    }
    return entry.isCompleted
      ? { label: "확정", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
      : { label: "검토중", className: "border-blue-200 bg-blue-50 text-blue-700" };
  }

  function updateDraft(collectionId: string, patch: Partial<DepartmentCollectionEntry>) {
    setDrafts((current) => ({ ...current, [collectionId]: { ...current[collectionId], ...patch } }));
  }

  function updateCell(rowIndex: number, columnIndex: number, value: string) {
    if (!selected || !draft) {
      return;
    }
    updateDraft(selected.id, {
      rows: draft.rows.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex ? row.map((cell, currentColumnIndex) => (currentColumnIndex === columnIndex ? value : cell)) : row
      )
    });
  }

  function addRow() {
    if (!selected || !draft || draft.rows.length >= MAX_ENTRY_ROWS) {
      return;
    }
    updateDraft(selected.id, { rows: [...draft.rows, Array(selected.columns.length).fill("")] });
  }

  function removeRow(rowIndex: number) {
    if (!selected || !draft || draft.rows.length <= 1) {
      return;
    }
    updateDraft(selected.id, { rows: draft.rows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex) });
  }

  function focusCell(rowIndex: number, columnIndex: number) {
    tableRef.current?.querySelector<HTMLTextAreaElement>(`[data-cell="${rowIndex}:${columnIndex}"]`)?.focus();
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLTableElement>) {
    if (!selected || !draft) {
      return;
    }
    const target = event.target as HTMLElement;
    const cell = target.getAttribute("data-cell");
    if (!cell || !(target instanceof HTMLTextAreaElement)) {
      return;
    }
    const [rowIndex, columnIndex] = cell.split(":").map(Number);
    const moveTo = (nextRow: number, nextColumn: number) => {
      event.preventDefault();
      focusCell(nextRow, nextColumn);
    };

    // Alt+Tab: 셀 안에서 줄바꿈 (행 높이는 자동 조정)
    if (event.key === "Tab" && event.altKey) {
      event.preventDefault();
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      const nextValue = `${target.value.slice(0, start)}\n${target.value.slice(end)}`;
      updateCell(rowIndex, columnIndex, nextValue);
      requestAnimationFrame(() => {
        target.setSelectionRange(start + 1, start + 1);
        autoResizeCell(target);
      });
      return;
    }
    if (event.key === "Enter") {
      if (event.shiftKey || event.altKey) {
        return; // Shift/Alt+Enter도 줄바꿈으로 허용
      }
      event.preventDefault();
      if (rowIndex >= draft.rows.length - 1) {
        if (draft.rows.length < MAX_ENTRY_ROWS) {
          addRow();
          requestAnimationFrame(() => focusCell(rowIndex + 1, columnIndex));
        }
        return;
      }
      focusCell(rowIndex + 1, columnIndex);
      return;
    }
    if (event.key === "ArrowDown") {
      if (caretAtLastLine(target) && rowIndex < draft.rows.length - 1) {
        moveTo(rowIndex + 1, columnIndex);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      if (caretAtFirstLine(target) && rowIndex > 0) {
        moveTo(rowIndex - 1, columnIndex);
      }
      return;
    }
    if (event.key === "ArrowRight") {
      if (caretAtEnd(target) && columnIndex < selected.columns.length - 1) {
        moveTo(rowIndex, columnIndex + 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      if (caretAtStart(target) && columnIndex > 0) {
        moveTo(rowIndex, columnIndex - 1);
      }
    }
  }

  const [linkStatusOverrides, setLinkStatusOverrides] = useState<Record<string, { written: boolean; delivered: boolean }>>({});

  function handleLinkStatusSave(written: boolean, delivered: boolean) {
    if (!selected) {
      return;
    }
    const collectionId = selected.id;
    setLinkStatusOverrides((current) => ({ ...current, [collectionId]: { written: written || delivered, delivered: written && delivered } }));
    setMessage(null);
    startSaving(async () => {
      const formData = new FormData();
      formData.set("collection_id", selected.id);
      formData.set("department_id", departmentId);
      formData.set("rows", JSON.stringify([]));
      formData.set("is_completed", String(written && delivered));
      const result = await saveCollectionEntryAction(null, formData);
      setMessage(result);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  function handleSave(markCompleted: boolean) {
    if (!selected || !draft) {
      return;
    }
    setMessage(null);
    startSaving(async () => {
      const formData = new FormData();
      formData.set("collection_id", selected.id);
      formData.set("department_id", departmentId);
      formData.set("rows", JSON.stringify(draft.rows));
      formData.set("is_completed", String(markCompleted));
      const result = await saveCollectionEntryAction(null, formData);
      setMessage(result);
      if (result.ok) {
        updateDraft(selected.id, { isCompleted: markCompleted });
        router.refresh();
      }
    });
  }

  if (collections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d3c6b0] px-4 py-6 text-center text-sm font-bold text-slate-500">
        진행 중인 취합건이 없습니다. 자료취합 메뉴에서 등록된 취합건이 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-sm font-black text-[#012241]">취합등록 현황</p>
        <div className="space-y-1.5">
          {collections.map((collection) => {
            const status = entryStatus(collection.id);
            const isSelected = selected?.id === collection.id;
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => setSelectedId(collection.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition",
                  isSelected ? "border-[#007050] bg-[#f0f7f3]" : "border-[#e7ddcd] bg-white hover:bg-[#faf6ef]"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-black text-[#012241]">{collection.title}</span>
                <span className="shrink-0 text-[11px] font-bold text-slate-400">{formatDateTime(collection.createdAt)}</span>
                <span className={cn("inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black", status.className)}>
                  {status.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && draft ? (
        <div className="space-y-2">
          {selected.description || selected.example || selected.imageUrl ? (
            <div className="grid gap-3 rounded-[1.1rem] border border-[#e7ddcd] bg-[#faf6ef] px-4 py-3 md:grid-cols-[1fr_auto]">
              <div className="space-y-1.5 text-sm leading-6 text-slate-700">
                {selected.description ? <p className="whitespace-pre-wrap">{selected.description}</p> : null}
                {selected.example ? (
                  <p className="whitespace-pre-wrap text-xs font-bold text-slate-500">예시: {selected.example}</p>
                ) : null}
              </div>
              {selected.imageUrl ? (
                <a href={selected.imageUrl} target="_blank" rel="noreferrer" className="block shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selected.imageUrl} alt="취합 안내 사진" className="max-h-28 rounded-xl border border-[#e7ddcd] object-contain" />
                </a>
              ) : null}
            </div>
          ) : null}

          {selected.entryMode === "link" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-300 bg-white px-4 py-3">
              <a
                href={selected.linkUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-black text-[#007050] underline underline-offset-4"
                title="링크로 이동해 자료를 작성하세요"
              >
                {selected.linkUrl ?? "링크가 등록되지 않았습니다."}
              </a>
              <div className="flex shrink-0 items-center gap-4">
                <label className="flex cursor-pointer items-center gap-1.5 text-sm font-black text-[#012241]">
                  <input
                    type="checkbox"
                    checked={linkStatusOverrides[selected.id]?.written ?? Boolean(initialEntries[selected.id])}
                    disabled={!canEdit || isSaving}
                    onChange={(event) => handleLinkStatusSave(event.target.checked, false)}
                    className="h-4 w-4 accent-[#007050]"
                  />
                  작성완료
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-sm font-black text-[#012241]">
                  <input
                    type="checkbox"
                    checked={linkStatusOverrides[selected.id]?.delivered ?? initialEntries[selected.id]?.isCompleted ?? false}
                    disabled={!canEdit || isSaving}
                    onChange={(event) => handleLinkStatusSave(true, event.target.checked)}
                    className="h-4 w-4 accent-[#007050]"
                  />
                  자료전달
                </label>
              </div>
            </div>
          ) : (
          <>
          <div className="overflow-x-auto border border-slate-300 bg-white">
            <table ref={tableRef} onKeyDown={handleGridKeyDown} className="w-full border-collapse bg-white text-sm">
              <colgroup>
                <col className="w-9" />
                {selected.columns.map((_, columnIndex) => (
                  <col key={columnIndex} style={selected.widths[columnIndex] ? { width: `${selected.widths[columnIndex]}px` } : undefined} />
                ))}
                <col className="w-10" />
              </colgroup>
              <thead>
                <tr>
                  <th className="w-9 border border-slate-200 bg-[#f6f4ee] px-1 py-1.5 text-[11px] font-black text-slate-400" aria-label="행 번호" />
                  {selected.columns.map((column, columnIndex) => (
                    <th key={columnIndex} className="border border-slate-200 bg-[#f6f4ee] px-2 py-1.5 text-left text-xs font-black text-[#012241]">
                      {column || `컬럼${columnIndex + 1}`}
                    </th>
                  ))}
                  <th className="w-10 border border-slate-200 bg-[#f6f4ee] px-1 py-1.5" aria-label="행 관리" />
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <td className="border border-slate-200 bg-[#f6f4ee] px-1 py-1 text-center text-[11px] font-black text-slate-400">
                      {rowIndex + 1}
                    </td>
                    {row.map((cellValue, columnIndex) => (
                      <td
                        key={columnIndex}
                        className={cn(
                          "border border-slate-200 p-0 align-top transition-colors focus-within:bg-[#f0f7f3] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#007050]/60",
                          (initialEntries[selected.id]?.isCompleted ?? false) && !cellValue.trim() ? "bg-slate-200/70" : "bg-white"
                        )}
                      >
                        <textarea
                          ref={(element) => {
                            if (element) {
                              autoResizeCell(element);
                            }
                          }}
                          data-cell={`${rowIndex}:${columnIndex}`}
                          value={cellValue}
                          maxLength={1000}
                          rows={1}
                          disabled={!canEdit}
                          onChange={(event) => {
                            updateCell(rowIndex, columnIndex, event.target.value);
                            autoResizeCell(event.target);
                          }}
                          aria-label={`${rowIndex + 1}행 ${columnIndex + 1}열`}
                          className="block min-h-9 w-full resize-none overflow-hidden rounded-none! border-0! bg-transparent! px-2 py-1.5 text-sm leading-6 shadow-none! outline-none focus:shadow-none! disabled:cursor-not-allowed disabled:text-slate-400"
                        />
                      </td>
                    ))}
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        disabled={!canEdit || draft.rows.length <= 1}
                        tabIndex={-1}
                        className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 disabled:opacity-30"
                        aria-label={`${rowIndex + 1}행 삭제`}
                        title="행 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={addRow} disabled={!canEdit || draft.rows.length >= MAX_ENTRY_ROWS} className="tool-button disabled:opacity-40">
                <Plus className="h-4 w-4" aria-hidden="true" />
                행 추가
              </button>
              <p className="text-[11px] font-bold text-slate-400">Enter 아래로(마지막 행이면 행 추가) · 방향키/Tab 칸 이동 · Alt+Tab 또는 Shift+Enter 셀 안 줄바꿈(행 높이 자동 조정)</p>
            </div>
            <div className="flex items-center gap-3">
              <ActionMessage state={message} />
              <button type="button" onClick={() => handleSave(false)} disabled={!canEdit || isSaving} className="tool-button disabled:opacity-50">
                <Save className="h-4 w-4" aria-hidden="true" />
                저장
              </button>
              <button type="button" onClick={() => handleSave(true)} disabled={!canEdit || isSaving} className="tool-button tool-button-primary disabled:opacity-50">
                <Save className="h-4 w-4" aria-hidden="true" />
                {isSaving ? "저장 중" : "저장 및 확정"}
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      ) : null}
    </div>
  );
}
