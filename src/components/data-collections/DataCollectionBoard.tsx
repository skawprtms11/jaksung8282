"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Download, GripVertical, ImagePlus, List, Pencil, Plus, Save, Table2, Trash2, X } from "lucide-react";
import {
  closeDataCollectionAction,
  deleteDataCollectionAction,
  saveDataCollectionAction,
  uploadCollectionImageAction
} from "@/actions/data-collections";
import { ActionMessage } from "@/components/common/ActionMessage";
import { TableShell } from "@/components/common/TableShell";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/labels";

export type CollectionEntryView = {
  departmentId: string;
  departmentName: string;
  rows: string[][];
  isCompleted: boolean;
  updatedAt: string;
};

export type BoardDepartment = { id: string; department_name: string };

export type DataCollectionView = {
  id: string;
  title: string;
  description: string;
  example: string;
  imageUrl: string | null;
  columns: string[];
  widths: number[];
  // 컬럼별 목록박스 선택지. 빈 배열 = 일반 텍스트 컬럼.
  options: string[][];
  collectionType: "regular" | "adhoc";
  entryMode: "grid" | "link";
  linkUrl: string | null;
  authorName: string;
  createdAt: string;
  entries: CollectionEntryView[];
};

const VISIBLE_COLLECTION_LIMIT = 5;
const MAX_COLUMNS = 30;

function reorderList<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// 목록박스 편집 원문(줄 단위)을 선택지 배열로 변환한다.
function parseOptionLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

function completionRate(collection: DataCollectionView, totalDepartments: number) {
  if (totalDepartments === 0) {
    return 0;
  }
  const completed = collection.entries.filter((entry) => entry.isCompleted).length;
  return Math.min(100, Math.round((completed / totalDepartments) * 100));
}

function CompletionBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e6f1ec]">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-[#2fae66] to-[#007050] transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="shrink-0 text-sm font-black tabular-nums text-[#007050]">{percent}%</span>
    </div>
  );
}

export function DataCollectionBoard({
  collections,
  departments,
  regularTemplates,
  canCreate
}: {
  collections: DataCollectionView[];
  departments: BoardDepartment[];
  regularTemplates: DataCollectionView[];
  canCreate: boolean;
}) {
  const totalDepartments = departments.length;
  const router = useRouter();
  const [editorState, setEditorState] = useState<{ mode: "create" } | { mode: "edit"; row: DataCollectionView } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(collections[0]?.id ?? null);
  const [showAll, setShowAll] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [isMutating, startMutating] = useTransition();

  const selected = collections.find((collection) => collection.id === selectedId) ?? collections[0] ?? null;
  const visibleCollections = showAll ? collections : collections.slice(0, VISIBLE_COLLECTION_LIMIT);
  const overallPercent = useMemo(() => {
    if (collections.length === 0 || totalDepartments === 0) {
      return 0;
    }
    const completed = collections.reduce((sum, collection) => sum + collection.entries.filter((entry) => entry.isCompleted).length, 0);
    return Math.min(100, Math.round((completed / (collections.length * totalDepartments)) * 100));
  }, [collections, totalDepartments]);

  function runRowAction(action: (formData: FormData) => Promise<{ ok: boolean; message: string }>, id: string, confirmText: string) {
    if (!window.confirm(confirmText)) {
      return;
    }
    startMutating(async () => {
      const formData = new FormData();
      formData.set("id", id);
      const result = await action(formData);
      setMessage(result);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <section className="sketch-panel rounded-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="flex shrink-0 items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#e6f1ec] text-[#007050]">
                <Table2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="text-base font-black text-[#012241]">취합등록 현황</h2>
            </div>
            <CompletionBar percent={overallPercent} className="w-full max-w-sm" />
          </div>
          <div className="flex items-center gap-3">
            <ActionMessage state={message} />
            {canCreate ? (
              <button type="button" onClick={() => setEditorState({ mode: "create" })} className="tool-button tool-button-primary">
                <Plus className="h-4 w-4" aria-hidden="true" />
                취합등록
              </button>
            ) : null}
          </div>
        </div>

        {collections.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-[#d3c6b0] px-4 py-6 text-center text-sm font-bold text-slate-500">
            진행 중인 취합건이 없습니다.
          </p>
        ) : (
          <div className="mt-3">
            <TableShell>
              <table className="table-sticky w-full min-w-[860px] table-fixed text-left text-sm">
                <colgroup>
                  <col />
                  <col className="w-[110px]" />
                  <col className="w-[150px]" />
                  <col className="w-[220px]" />
                  <col className="w-[130px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2.5 text-xs font-black tracking-[0.02em] text-slate-500!">제목</th>
                    <th className="px-3 py-2.5 text-center text-xs font-black tracking-[0.02em] text-slate-500!">등록자</th>
                    <th className="px-3 py-2.5 text-center text-xs font-black tracking-[0.02em] text-slate-500!">등록일</th>
                    <th className="px-3 py-2.5 text-xs font-black tracking-[0.02em] text-slate-500!">완료율</th>
                    <th className="px-3 py-2.5 text-center text-xs font-black tracking-[0.02em] text-slate-500!">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCollections.map((collection) => {
                    const percent = completionRate(collection, totalDepartments);
                    const isSelected = selected?.id === collection.id;
                    return (
                      <tr
                        key={collection.id}
                        onClick={() => setSelectedId(collection.id)}
                        className={cn("cursor-pointer border-t border-[#eef2f6] align-middle", isSelected ? "bg-[#f4ede2]" : "hover:bg-[#faf6ef]")}
                      >
                        <td className="px-3 py-2.5">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-black text-[#012241]">{collection.title}</span>
                            {collection.collectionType === "regular" ? (
                              <span className="inline-flex shrink-0 rounded-full border border-[#cfe3da] bg-[#e6f1ec] px-1.5 py-0.5 text-[10px] font-black text-[#007050]">정기</span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs font-bold text-slate-600">{collection.authorName}</td>
                        <td className="px-3 py-2.5 text-center text-xs font-bold text-slate-500">{formatDateTime(collection.createdAt)}</td>
                        <td className="px-3 py-2.5">
                          <CompletionBar percent={percent} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {canCreate ? (
                            <div className="inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                              <button type="button" onClick={() => setEditorState({ mode: "edit", row: collection })} className="icon-tool-button h-8 w-8" aria-label="수정" title="수정">
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => runRowAction(closeDataCollectionAction, collection.id, `'${collection.title}' 취합건을 종결할까요? 종결하면 목록에서 사라집니다.`)}
                                disabled={isMutating}
                                className="icon-tool-button h-8 w-8 text-[#007050] disabled:opacity-40"
                                aria-label="종결"
                                title="종결"
                              >
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => runRowAction(deleteDataCollectionAction, collection.id, `'${collection.title}' 취합건을 삭제할까요?`)}
                                disabled={isMutating}
                                className="icon-tool-button h-8 w-8 text-rose-600 disabled:opacity-40"
                                aria-label="삭제"
                                title="삭제"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
            {collections.length > VISIBLE_COLLECTION_LIMIT ? (
              <button type="button" onClick={() => setShowAll((current) => !current)} className="tool-button mt-2 h-8 px-3 text-xs">
                {showAll ? "접기" : `더보기 (${collections.length - VISIBLE_COLLECTION_LIMIT}건)`}
              </button>
            ) : null}
          </div>
        )}
      </section>

      {selected ? <CollectionEntriesPanel collection={selected} departments={departments} /> : null}

      {editorState ? (
        <DataCollectionEditorDialog
          initialRow={editorState.mode === "edit" ? editorState.row : null}
          regularTemplates={regularTemplates}
          onClose={() => setEditorState(null)}
          onSaved={(resultMessage) => {
            setMessage({ ok: true, message: resultMessage });
            setEditorState(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function collectionEntryStatus(entry: CollectionEntryView | undefined) {
  if (!entry) {
    return { label: "작성중", className: "border-slate-200 bg-slate-50 text-slate-500" };
  }
  if (entry.isCompleted) {
    return { label: "확정", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  return { label: "검토중", className: "border-blue-200 bg-blue-50 text-blue-700" };
}

function downloadCollectionCsv(collection: DataCollectionView, departments: BoardDepartment[]) {
  const statusLabel = (entry: CollectionEntryView | undefined) => (!entry ? "작성중" : entry.isCompleted ? "확정" : "검토중");
  const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines: string[] = [["부서", ...collection.columns.map((column, index) => column || `컬럼${index + 1}`), "상태"].map(escapeCell).join(",")];
  departments.forEach((department) => {
    const entry = collection.entries.find((row) => row.departmentId === department.id);
    const rows = entry?.rows.length ? entry.rows : [Array(collection.columns.length).fill("")];
    rows.forEach((row) => {
      lines.push([department.department_name, ...collection.columns.map((_, index) => row[index] ?? ""), statusLabel(entry)].map(escapeCell).join(","));
    });
  });
  // UTF-8 BOM을 붙여 Excel에서 한글이 바로 열리게 한다.
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${collection.title}_취합내역.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function CollectionEntriesPanel({ collection, departments }: { collection: DataCollectionView; departments: BoardDepartment[] }) {
  const confirmedNames = collection.entries.filter((entry) => entry.isCompleted).map((entry) => entry.departmentName);
  // 부서마스터의 활성 부서 전체를 기본 표시한다. 작성 전 부서는 빈 행 1개로 표만 그린다.
  const departmentGroups = departments.map((department) => {
    const entry = collection.entries.find((row) => row.departmentId === department.id);
    const rows = entry?.rows ?? [];
    return { department, entry, rows, rowCount: Math.max(rows.length, 1) };
  });

  return (
    <section className="sketch-panel space-y-3 rounded-md p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-[#012241]">{collection.title} · 부서별 작성 내용</h2>
          <p className="mt-0.5 text-xs font-bold text-slate-500">
            확정 {confirmedNames.length}/{departments.length}개 부서{confirmedNames.length > 0 ? ` · ${confirmedNames.join(", ")}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => downloadCollectionCsv(collection, departments)} className="tool-button h-9">
          <Download className="h-4 w-4" aria-hidden="true" />
          엑셀 다운로드
        </button>
      </div>
      {collection.description || collection.example || collection.imageUrl ? (
        <div className="grid gap-3 rounded-[1.1rem] border border-[#e7ddcd] bg-[#faf6ef] px-4 py-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-1.5 text-sm leading-6 text-slate-700">
            {collection.description ? <p className="whitespace-pre-wrap">{collection.description}</p> : null}
            {collection.example ? (
              <p className="whitespace-pre-wrap text-xs font-bold text-slate-500">예시: {collection.example}</p>
            ) : null}
          </div>
          {collection.imageUrl ? (
            <a href={collection.imageUrl} target="_blank" rel="noreferrer" className="block shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={collection.imageUrl} alt="취합 안내 사진" className="max-h-32 rounded-xl border border-[#e7ddcd] object-contain" />
            </a>
          ) : null}
        </div>
      ) : null}

      {collection.entryMode === "link" && collection.linkUrl ? (
        <p className="rounded-[1.1rem] border border-[#cfe3da] bg-[#e6f1ec] px-4 py-2.5 text-sm font-bold text-[#012241]">
          취합 링크:{" "}
          <a href={collection.linkUrl} target="_blank" rel="noreferrer" className="font-black text-[#007050] underline underline-offset-4">
            {collection.linkUrl}
          </a>
        </p>
      ) : null}
      <TableShell>
        <table className="w-full min-w-[860px] border-collapse bg-white text-sm">
          <colgroup>
            <col className="w-32" />
            {collection.columns.map((_, columnIndex) => (
              <col key={columnIndex} style={collection.widths[columnIndex] ? { width: `${collection.widths[columnIndex]}px` } : undefined} />
            ))}
            <col className="w-20" />
          </colgroup>
          <thead>
            <tr>
              <th className="border border-slate-200 bg-[#f6f4ee] px-2 py-2 text-center text-xs font-black text-[#012241]">부서</th>
              {collection.columns.map((column, columnIndex) => (
                <th key={columnIndex} className="border border-slate-200 bg-[#f6f4ee] px-2 py-2 text-left text-xs font-black text-[#012241]">
                  {column || `컬럼${columnIndex + 1}`}
                </th>
              ))}
              <th className="w-20 border border-slate-200 bg-[#f6f4ee] px-2 py-2 text-center text-xs font-black text-[#012241]">상태</th>
            </tr>
          </thead>
          <tbody>
            {departmentGroups.map(({ department, entry, rows, rowCount }) => {
              const status = collectionEntryStatus(entry);
              return Array.from({ length: rowCount }, (_, rowIndex) => (
                <tr key={`${department.id}-${rowIndex}`} className={cn(rowIndex === 0 && "border-t border-t-slate-200")}>
                  {rowIndex === 0 ? (
                    <td rowSpan={rowCount} className="border border-slate-200 px-2 py-1.5 text-center align-middle text-xs font-black text-[#012241]">
                      {department.department_name}
                    </td>
                  ) : null}
                  {collection.columns.map((_, columnIndex) => (
                    <td
                      key={columnIndex}
                      className={cn(
                        "h-9 whitespace-pre-wrap border border-slate-200 px-2 py-1.5 text-sm text-slate-700",
                        (entry?.isCompleted ?? false) && !(rows[rowIndex]?.[columnIndex] ?? "").trim() ? "bg-slate-200/70" : "bg-white"
                      )}
                    >
                      {rows[rowIndex]?.[columnIndex] ?? ""}
                    </td>
                  ))}
                  {rowIndex === 0 ? (
                    <td rowSpan={rowCount} className="border border-slate-200 px-2 py-1.5 text-center align-middle">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black", status.className)}>
                        {status.label}
                      </span>
                    </td>
                  ) : null}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </TableShell>
    </section>
  );
}

const DEFAULT_COLUMN_WIDTH = 160;

function DataCollectionEditorDialog({
  initialRow,
  regularTemplates,
  onClose,
  onSaved
}: {
  initialRow: DataCollectionView | null;
  regularTemplates: DataCollectionView[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [collectionType, setCollectionType] = useState<"regular" | "adhoc">(initialRow?.collectionType ?? "adhoc");
  const [loadedTemplateId, setLoadedTemplateId] = useState("");
  const [title, setTitle] = useState(initialRow?.title ?? "");
  const [description, setDescription] = useState(initialRow?.description ?? "");
  const [example, setExample] = useState(initialRow?.example ?? "");
  const [imageUrl, setImageUrl] = useState(initialRow?.imageUrl ?? "");
  const [entryMode, setEntryMode] = useState<"grid" | "link">(initialRow?.entryMode ?? "grid");
  const [linkUrl, setLinkUrl] = useState(initialRow?.linkUrl ?? "");
  const [columns, setColumns] = useState<string[]>(() => (initialRow ? [...initialRow.columns] : ["항목", "내용", "비고"]));
  const [widths, setWidths] = useState<number[]>(() =>
    initialRow
      ? initialRow.columns.map((_, index) => initialRow.widths[index] || DEFAULT_COLUMN_WIDTH)
      : [DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH]
  );
  // 컬럼별 목록박스 선택지 편집 원문(줄 단위). 저장 시 빈 줄을 걸러 배열로 변환한다.
  const [optionsText, setOptionsText] = useState<string[]>(() =>
    initialRow ? initialRow.columns.map((_, index) => (initialRow.options[index] ?? []).join("\n")) : ["", "", ""]
  );
  const [optionsEditorIndex, setOptionsEditorIndex] = useState<number | null>(null);
  // 컬럼 좌우 드래그 정렬: 핸들을 누른 컬럼만 draggable로 만들어 입력칸 텍스트 선택을 방해하지 않는다.
  const [dragColumnIndex, setDragColumnIndex] = useState<number | null>(null);
  const [dragOverColumnIndex, setDragOverColumnIndex] = useState<number | null>(null);
  const [dragArmedColumnIndex, setDragArmedColumnIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isUploading, startUploading] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const columnRowRef = useRef<HTMLDivElement>(null);

  function handleUpload(file: File | null) {
    if (!file) {
      return;
    }
    startUploading(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadCollectionImageAction(formData);
      if (!result.ok || !result.data) {
        setMessage({ ok: false, message: result.message });
        return;
      }
      setImageUrl(result.data.url);
      setMessage(null);
    });
  }

  function startColumnResize(index: number, event: React.MouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widths[index] || DEFAULT_COLUMN_WIDTH;
    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(2000, Math.max(60, Math.round(startWidth + (moveEvent.clientX - startX))));
      setWidths((current) => current.map((value, currentIndex) => (currentIndex === index ? nextWidth : value)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function endColumnDrag() {
    setDragColumnIndex(null);
    setDragOverColumnIndex(null);
    setDragArmedColumnIndex(null);
  }

  function moveColumn(from: number, to: number) {
    if (from === to) {
      return;
    }
    setColumns((current) => reorderList(current, from, to));
    setWidths((current) => reorderList(current, from, to));
    setOptionsText((current) => reorderList(current, from, to));
    // 열려 있는 목록 편집창이 이동한 컬럼을 계속 가리키게 인덱스를 보정한다.
    setOptionsEditorIndex((current) => {
      if (current === null) {
        return null;
      }
      if (current === from) {
        return to;
      }
      if (from < current && current <= to) {
        return current - 1;
      }
      if (to <= current && current < from) {
        return current + 1;
      }
      return current;
    });
  }

  function loadRegularTemplate(templateId: string) {
    setLoadedTemplateId(templateId);
    const template = regularTemplates.find((row) => row.id === templateId);
    if (!template) {
      return;
    }
    setTitle(template.title);
    setDescription(template.description);
    setExample(template.example);
    setImageUrl(template.imageUrl ?? "");
    setColumns([...template.columns]);
    setWidths(template.columns.map((_, index) => template.widths[index] || DEFAULT_COLUMN_WIDTH));
    setOptionsText(template.columns.map((_, index) => (template.options[index] ?? []).join("\n")));
    setOptionsEditorIndex(null);
    setEntryMode(template.entryMode);
    setLinkUrl(template.linkUrl ?? "");
  }

  function focusColumn(index: number) {
    columnRowRef.current?.querySelector<HTMLInputElement>(`[data-column="${index}"]`)?.focus();
  }

  function handleColumnKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const attr = target.getAttribute("data-column");
    if (!attr || !(target instanceof HTMLInputElement)) {
      return;
    }
    const index = Number(attr);
    if (event.key === "Enter") {
      event.preventDefault();
      if (index === columns.length - 1 && columns.length < MAX_COLUMNS) {
        setColumns((current) => [...current, ""]);
        setWidths((current) => [...current, DEFAULT_COLUMN_WIDTH]);
        setOptionsText((current) => [...current, ""]);
        requestAnimationFrame(() => focusColumn(index + 1));
      } else {
        focusColumn(index + 1);
      }
      return;
    }
    if (event.key === "ArrowRight" && (target.selectionStart ?? 0) === target.value.length && index < columns.length - 1) {
      event.preventDefault();
      focusColumn(index + 1);
      return;
    }
    if (event.key === "ArrowLeft" && (target.selectionStart ?? 0) === 0 && (target.selectionEnd ?? 0) === 0 && index > 0) {
      event.preventDefault();
      focusColumn(index - 1);
    }
  }

  function handleSave() {
    setMessage(null);
    if (
      initialRow &&
      columns.length < initialRow.columns.length &&
      !window.confirm("컬럼을 줄이면 부서가 이미 작성한 해당 칸의 내용이 손실될 수 있습니다. 계속할까요?")
    ) {
      return;
    }
    startSaving(async () => {
      const formData = new FormData();
      formData.set("id", initialRow?.id ?? "");
      formData.set("title", title);
      formData.set("description", description);
      formData.set("example", example);
      formData.set("image_url", imageUrl);
      formData.set("columns", JSON.stringify(columns));
      formData.set("widths", JSON.stringify(widths));
      formData.set(
        "options",
        JSON.stringify(columns.map((_, index) => parseOptionLines(optionsText[index] ?? "")))
      );
      formData.set("collection_type", collectionType);
      formData.set("entry_mode", entryMode);
      formData.set("link_url", linkUrl);
      const result = await saveDataCollectionAction(null, formData);
      if (!result.ok) {
        setMessage(result);
        return;
      }
      onSaved(result.message);
    });
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#012241]/60 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="data-collection-editor-title">
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-[#e4dac9] bg-white shadow-[0_28px_80px_rgba(1,34,65,0.22)]">
          <div className="flex items-start justify-between gap-4 border-b border-[#eee6d8] px-6 py-5">
            <div className="min-w-0">
              <h2 id="data-collection-editor-title" className="text-lg font-black text-[#012241]">
                {initialRow ? "취합등록 수정" : "취합등록"}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">설명·예시·사진으로 안내하고, 부서가 작성할 컬럼을 설정하세요. 행은 각 부서에서 추가합니다.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-tool-button" aria-label="팝업 닫기">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-[1.1rem] border border-[#e7ddcd] bg-[#faf6ef] px-4 py-3">
              <div className="flex shrink-0 items-center gap-5 self-center">
                {([["adhoc", "수시취합"], ["regular", "정기취합"]] as const).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-1.5 text-sm font-black text-[#012241]">
                    <input
                      type="radio"
                      name="collection-type"
                      checked={collectionType === value}
                      onChange={() => setCollectionType(value)}
                      className="h-4 w-4 accent-[#007050]"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {collectionType === "regular" ? (
                <div className="min-w-0 flex-1 border-l border-[#e7ddcd] pl-5">
                  <p className="mb-1.5 text-xs font-black text-slate-600">기존 정기취합 불러오기</p>
                  {regularTemplates.length > 0 ? (
                    <>
                      <ul role="listbox" aria-label="기존 정기취합 목록" className="max-h-36 overflow-y-auto rounded-md border border-slate-300 bg-white py-1">
                        {[{ id: "", label: "직접 새로 작성" }, ...regularTemplates.map((template) => ({
                          id: template.id,
                          label: `${template.title} · ${template.createdAt.slice(2, 10).replaceAll("-", ".")} 등록`
                        }))].map((option) => (
                          <li key={option.id || "blank"} role="option" aria-selected={loadedTemplateId === option.id}>
                            <button
                              type="button"
                              onClick={() => loadRegularTemplate(option.id)}
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[#f0f7f3]",
                                loadedTemplateId === option.id ? "font-black text-[#007050]" : "text-[#012241]"
                              )}
                            >
                              <Check className={cn("h-4 w-4 shrink-0", loadedTemplateId === option.id ? "text-[#007050]" : "text-transparent")} aria-hidden="true" />
                              <span className="min-w-0 truncate">{option.label}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[11px] font-bold text-slate-400">선택하면 제목·설명·예시·사진·컬럼 양식을 그대로 불러옵니다.</p>
                    </>
                  ) : (
                    <p className="text-xs font-bold text-slate-400">불러올 기존 정기취합이 없습니다. 새로 작성하세요.</p>
                  )}
                </div>
              ) : null}
            </div>
            <label className="block text-xs font-black text-slate-600">
              제목
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="예: 8월 안전점검 결과 취합"
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
              />
            </label>
            <label className="block text-xs font-black text-slate-600">
              취합 설명
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="취합 목적과 작성 방법을 설명하세요."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-xs font-black text-slate-600">
              작성 예시
              <textarea
                value={example}
                onChange={(event) => setExample(event.target.value)}
                rows={2}
                placeholder="예: 안전팀 / 소화기 점검 / 이상 없음"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <div className="text-xs font-black text-slate-600">
              안내 사진
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="tool-button h-9 disabled:opacity-50"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  {isUploading ? "업로드 중" : imageUrl ? "사진 변경" : "사진 첨부"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleUpload(event.target.files?.[0] ?? null)}
                />
                {imageUrl ? (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="취합 안내 사진 미리보기" className="h-14 rounded-lg border border-[#e7ddcd] object-contain" />
                    <button type="button" onClick={() => setImageUrl("")} className="icon-tool-button h-8 w-8 text-rose-600" aria-label="사진 제거" title="사진 제거">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-bold text-slate-400">필요 시 안내용 사진 1장을 첨부할 수 있습니다.</span>
                )}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-black text-slate-600">취합 방식</p>
              <div className="flex gap-2">
                {([["grid", "표형식으로 취합"], ["link", "링크등록으로 취합"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEntryMode(value)}
                    className={cn(
                      "tool-button h-9",
                      entryMode === value && "tool-button-primary"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {entryMode === "link" ? (
                <label className="mt-2 block text-xs font-black text-slate-600">
                  취합 링크 URL
                  <input
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    maxLength={1000}
                    placeholder="https:// 로 시작하는 작성 링크를 입력하세요"
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                  />
                  <span className="mt-1 block text-[11px] font-bold text-slate-400">부서는 이 링크로 이동해 자료를 작성하고, 작성완료·자료전달만 체크합니다.</span>
                </label>
              ) : null}
            </div>
            {entryMode === "grid" ? (
            <div>
              <p className="mb-1 text-xs font-black text-slate-600">취합 컬럼 설정</p>
              <div className="overflow-x-auto rounded-[1.1rem] border border-[#e7ddcd] bg-[#faf6ef] p-3">
                <div ref={columnRowRef} onKeyDown={handleColumnKeyDown} className="flex items-start">
                  {columns.map((column, index) => {
                    const optionCount = parseOptionLines(optionsText[index] ?? "").length;
                    const isDropTarget = dragOverColumnIndex === index && dragColumnIndex !== null && dragColumnIndex !== index;
                    return (
                    <div
                      key={index}
                      draggable={dragArmedColumnIndex === index}
                      onDragStart={(event) => {
                        setDragColumnIndex(index);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={endColumnDrag}
                      onDragOver={(event) => {
                        if (dragColumnIndex !== null) {
                          event.preventDefault();
                          setDragOverColumnIndex(index);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragColumnIndex !== null) {
                          moveColumn(dragColumnIndex, index);
                        }
                        endColumnDrag();
                      }}
                      className={cn("relative shrink-0 pr-1 transition-opacity", dragColumnIndex === index && "opacity-40")}
                      style={{ width: `${widths[index] || DEFAULT_COLUMN_WIDTH}px` }}
                    >
                      <div
                        className={cn(
                          "flex items-center overflow-hidden rounded-md border bg-white focus-within:ring-2 focus-within:ring-[#007050]/60",
                          isDropTarget ? "border-[#007050] ring-2 ring-[#007050]/40" : "border-slate-300"
                        )}
                      >
                        <span
                          onMouseDown={() => {
                            setDragArmedColumnIndex(index);
                            // 어디에서 마우스를 떼든 armed를 해제해 입력칸의 텍스트 선택 드래그를 막지 않는다.
                            const clearArmed = () => {
                              setDragArmedColumnIndex(null);
                              document.removeEventListener("mouseup", clearArmed);
                            };
                            document.addEventListener("mouseup", clearArmed);
                          }}
                          className="inline-flex h-9 w-5 shrink-0 cursor-grab items-center justify-center text-slate-300 hover:text-[#007050] active:cursor-grabbing"
                          aria-label={`컬럼 ${index + 1} 순서 이동`}
                          title="드래그해서 좌우 순서 변경"
                        >
                          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <input
                          data-column={index}
                          value={column}
                          maxLength={60}
                          onChange={(event) =>
                            setColumns((current) => current.map((value, currentIndex) => (currentIndex === index ? event.target.value : value)))
                          }
                          placeholder={`컬럼${index + 1}`}
                          aria-label={`컬럼 ${index + 1} 이름`}
                          className="h-9 w-full min-w-0 bg-transparent pr-1 text-sm font-bold text-[#012241] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (columns.length <= 1) {
                              return;
                            }
                            setColumns((current) => current.filter((_, currentIndex) => currentIndex !== index));
                            setWidths((current) => current.filter((_, currentIndex) => currentIndex !== index));
                            setOptionsText((current) => current.filter((_, currentIndex) => currentIndex !== index));
                            setOptionsEditorIndex((current) =>
                              current === null ? null : current === index ? null : current > index ? current - 1 : current
                            );
                          }}
                          disabled={columns.length <= 1}
                          tabIndex={-1}
                          className="inline-flex h-9 w-6 shrink-0 items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30"
                          aria-label={`컬럼 ${index + 1} 삭제`}
                          title="컬럼 삭제"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="mt-1 flex h-5 items-center justify-center gap-1 text-[10px] font-bold text-slate-400">
                        <span className="tabular-nums">{widths[index] || DEFAULT_COLUMN_WIDTH}px</span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => setOptionsEditorIndex((current) => (current === index ? null : index))}
                          className={cn(
                            "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-black transition-colors",
                            optionCount > 0
                              ? "bg-[#007050] text-white hover:bg-[#005c42]"
                              : "text-slate-400 hover:bg-[#e6f1ec] hover:text-[#007050]",
                            optionsEditorIndex === index && "ring-2 ring-[#007050]/35"
                          )}
                          aria-label={`컬럼 ${index + 1} 목록박스 설정`}
                          title="목록박스 설정 — 선택지를 등록하면 부서는 목록에서 골라 입력합니다"
                        >
                          <List className="h-3 w-3" aria-hidden="true" />
                          {optionCount > 0 ? `목록 ${optionCount}` : "목록"}
                        </button>
                      </div>
                      <div
                        role="separator"
                        aria-label={`컬럼 ${index + 1} 너비 조정`}
                        data-resize={index}
                        onMouseDown={(event) => startColumnResize(index, event)}
                        className="absolute right-0 top-0 h-9 w-2 cursor-col-resize rounded bg-transparent hover:bg-[#007050]/30"
                        title="드래그해서 열너비 조정"
                      />
                    </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      if (columns.length >= MAX_COLUMNS) {
                        return;
                      }
                      setColumns((current) => [...current, ""]);
                      setWidths((current) => [...current, DEFAULT_COLUMN_WIDTH]);
                      setOptionsText((current) => [...current, ""]);
                    }}
                    disabled={columns.length >= MAX_COLUMNS}
                    className="ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#007050] hover:bg-[#e6f1ec] disabled:opacity-30"
                    aria-label="컬럼 추가"
                    title="컬럼 추가"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {optionsEditorIndex !== null && optionsEditorIndex < columns.length ? (
                  <div className="mt-3 rounded-md border border-[#cfe4da] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-[#012241]">
                        &ldquo;{columns[optionsEditorIndex] || `컬럼${optionsEditorIndex + 1}`}&rdquo; 목록박스 선택지
                      </p>
                      <button
                        type="button"
                        onClick={() => setOptionsEditorIndex(null)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
                        aria-label="목록 설정 닫기"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <textarea
                      value={optionsText[optionsEditorIndex] ?? ""}
                      rows={5}
                      onChange={(event) =>
                        setOptionsText((current) =>
                          current.map((value, currentIndex) => (currentIndex === optionsEditorIndex ? event.target.value : value))
                        )
                      }
                      placeholder={"한 줄에 선택지 하나씩 입력하세요.\n예)\n진행중\n완료\n해당없음"}
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-[#007050]"
                    />
                    <p className="mt-1 text-[11px] font-bold text-slate-400">
                      선택지를 등록하면 부서 작성 화면에서 이 컬럼은 목록에서 선택합니다. 비워두면 일반 텍스트 입력으로 돌아갑니다.
                    </p>
                  </div>
                ) : null}
                <p className="mt-1 text-[11px] font-bold text-slate-400">왼쪽 손잡이를 드래그하면 컬럼 순서가 바뀝니다 · 오른쪽 가장자리 드래그로 열너비 조정 · Enter로 다음/새 컬럼 · 목록 버튼으로 선택지 설정</p>
              </div>
            </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eee6d8] px-6 py-4">
            <ActionMessage state={message} />
            <button type="button" onClick={handleSave} disabled={isSaving || isUploading} className="tool-button tool-button-primary ml-auto disabled:opacity-60">
              <Save className="h-4 w-4" aria-hidden="true" />
              {isSaving ? "저장 중" : initialRow ? "수정 저장" : "등록"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
