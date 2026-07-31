"use client";

import { useActionState, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Megaphone,
  MessageCircle,
  Pencil,
  Pin,
  Reply,
  Save,
  Search,
  Send,
  Table2,
  Trash2,
  X
} from "lucide-react";
import {
  deleteNoticeAction,
  deleteNoticeCommentAction,
  incrementNoticeView,
  saveNoticeAction,
  saveNoticeCollectionStatusAction,
  saveNoticeCommentAction,
  type NoticeCommentActionRow
} from "@/actions/notices";
import { ActionMessage } from "@/components/common/ActionMessage";
import { buildNoticeCommentTree, type NoticeCommentTreeNode } from "@/lib/notices/comments";
import {
  parseNoticeContent,
  serializeNoticeContent,
  type NoticeCollectionStatus,
} from "@/lib/notices/content";
import { noticeTypeLabels } from "@/lib/utils/labels";
import type { AppRole, NoticeType } from "@/types/enums";

type NoticeBoardRow = {
  id: string;
  notice_type: NoticeType;
  title: string;
  content: string;
  is_pinned: boolean;
  view_count: number;
  comment_count: number;
  created_by: string | null;
  created_at: string;
};

type NoticeCommentRow = NoticeCommentActionRow;

type DepartmentRow = {
  id: string;
  department_name: string;
};

type CurrentUser = {
  id: string;
  app_role: AppRole;
  department_id: string | null;
  department_name?: string | null;
  full_name: string;
};

const noticeTypeOptions: { value: NoticeType; label: string }[] = [
  { value: "general", label: "공지사항" },
  { value: "important", label: "지시사항" },
  { value: "urgent", label: "자료취합" },
  { value: "system", label: "기타내용" }
];

const noticeTypeBadgeStyles: Record<NoticeType, string> = {
  general: "border-blue-100 bg-blue-50 text-blue-700",
  important: "border-orange-100 bg-orange-50 text-orange-600",
  urgent: "border-emerald-100 bg-emerald-50 text-emerald-700",
  system: "border-slate-200 bg-slate-50 text-slate-600"
};

const noticeTypeIcons = {
  general: Megaphone,
  important: Send,
  urgent: ClipboardList,
  system: Table2
} satisfies Record<NoticeType, typeof Megaphone>;

function formatShortDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul"
  })
    .format(date)
    .replaceAll(". ", ".")
    .replace(/\.$/, "");
}

function formatCollectionDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  })
    .format(date)
    .replaceAll(". ", ".")
    .replace(/\.$/, "");
}

function mergeCollectionStatuses(departments: DepartmentRow[], statuses: NoticeCollectionStatus[]) {
  const statusMap = new Map(statuses.map((status) => [status.department_id, status]));
  return departments.map((department) => {
    const status = statusMap.get(department.id);
    return {
      department_id: department.id,
      department_name: department.department_name,
      is_completed: status?.is_completed ?? false,
      confirmer_name: status?.confirmer_name ?? "",
      updated_at: status?.updated_at
    };
  });
}

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

function NoticeTypeBadge({ type }: { type: NoticeType }) {
  const Icon = noticeTypeIcons[type];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${noticeTypeBadgeStyles[type]}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {noticeTypeLabels[type]}
    </span>
  );
}

export function NoticeBoard({
  notices,
  importantNotices,
  comments,
  departments,
  canCreate,
  currentUser,
  defaultQuery,
  defaultType
}: {
  notices: NoticeBoardRow[];
  importantNotices: NoticeBoardRow[];
  comments: NoticeCommentRow[];
  departments: DepartmentRow[];
  canCreate: boolean;
  currentUser: CurrentUser | null;
  defaultQuery?: string;
  defaultType?: NoticeType | "";
}) {
  const router = useRouter();
  const [writeOpen, setWriteOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeBoardRow | null>(null);
  const [detailNotice, setDetailNotice] = useState<NoticeBoardRow | null>(null);
  const [collectionNotice, setCollectionNotice] = useState<NoticeBoardRow | null>(null);
  const [visibleNotices, setVisibleNotices] = useState(notices);
  const [visibleImportantNotices, setVisibleImportantNotices] = useState(importantNotices);
  const [visibleComments, setVisibleComments] = useState(comments);
  const [deleteState, setDeleteState] = useState<Awaited<ReturnType<typeof deleteNoticeAction>> | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [saveState, saveAction, isNoticeSaving] = useActionState(
    async (previousState: Awaited<ReturnType<typeof saveNoticeAction>> | null, formData: FormData) => {
      const result = await saveNoticeAction(previousState, formData);
      if (result.ok) {
        setWriteOpen(false);
        setEditingNotice(null);
        router.refresh();
      }
      return result;
    },
    null
  );
  function canManageNotice(notice: NoticeBoardRow) {
    return Boolean(currentUser && (currentUser.app_role === "admin" || notice.created_by === currentUser.id));
  }

  function openNoticeDetail(notice: NoticeBoardRow) {
    setDetailNotice({ ...notice, view_count: notice.view_count + 1 });
    setVisibleNotices((rows) => rows.map((row) => (row.id === notice.id ? { ...row, view_count: row.view_count + 1 } : row)));
    setVisibleImportantNotices((rows) =>
      rows.map((row) => (row.id === notice.id ? { ...row, view_count: row.view_count + 1 } : row))
    );
    void incrementNoticeView(notice.id);
  }

  function updateNoticeCommentCount(noticeId: string, delta: number) {
    setVisibleNotices((rows) =>
      rows.map((row) => (row.id === noticeId ? { ...row, comment_count: Math.max(row.comment_count + delta, 0) } : row))
    );
    setVisibleImportantNotices((rows) =>
      rows.map((row) => (row.id === noticeId ? { ...row, comment_count: Math.max(row.comment_count + delta, 0) } : row))
    );
  }

  function upsertVisibleComment(comment: NoticeCommentRow) {
    setVisibleComments((rows) => {
      const exists = rows.some((row) => row.id === comment.id);
      return exists ? rows.map((row) => (row.id === comment.id ? comment : row)) : [...rows, comment];
    });
    if (!visibleComments.some((row) => row.id === comment.id)) {
      updateNoticeCommentCount(comment.notice_id, 1);
    }
  }

  function removeVisibleComment(comment: NoticeCommentRow) {
    setVisibleComments((rows) => rows.filter((row) => row.id !== comment.id));
    updateNoticeCommentCount(comment.notice_id, -1);
  }

  function deleteNotice(notice: NoticeBoardRow) {
    if (!canManageNotice(notice)) {
      setDeleteState({ ok: false, message: "본인이 작성한 게시글만 삭제할 수 있습니다." });
      return;
    }
    if (!window.confirm(`'${notice.title}' 게시글을 삭제하시겠습니까?`)) {
      return;
    }

    setDeleteState(null);
    startDeleteTransition(() => {
      const formData = new FormData();
      formData.append("id", notice.id);
      void deleteNoticeAction(null, formData)
        .then((result) => {
          setDeleteState(result);
          if (!result.ok) {
            return;
          }
          setVisibleNotices((rows) => rows.filter((row) => row.id !== notice.id));
          setVisibleImportantNotices((rows) => rows.filter((row) => row.id !== notice.id));
          if (detailNotice?.id === notice.id) {
            setDetailNotice(null);
          }
          if (collectionNotice?.id === notice.id) {
            setCollectionNotice(null);
          }
        })
        .catch(() => setDeleteState({ ok: false, message: "게시글을 삭제하지 못했습니다." }));
    });
  }

  function updateNoticeCollectionStatus(noticeId: string, status: NoticeCollectionStatus) {
    const updateNotice = (notice: NoticeBoardRow) => {
      if (notice.id !== noticeId) {
        return notice;
      }
      const parsed = parseNoticeContent(notice.content);
      const collectionStatuses = [
        ...parsed.collectionStatuses.filter((row) => row.department_id !== status.department_id),
        status
      ];
      return {
        ...notice,
        content: serializeNoticeContent({ ...parsed, collectionStatuses })
      };
    };
    setVisibleNotices((rows) => rows.map(updateNotice));
    setVisibleImportantNotices((rows) => rows.map(updateNotice));
    setDetailNotice((current) => (current ? updateNotice(current) : current));
    setCollectionNotice((current) => (current ? updateNotice(current) : current));
  }

  return (
    <section className="sketch-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#e8f1ff] text-[#075be8]">
            <Table2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="section-doodle-title">공지사항 게시판</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">제목을 선택하면 상세내용을 확인합니다.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <form method="get" action="/notices" className="flex flex-wrap items-center justify-end gap-2">
            <select
              name="type"
              defaultValue={defaultType ?? ""}
              aria-label="게시구분 검색"
              className="h-9 w-[132px] rounded-full border border-[#d7e4f6] bg-[#f5f9ff] px-3 text-xs font-black text-[#10223d] outline-none"
            >
              <option value="">전체구분</option>
              {noticeTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              name="q"
              defaultValue={defaultQuery ?? ""}
              aria-label="제목 검색"
              placeholder="제목 검색"
              className="h-9 w-[180px] rounded-full border border-[#d7e4f6] bg-[#f5f9ff] px-3 text-xs font-black text-[#10223d] outline-none"
            />
            <button className="tool-button tool-button-primary min-h-9 py-1.5">
              <Search className="h-4 w-4" aria-hidden="true" />
              검색
            </button>
          </form>
          {canCreate ? (
            <button type="button" onClick={() => setWriteOpen(true)} className="tool-button tool-button-primary min-h-9 py-1.5">
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              등록
            </button>
          ) : null}
        </div>
      </div>
      <ActionMessage state={deleteState} />

      {visibleImportantNotices.length > 0 ? (
        <div className="mb-3 rounded-2xl border border-blue-100 bg-[#f5f9ff] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-black text-[#10223d]">
            <Pin className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
            중요 게시글
          </div>
          <div className="grid gap-2 lg:grid-cols-5">
            {visibleImportantNotices.map((notice) => (
              <button
                key={notice.id}
                type="button"
                onClick={() => openNoticeDetail(notice)}
                className="min-w-0 rounded-2xl border border-[#d9e7f7] bg-white px-3 py-2 text-left shadow-[0_10px_22px_rgba(16,34,61,0.04)] transition hover:border-blue-200 hover:text-[#075be8]"
              >
                <span className="block text-[11px] font-black text-slate-400">{formatShortDate(notice.created_at)}</span>
                <span className="mt-1 block truncate text-sm font-black text-[#10223d]">{notice.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-hidden rounded-2xl border border-[#d9e7f7] bg-white/88">
        <table className="table-sticky w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[7%]" />
            <col className="w-[13%]" />
            <col className="w-[14%]" />
            <col className="w-[36%]" />
            <col className="w-[15%]" />
            <col className="w-[6%]" />
            <col className="w-[6%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-3 py-3">연번</th>
              <th className="px-3 py-3">등록일자</th>
              <th className="px-3 py-3">게시구분</th>
              <th className="px-3 py-3">제목</th>
              <th className="px-3 py-3">비고</th>
              <th className="px-3 py-3">조회수</th>
              <th className="px-3 py-3">댓글</th>
              <th className="px-3 py-3 text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {visibleNotices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                  등록된 게시글이 없습니다.
                </td>
              </tr>
            ) : (
              visibleNotices.map((notice, index) => {
                const parsedContent = parseNoticeContent(notice.content);
                return (
                  <tr key={notice.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 font-black text-slate-500">{index + 1}</td>
                    <td className="px-3 py-3 font-bold text-slate-600">{formatShortDate(notice.created_at)}</td>
                    <td className="px-3 py-3">
                      <NoticeTypeBadge type={notice.notice_type} />
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => openNoticeDetail(notice)}
                        className="text-left font-black text-[#075be8] underline-offset-4 hover:underline"
                      >
                        {notice.title}
                      </button>
                    </td>
                    <td className="whitespace-pre-wrap break-words px-3 py-3 text-slate-600">{parsedContent.note || "-"}</td>
                    <td className="px-3 py-3 font-black text-slate-600">{notice.view_count.toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#d9e7f7] bg-[#f5f9ff] px-2 py-1 text-xs font-black text-[#075be8]">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        {notice.comment_count}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingNotice(notice)}
                          disabled={!canManageNotice(notice)}
                          className="icon-tool-button h-8 w-8 disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`${notice.title} 수정`}
                          title={canManageNotice(notice) ? "게시글 수정" : "작성자만 수정할 수 있습니다."}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteNotice(notice)}
                          disabled={!canManageNotice(notice) || isDeleting}
                          className="icon-tool-button h-8 w-8 text-rose-600 disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`${notice.title} 삭제`}
                          title={canManageNotice(notice) ? "게시글 삭제" : "작성자만 삭제할 수 있습니다."}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {writeOpen ? (
        <NoticeWriteDialog
          onClose={() => setWriteOpen(false)}
          action={saveAction}
          state={saveState}
          isSaving={isNoticeSaving}
          departments={departments}
        />
      ) : null}
      {editingNotice ? (
        <NoticeWriteDialog
          notice={editingNotice}
          onClose={() => setEditingNotice(null)}
          action={saveAction}
          state={saveState}
          isSaving={isNoticeSaving}
          departments={departments}
        />
      ) : null}
      {detailNotice ? (
        <NoticeDetailDialog
          notice={detailNotice}
          comments={visibleComments.filter((comment) => comment.notice_id === detailNotice.id)}
          currentUser={currentUser}
          departments={departments}
          onClose={() => setDetailNotice(null)}
          onOpenCollection={() => setCollectionNotice(detailNotice)}
          onCommentSaved={upsertVisibleComment}
          onCommentDeleted={removeVisibleComment}
        />
      ) : null}
      {collectionNotice ? (
        <NoticeCollectionDialog
          notice={collectionNotice}
          departments={departments}
          currentUser={currentUser}
          onClose={() => {
            setCollectionNotice(null);
          }}
          onStatusSaved={(status) => updateNoticeCollectionStatus(collectionNotice.id, status)}
        />
      ) : null}
    </section>
  );
}

function NoticeWriteDialog({
  notice,
  onClose,
  action,
  state,
  isSaving,
  departments
}: {
  notice?: NoticeBoardRow;
  onClose: () => void;
  action: (payload: FormData) => void;
  state: Awaited<ReturnType<typeof saveNoticeAction>> | null;
  isSaving: boolean;
  departments: DepartmentRow[];
}) {
  const parsedNoticeContent = notice ? parseNoticeContent(notice.content) : null;
  const [noticeType, setNoticeType] = useState<NoticeType>(notice?.notice_type ?? "general");
  const [detail, setDetail] = useState(parsedNoticeContent?.detail ?? "");
  const [note, setNote] = useState(parsedNoticeContent?.note ?? "");
  const contentRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(notice);

  const handleSubmit = () => {
    const collectionStatuses =
      noticeType === "urgent"
        ? parsedNoticeContent?.collectionStatuses.length
          ? parsedNoticeContent.collectionStatuses
          : departments.map((department) => ({
              department_id: department.id,
              department_name: department.department_name,
              is_completed: false,
              confirmer_name: ""
            }))
        : [];
    if (contentRef.current) {
      contentRef.current.value = serializeNoticeContent({ detail, note, collectionStatuses });
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-slate-950/72 px-4 py-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="notice-write-title">
      <form
        action={action}
        onSubmit={handleSubmit}
        className="my-auto max-h-[calc(100vh-3rem)] w-full max-w-4xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/95 shadow-[0_28px_80px_rgba(16,34,61,0.24)]"
      >
        <input type="hidden" name="id" value={notice?.id ?? ""} />
        <input type="hidden" name="content" ref={contentRef} />
        <input type="hidden" name="is_active" value="true" />
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="notice-write-title" className="text-xl font-black text-[#10223d]">{isEdit ? "게시글 수정" : "게시글 작성"}</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">{isEdit ? "게시글 내용을 수정합니다." : "요청 항목만 입력하여 게시글을 등록합니다."}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="게시글 작성 팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto bg-[#f5f9ff] px-5 py-4">
          <div className="glass-row grid gap-3 p-3 md:grid-cols-[1fr_220px]">
            <label className="text-xs font-black text-slate-600">
              게시구분
              <select
                name="notice_type"
                value={noticeType}
                onChange={(event) => setNoticeType(event.target.value as NoticeType)}
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
              >
                {noticeTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="mt-5 inline-flex h-10 items-center gap-2 rounded-2xl border border-[#d9e7f7] bg-white px-4 text-sm font-black text-[#10223d]">
              <input type="checkbox" name="is_pinned" value="true" defaultChecked={notice?.is_pinned ?? false} className="h-4 w-4 accent-[#075be8]" />
              중요여부
            </label>
            <label className="text-xs font-black text-slate-600 md:col-span-2">
              제목
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={notice?.title ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal"
                placeholder="제목을 입력하세요."
              />
            </label>
            <label className="text-xs font-black text-slate-600 md:col-span-2">
              내용
              <textarea
                required
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                rows={7}
                className="mt-1 min-h-[180px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                placeholder="상세내용을 입력하세요."
              />
            </label>
            <label className="text-xs font-black text-slate-600 md:col-span-2">
              비고
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
                placeholder="기타내용을 입력하세요."
              />
            </label>
            <div className="md:col-span-2">
              <ActionMessage state={state} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} disabled={isSaving} className="tool-button disabled:opacity-50">취소</button>
          <button type="submit" disabled={isSaving} className="tool-button tool-button-primary disabled:opacity-50">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {isSaving ? "저장 중" : isEdit ? "수정" : "등록"}
          </button>
        </div>
      </form>
    </div>
    </ModalPortal>
  );
}

function NoticeDetailDialog({
  notice,
  comments,
  currentUser,
  departments,
  onClose,
  onOpenCollection,
  onCommentSaved,
  onCommentDeleted
}: {
  notice: NoticeBoardRow;
  comments: NoticeCommentRow[];
  currentUser: CurrentUser | null;
  departments: DepartmentRow[];
  onClose: () => void;
  onOpenCollection: () => void;
  onCommentSaved: (comment: NoticeCommentRow) => void;
  onCommentDeleted: (comment: NoticeCommentRow) => void;
}) {
  const parsedContent = parseNoticeContent(notice.content);
  const collectionRows = mergeCollectionStatuses(departments, parsedContent.collectionStatuses);
  const completedCount = collectionRows.filter((row) => row.is_completed).length;
  const [visibleComments, setVisibleComments] = useState(comments);

  function handleCommentSaved(comment: NoticeCommentRow) {
    setVisibleComments((rows) => {
      const exists = rows.some((row) => row.id === comment.id);
      return exists ? rows.map((row) => (row.id === comment.id ? comment : row)) : [...rows, comment];
    });
    onCommentSaved(comment);
  }

  function handleCommentDeleted(comment: NoticeCommentRow) {
    setVisibleComments((rows) => rows.filter((row) => row.id !== comment.id));
    onCommentDeleted(comment);
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto bg-slate-950/72 px-4 py-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="notice-detail-title">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/95 shadow-[0_28px_80px_rgba(16,34,61,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <NoticeTypeBadge type={notice.notice_type} />
            <h2 id="notice-detail-title" className="mt-3 text-xl font-black text-[#10223d]">{notice.title}</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">등록일자 {formatShortDate(notice.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="상세 팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[64vh] overflow-y-auto bg-[#f5f9ff] px-5 py-4">
          <section className="rounded-2xl border border-[#d9e7f7] bg-white px-4 py-3">
            <p className="text-xs font-black text-slate-500">내용</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#10223d]">{parsedContent.detail || "-"}</p>
          </section>
          {notice.notice_type === "urgent" ? (
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={onOpenCollection} className="tool-button">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                취합완료 체크 {completedCount}/{collectionRows.length}
              </button>
            </div>
          ) : null}
          {parsedContent.note ? (
            <section className="mt-3 rounded-2xl border border-[#d9e7f7] bg-white px-4 py-3">
              <p className="text-xs font-black text-slate-500">비고</p>
              <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{parsedContent.note}</p>
            </section>
          ) : null}
          <NoticeCommentsSection
            noticeId={notice.id}
            comments={visibleComments}
            currentUser={currentUser}
            onCommentSaved={handleCommentSaved}
            onCommentDeleted={handleCommentDeleted}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="tool-button tool-button-primary">닫기</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function NoticeCommentsSection({
  noticeId,
  comments,
  currentUser,
  onCommentSaved,
  onCommentDeleted
}: {
  noticeId: string;
  comments: NoticeCommentRow[];
  currentUser: CurrentUser | null;
  onCommentSaved: (comment: NoticeCommentRow) => void;
  onCommentDeleted: (comment: NoticeCommentRow) => void;
}) {
  const commentTree = buildNoticeCommentTree(comments);

  return (
    <section className="mt-3 rounded-2xl border border-[#d9e7f7] bg-white px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
          <p className="text-sm font-black text-[#10223d]">댓글 {comments.length}</p>
        </div>
      </div>
      <NoticeCommentForm
        noticeId={noticeId}
        currentUser={currentUser}
        submitLabel="댓글 등록"
        onCommentSaved={onCommentSaved}
      />
      <div className="mt-4 space-y-2">
        {commentTree.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#b9cce6] px-4 py-6 text-center text-sm font-bold text-slate-400">
            아직 등록된 댓글이 없습니다.
          </div>
        ) : (
          commentTree.map((comment) => (
            <NoticeCommentItem
              key={comment.id}
              comment={comment}
              currentUser={currentUser}
              onCommentSaved={onCommentSaved}
              onCommentDeleted={onCommentDeleted}
            />
          ))
        )}
      </div>
    </section>
  );
}

function NoticeCommentForm({
  noticeId,
  parentId,
  commentId,
  initialContent = "",
  currentUser,
  submitLabel,
  onCancel,
  onCommentSaved
}: {
  noticeId: string;
  parentId?: string | null;
  commentId?: string;
  initialContent?: string;
  currentUser: CurrentUser | null;
  submitLabel: string;
  onCancel?: () => void;
  onCommentSaved: (comment: NoticeCommentRow) => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [state, setState] = useState<Awaited<ReturnType<typeof saveNoticeCommentAction>> | null>(null);
  const [isPending, startTransition] = useTransition();
  const disabled = isPending || !currentUser;

  function submitComment() {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setState({ ok: false, message: "댓글 내용을 입력하세요." });
      return;
    }

    setState(null);
    startTransition(() => {
      const formData = new FormData();
      formData.set("notice_id", noticeId);
      formData.set("content", trimmedContent);
      if (parentId) {
        formData.set("parent_id", parentId);
      }
      if (commentId) {
        formData.set("id", commentId);
      }

      void saveNoticeCommentAction(formData)
        .then((result) => {
          setState(result);
          if (!result.ok || !result.data) {
            return;
          }
          onCommentSaved(result.data);
          if (!commentId) {
            setContent("");
          }
          onCancel?.();
        })
        .catch(() => setState({ ok: false, message: "댓글을 저장하지 못했습니다." }));
    });
  }

  return (
    <div className="rounded-2xl border border-[#d9e7f7] bg-[#f5f9ff] p-3">
      <label className="sr-only" htmlFor={`comment-${commentId ?? parentId ?? noticeId}`}>
        댓글 내용
      </label>
      <textarea
        id={`comment-${commentId ?? parentId ?? noticeId}`}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        disabled={disabled}
        rows={commentId || parentId ? 3 : 4}
        className="min-h-20 w-full rounded-2xl border border-[#d7e4f6] bg-white px-3 py-2 text-sm font-semibold leading-6 text-[#10223d] outline-none disabled:opacity-60"
        placeholder={currentUser ? "댓글을 입력하세요." : "로그인 후 댓글을 등록할 수 있습니다."}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <ActionMessage state={state} />
        <div className="ml-auto flex gap-2">
          {onCancel ? (
            <button type="button" onClick={onCancel} disabled={isPending} className="tool-button min-h-9 py-1.5 disabled:opacity-50">
              취소
            </button>
          ) : null}
          <button
            type="button"
            onClick={submitComment}
            disabled={disabled}
            className="tool-button tool-button-primary min-h-9 py-1.5 disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {isPending ? "저장 중" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoticeCommentItem({
  comment,
  currentUser,
  onCommentSaved,
  onCommentDeleted,
  depth = 0
}: {
  comment: NoticeCommentTreeNode<NoticeCommentRow>;
  currentUser: CurrentUser | null;
  onCommentSaved: (comment: NoticeCommentRow) => void;
  onCommentDeleted: (comment: NoticeCommentRow) => void;
  depth?: number;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [state, setState] = useState<Awaited<ReturnType<typeof deleteNoticeCommentAction>> | null>(null);
  const [isPending, startTransition] = useTransition();
  const canManage = currentUser?.app_role === "admin" || currentUser?.id === comment.created_by;

  function deleteComment() {
    if (!window.confirm("댓글을 삭제하시겠습니까?")) {
      return;
    }

    setState(null);
    startTransition(() => {
      const formData = new FormData();
      formData.set("id", comment.id);
      void deleteNoticeCommentAction(formData)
        .then((result) => {
          setState(result);
          if (!result.ok) {
            return;
          }
          onCommentDeleted(comment);
        })
        .catch(() => setState({ ok: false, message: "댓글을 삭제하지 못했습니다." }));
    });
  }

  return (
    <article
      className="rounded-2xl border border-[#d9e7f7] bg-white p-3"
      style={{ marginLeft: depth > 0 ? `${Math.min(depth, 6) * 18}px` : undefined }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {depth > 0 ? <Reply className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> : null}
            <p className="font-black text-[#10223d]">{comment.author_name}</p>
            {comment.author_department_name ? (
              <span className="rounded-full bg-[#f5f9ff] px-2 py-0.5 text-[11px] font-black text-slate-500">
                {comment.author_department_name}
              </span>
            ) : null}
            <span className="text-xs font-bold text-slate-400">{formatCollectionDateTime(comment.created_at)}</span>
          </div>
          {isEditing ? (
            <div className="mt-2">
              <NoticeCommentForm
                noticeId={comment.notice_id}
                commentId={comment.id}
                initialContent={comment.content}
                currentUser={currentUser}
                submitLabel="수정 완료"
                onCancel={() => setIsEditing(false)}
                onCommentSaved={(savedComment) => {
                  onCommentSaved(savedComment);
                  setIsEditing(false);
                }}
              />
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-700">{comment.content}</p>
          )}
          <ActionMessage state={state} />
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <button type="button" onClick={() => setIsReplying((value) => !value)} className="icon-tool-button" aria-label="답글 등록">
            <Reply className="h-4 w-4" aria-hidden="true" />
          </button>
          {canManage ? (
            <>
              <button type="button" onClick={() => setIsEditing(true)} className="icon-tool-button" aria-label="댓글 수정">
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={deleteComment}
                disabled={isPending}
                className="icon-tool-button text-rose-600 disabled:opacity-50"
                aria-label="댓글 삭제"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      </div>
      {isReplying ? (
        <div className="mt-3">
          <NoticeCommentForm
            noticeId={comment.notice_id}
            parentId={comment.id}
            currentUser={currentUser}
            submitLabel="답글 등록"
            onCancel={() => setIsReplying(false)}
            onCommentSaved={(savedComment) => {
              onCommentSaved(savedComment);
              setIsReplying(false);
            }}
          />
        </div>
      ) : null}
      {comment.replies.length > 0 ? (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply) => (
            <NoticeCommentItem
              key={reply.id}
              comment={reply}
              currentUser={currentUser}
              onCommentSaved={onCommentSaved}
              onCommentDeleted={onCommentDeleted}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function NoticeCollectionDialog({
  notice,
  departments,
  currentUser,
  onClose,
  onStatusSaved
}: {
  notice: NoticeBoardRow;
  departments: DepartmentRow[];
  currentUser: CurrentUser | null;
  onClose: () => void;
  onStatusSaved: (status: NoticeCollectionStatus) => void;
}) {
  const parsedContent = useMemo(() => parseNoticeContent(notice.content), [notice.content]);
  const initialRows = useMemo(
    () => mergeCollectionStatuses(departments, parsedContent.collectionStatuses),
    [departments, parsedContent.collectionStatuses]
  );
  const [currentRows, setCurrentRows] = useState(initialRows);
  const [state, setState] = useState<Awaited<ReturnType<typeof saveNoticeCollectionStatusAction>> | null>(null);
  const [pendingDepartmentId, setPendingDepartmentId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function updateMyDepartmentStatus(nextCompleted: boolean) {
    if (!currentUser?.department_id) {
      setState({ ok: false, message: "소속 부서가 지정된 사용자만 완료여부를 입력할 수 있습니다." });
      return;
    }

    const previousRows = currentRows;
    const optimisticUpdatedAt = nextCompleted ? new Date().toISOString() : undefined;
    setState(null);
    setPendingDepartmentId(currentUser.department_id);
    setCurrentRows((rows) =>
      rows.map((row) =>
        row.department_id === currentUser.department_id
          ? {
              ...row,
              is_completed: nextCompleted,
              confirmer_name: nextCompleted ? currentUser.full_name : "",
              updated_at: optimisticUpdatedAt
            }
          : row
      )
    );

    startTransition(() => {
      const formData = new FormData();
      formData.set("notice_id", notice.id);
      formData.set("is_completed", nextCompleted ? "true" : "false");

      void saveNoticeCollectionStatusAction(formData)
        .then((result) => {
          setState(result);
          if (!result.ok) {
            setCurrentRows(previousRows);
            return;
          }
          if (result.data) {
            const savedStatus = result.data;
            onStatusSaved(savedStatus);
            setCurrentRows((rows) =>
              rows.map((row) =>
                row.department_id === savedStatus.department_id
                  ? {
                      ...row,
                      is_completed: savedStatus.is_completed,
                      confirmer_name: savedStatus.confirmer_name,
                      updated_at: savedStatus.updated_at
                    }
                  : row
              )
            );
          }
        })
        .catch(() => {
          setCurrentRows(previousRows);
          setState({ ok: false, message: "자료취합 완료여부를 저장하지 못했습니다." });
        })
        .finally(() => {
          setPendingDepartmentId(null);
        });
    });
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[230] flex items-start justify-center overflow-y-auto bg-slate-950/72 px-4 py-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="notice-collection-title">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/95 shadow-[0_28px_80px_rgba(16,34,61,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="notice-collection-title" className="text-xl font-black text-[#10223d]">취합완료여부 확인</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">{notice.title}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-tool-button" aria-label="취합완료 팝업 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[58vh] overflow-y-auto bg-[#f5f9ff] px-5 py-4">
          <div className="overflow-hidden rounded-2xl border border-[#d9e7f7] bg-white">
            <table className="table-sticky w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[18%]" />
                <col className="w-[25%]" />
                <col className="w-[25%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-3 py-3">부서명</th>
                  <th className="px-3 py-3">완료여부</th>
                  <th className="px-3 py-3">확인자</th>
                  <th className="px-3 py-3">확인시간</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row) => {
                  const isMine = row.department_id === currentUser?.department_id;
                  const isRowPending = pendingDepartmentId === row.department_id;
                  return (
                    <tr key={row.department_id} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-black text-[#10223d]">{row.department_name}</td>
                      <td className="px-3 py-3">
                        {isMine ? (
                          <label className="inline-flex items-center gap-2 font-bold text-slate-700">
                            <input
                              type="checkbox"
                              checked={row.is_completed}
                              onChange={(event) => updateMyDepartmentStatus(event.target.checked)}
                              disabled={isRowPending}
                              className="h-4 w-4 accent-[#075be8] disabled:opacity-50"
                            />
                            {isRowPending ? "저장 중" : "완료"}
                          </label>
                        ) : (
                          <span className={row.is_completed ? "font-black text-emerald-600" : "font-bold text-slate-400"}>
                            {row.is_completed ? "완료" : "미완료"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={row.confirmer_name ? "font-bold text-slate-700" : "font-bold text-slate-400"}>
                          {row.confirmer_name || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-600">{formatCollectionDateTime(row.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <ActionMessage state={state} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="tool-button tool-button-primary">닫기</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
