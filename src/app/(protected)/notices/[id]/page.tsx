import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteNoticeButton } from "@/components/notices/DeleteNoticeButton";
import { NoticeForm } from "@/components/notices/NoticeForm";
import { PageHeader } from "@/components/common/PageHeader";
import { incrementNoticeView } from "@/actions/notices";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime, noticeTypeLabels } from "@/lib/utils/labels";
import type { NoticeType } from "@/types/enums";

type NoticeDetail = {
  id: string;
  notice_type: NoticeType;
  title: string;
  content: string;
  is_pinned: boolean;
  publish_start_date: string | null;
  publish_end_date: string | null;
  is_active: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  profiles: { full_name: string } | null;
};

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { profile } = await getCurrentUserProfile();
  if (!supabase) {
    notFound();
  }
  await incrementNoticeView(id);
  const { data } = await supabase
    .from("notices")
    .select("id,notice_type,title,content,is_pinned,publish_start_date,publish_end_date,is_active,view_count,created_at,updated_at,profiles(full_name)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const notice = data as unknown as NoticeDetail | null;
  if (!notice) {
    notFound();
  }
  return (
    <>
      <PageHeader title="공지사항 상세" description="공지 내용은 일반 텍스트로 안전하게 표시됩니다." />
      <article className="sketch-panel p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="section-chip">{noticeTypeLabels[notice.notice_type]}</span>
          <span>작성자 {notice.profiles?.full_name ?? "-"}</span>
          <span>등록 {formatDateTime(notice.created_at)}</span>
          <span>수정 {formatDateTime(notice.updated_at)}</span>
          <span>조회 {notice.view_count}</span>
        </div>
        <h1 className="mt-4 text-2xl font-black text-[#10223d]">{notice.title}</h1>
        <div className="glass-fieldset mt-6 whitespace-pre-wrap p-4 text-sm leading-7 text-slate-800">{notice.content}</div>
      </article>
      <div className="mt-4 flex gap-2">
        <Link href="/notices" className="tool-button">
          목록
        </Link>
      </div>
      {isAdmin(profile) ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto]">
          <NoticeForm notice={notice} />
          <DeleteNoticeButton id={notice.id} />
        </div>
      ) : null}
    </>
  );
}
