"use client";

import { useActionState } from "react";
import { saveNoticeAction } from "@/actions/notices";
import { ActionMessage } from "@/components/common/ActionMessage";
import { SubmitButton } from "@/components/common/SubmitButton";
import type { NoticeType } from "@/types/enums";

type NoticeFormValue = {
  id?: string;
  notice_type?: NoticeType;
  title?: string;
  content?: string;
  is_pinned?: boolean;
  publish_start_date?: string | null;
  publish_end_date?: string | null;
  is_active?: boolean;
};

export function NoticeForm({ notice }: { notice?: NoticeFormValue }) {
  const [state, action] = useActionState(saveNoticeAction, null);
  return (
    <form action={action} className="sketch-panel space-y-4 p-5">
      <input type="hidden" name="id" value={notice?.id ?? ""} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="notice_type" className="block text-sm font-medium text-slate-700">
            공지 구분
          </label>
          <select
            id="notice_type"
            name="notice_type"
            defaultValue={notice?.notice_type ?? "general"}
            className="mt-1 h-10 w-full rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-3 text-sm text-[#012241]"
          >
            <option value="general">일반</option>
            <option value="important">중요</option>
            <option value="urgent">긴급</option>
            <option value="system">시스템</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="mt-7 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="is_pinned" value="true" defaultChecked={notice?.is_pinned} />
            상단 고정
          </label>
          <label className="mt-7 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="is_active" value="true" defaultChecked={notice?.is_active ?? true} />
            사용
          </label>
        </div>
      </div>
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-700">
          제목
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={notice?.title}
          className="mt-1 h-10 w-full rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-3 text-sm text-[#012241]"
        />
      </div>
      <div>
        <label htmlFor="content" className="block text-sm font-medium text-slate-700">
          내용
        </label>
        <textarea
          id="content"
          name="content"
          required
          rows={6}
          defaultValue={notice?.content}
          className="mt-1 w-full rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-3 py-2 text-sm text-[#012241]"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="publish_start_date" className="block text-sm font-medium text-slate-700">
            게시 시작일
          </label>
          <input
            id="publish_start_date"
            name="publish_start_date"
            type="date"
            defaultValue={notice?.publish_start_date ?? ""}
            className="mt-1 h-10 w-full rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-3 text-sm text-[#012241]"
          />
        </div>
        <div>
          <label htmlFor="publish_end_date" className="block text-sm font-medium text-slate-700">
            게시 종료일
          </label>
          <input
            id="publish_end_date"
            name="publish_end_date"
            type="date"
            defaultValue={notice?.publish_end_date ?? ""}
            className="mt-1 h-10 w-full rounded-2xl border border-[#e4dac9] bg-[#fbf8f2] px-3 text-sm text-[#012241]"
          />
        </div>
      </div>
      <ActionMessage state={state} />
      <SubmitButton>공지 저장</SubmitButton>
    </form>
  );
}
