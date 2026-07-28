"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, FilePlus2, Megaphone, Pin, Search, Send, Table2, X } from "lucide-react";
import { saveNoticeAction, saveNoticeCollectionStatusAction } from "@/actions/notices";
import { ActionMessage } from "@/components/common/ActionMessage";
import {
  parseNoticeContent,
  serializeNoticeContent,
  type NoticeCollectionStatus,
} from "@/lib/notices/content";
import { noticeTypeLabels } from "@/lib/utils/labels";
import type { NoticeType } from "@/types/enums";

type NoticeBoardRow = {
  id: string;
  notice_type: NoticeType;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
};

type DepartmentRow = {
  id: string;
  department_name: string;
};

type CurrentUser = {
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
  departments,
  canCreate,
  currentUser,
  defaultQuery,
  defaultType
}: {
  notices: NoticeBoardRow[];
  importantNotices: NoticeBoardRow[];
  departments: DepartmentRow[];
  canCreate: boolean;
  currentUser: CurrentUser | null;
  defaultQuery?: string;
  defaultType?: NoticeType | "";
}) {
  const router = useRouter();
  const [writeOpen, setWriteOpen] = useState(false);
  const [detailNotice, setDetailNotice] = useState<NoticeBoardRow | null>(null);
  const [collectionNotice, setCollectionNotice] = useState<NoticeBoardRow | null>(null);
  const [saveState, saveAction, isNoticeSaving] = useActionState(
    async (previousState: Awaited<ReturnType<typeof saveNoticeAction>> | null, formData: FormData) => {
      const result = await saveNoticeAction(previousState, formData);
      if (result.ok) {
        setWriteOpen(false);
        router.refresh();
      }
      return result;
    },
    null
  );

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

      {importantNotices.length > 0 ? (
        <div className="mb-3 rounded-2xl border border-blue-100 bg-[#f5f9ff] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-black text-[#10223d]">
            <Pin className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
            중요 게시글
          </div>
          <div className="grid gap-2 lg:grid-cols-5">
            {importantNotices.map((notice) => (
              <button
                key={notice.id}
                type="button"
                onClick={() => setDetailNotice(notice)}
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
            <col className="w-[8%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[44%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-3 py-3">연번</th>
              <th className="px-3 py-3">등록일자</th>
              <th className="px-3 py-3">게시구분</th>
              <th className="px-3 py-3">제목</th>
              <th className="px-3 py-3">비고</th>
            </tr>
          </thead>
          <tbody>
            {notices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                  등록된 게시글이 없습니다.
                </td>
              </tr>
            ) : (
              notices.map((notice, index) => {
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
                        onClick={() => setDetailNotice(notice)}
                        className="text-left font-black text-[#075be8] underline-offset-4 hover:underline"
                      >
                        {notice.title}
                      </button>
                    </td>
                    <td className="whitespace-pre-wrap break-words px-3 py-3 text-slate-600">{parsedContent.note || "-"}</td>
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
      {detailNotice ? (
        <NoticeDetailDialog
          notice={detailNotice}
          departments={departments}
          onClose={() => setDetailNotice(null)}
          onOpenCollection={() => setCollectionNotice(detailNotice)}
        />
      ) : null}
      {collectionNotice ? (
        <NoticeCollectionDialog
          notice={collectionNotice}
          departments={departments}
          currentUser={currentUser}
          onClose={() => {
            setCollectionNotice(null);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function NoticeWriteDialog({
  onClose,
  action,
  state,
  isSaving,
  departments
}: {
  onClose: () => void;
  action: (payload: FormData) => void;
  state: Awaited<ReturnType<typeof saveNoticeAction>> | null;
  isSaving: boolean;
  departments: DepartmentRow[];
}) {
  const [noticeType, setNoticeType] = useState<NoticeType>("general");
  const [detail, setDetail] = useState("");
  const [note, setNote] = useState("");
  const contentRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const collectionStatuses =
      noticeType === "urgent"
        ? departments.map((department) => ({
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
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="content" ref={contentRef} />
        <input type="hidden" name="is_active" value="true" />
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="notice-write-title" className="text-xl font-black text-[#10223d]">게시글 작성</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">요청 항목만 입력하여 게시글을 등록합니다.</p>
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
              <input type="checkbox" name="is_pinned" value="true" className="h-4 w-4 accent-[#075be8]" />
              중요여부
            </label>
            <label className="text-xs font-black text-slate-600 md:col-span-2">
              제목
              <input
                name="title"
                required
                maxLength={200}
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
            {isSaving ? "등록 중" : "등록"}
          </button>
        </div>
      </form>
    </div>
    </ModalPortal>
  );
}

function NoticeDetailDialog({
  notice,
  departments,
  onClose,
  onOpenCollection
}: {
  notice: NoticeBoardRow;
  departments: DepartmentRow[];
  onClose: () => void;
  onOpenCollection: () => void;
}) {
  const parsedContent = parseNoticeContent(notice.content);
  const collectionRows = mergeCollectionStatuses(departments, parsedContent.collectionStatuses);
  const completedCount = collectionRows.filter((row) => row.is_completed).length;

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
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="tool-button tool-button-primary">닫기</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function NoticeCollectionDialog({
  notice,
  departments,
  currentUser,
  onClose
}: {
  notice: NoticeBoardRow;
  departments: DepartmentRow[];
  currentUser: CurrentUser | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const parsedContent = parseNoticeContent(notice.content);
  const rows = mergeCollectionStatuses(departments, parsedContent.collectionStatuses);
  const myDepartmentRow = rows.find((row) => row.department_id === currentUser?.department_id);
  const [isCompleted, setIsCompleted] = useState(myDepartmentRow?.is_completed ?? false);
  const [confirmerName, setConfirmerName] = useState(myDepartmentRow?.confirmer_name || currentUser?.full_name || "");
  const [state, action] = useActionState(saveNoticeCollectionStatusAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [router, state]);

  const currentRows = rows.map((row) =>
    row.department_id === currentUser?.department_id
      ? { ...row, is_completed: isCompleted, confirmer_name: confirmerName }
      : row
  );

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
        <form action={action}>
          <input type="hidden" name="notice_id" value={notice.id} />
          <input type="hidden" name="is_completed" value={isCompleted ? "true" : "false"} />
          <div className="max-h-[58vh] overflow-y-auto bg-[#f5f9ff] px-5 py-4">
            <div className="overflow-hidden rounded-2xl border border-[#d9e7f7] bg-white">
              <table className="table-sticky w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[22%]" />
                  <col className="w-[38%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-3">부서명</th>
                    <th className="px-3 py-3">완료여부</th>
                    <th className="px-3 py-3">확인자</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map((row) => {
                    const isMine = row.department_id === currentUser?.department_id;
                    return (
                      <tr key={row.department_id} className="border-t border-slate-100">
                        <td className="px-3 py-3 font-black text-[#10223d]">{row.department_name}</td>
                        <td className="px-3 py-3">
                          {isMine ? (
                            <label className="inline-flex items-center gap-2 font-bold text-slate-700">
                              <input
                                type="checkbox"
                                checked={isCompleted}
                                onChange={(event) => setIsCompleted(event.target.checked)}
                                className="h-4 w-4 accent-[#075be8]"
                              />
                              완료
                            </label>
                          ) : (
                            <span className={row.is_completed ? "font-black text-emerald-600" : "font-bold text-slate-400"}>
                              {row.is_completed ? "완료" : "미완료"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {isMine ? (
                            <input
                              name="confirmer_name"
                              value={confirmerName}
                              onChange={(event) => setConfirmerName(event.target.value)}
                              className="h-9 w-full rounded-full border border-[#d7e4f6] bg-[#f5f9ff] px-3 text-sm font-bold text-[#10223d] outline-none"
                              placeholder="확인자 이름"
                            />
                          ) : (
                            <span className="font-bold text-slate-600">{row.confirmer_name || "-"}</span>
                          )}
                        </td>
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
            <button type="button" onClick={onClose} className="tool-button">닫기</button>
            <button type="submit" disabled={!currentUser?.department_id} className="tool-button tool-button-primary disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
}
