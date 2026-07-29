import { NoticeBoard } from "@/components/notices/NoticeBoard";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { countNoticeCommentsByNoticeId } from "@/lib/notices/comments";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NoticeType } from "@/types/enums";

type NoticeRow = {
  id: string;
  notice_type: NoticeType;
  title: string;
  content: string;
  is_pinned: boolean;
  view_count: number;
  comment_count: number;
  created_at: string;
};

type DepartmentRow = {
  id: string;
  department_name: string;
};

type NoticeCommentRow = {
  id: string;
  notice_id: string;
  parent_id: string | null;
  content: string;
  author_name: string;
  author_department_name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export default async function NoticesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; type?: NoticeType; page?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentUserProfile();
  const supabase = await createSupabaseServerClient();
  const page = Math.max(Number(params.page ?? 1), 1);
  const from = (page - 1) * 10;
  const to = from + 9;
  let notices: NoticeRow[] = [];
  let importantNotices: NoticeRow[] = [];
  let departments: DepartmentRow[] = [];
  let comments: NoticeCommentRow[] = [];

  if (supabase) {
    let query = supabase
      .from("notices")
      .select("id,notice_type,title,content,is_pinned,view_count,created_at")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (params.q) {
      query = query.ilike("title", `%${params.q}%`);
    }
    if (params.type) {
      query = query.eq("notice_type", params.type);
    }
    const importantNoticeQuery = supabase
      .from("notices")
      .select("id,notice_type,title,content,is_pinned,view_count,created_at")
      .is("deleted_at", null)
      .eq("is_active", true)
      .eq("is_pinned", true)
      .order("created_at", { ascending: false })
      .limit(5);
    const departmentQuery = supabase
      .from("departments")
      .select("id,department_name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("department_name", { ascending: true });
    const [{ data }, { data: importantNoticeData }, { data: departmentData }] = await Promise.all([
      query,
      importantNoticeQuery,
      departmentQuery
    ]);
    const noticeRows = (data ?? []) as unknown as Omit<NoticeRow, "comment_count">[];
    const importantNoticeRows = (importantNoticeData ?? []) as unknown as Omit<NoticeRow, "comment_count">[];
    const noticeIds = Array.from(new Set([...noticeRows, ...importantNoticeRows].map((notice) => notice.id)));
    if (noticeIds.length > 0) {
      const { data: commentData } = await supabase
        .from("notice_comments")
        .select("id,notice_id,parent_id,content,author_name,author_department_name,created_by,created_at,updated_at")
        .in("notice_id", noticeIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      comments = (commentData ?? []) as unknown as NoticeCommentRow[];
    }
    const commentCountMap = countNoticeCommentsByNoticeId(comments);
    notices = noticeRows.map((notice) => ({ ...notice, comment_count: commentCountMap.get(notice.id) ?? 0 }));
    importantNotices = importantNoticeRows.map((notice) => ({ ...notice, comment_count: commentCountMap.get(notice.id) ?? 0 }));
    departments = (departmentData ?? []) as DepartmentRow[];
  }

  return (
    <NoticeBoard
      notices={notices}
      importantNotices={importantNotices}
      comments={comments}
      departments={departments}
      canCreate={isAdmin(profile)}
      currentUser={
        profile
          ? {
              id: profile.id,
              app_role: profile.app_role,
              department_id: profile.department_id,
              department_name: profile.department_name,
              full_name: profile.full_name
            }
          : null
      }
      defaultQuery={params.q ?? ""}
      defaultType={params.type ?? ""}
    />
  );
}
