import { NoticeBoard } from "@/components/notices/NoticeBoard";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
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
  created_by: string | null;
  created_at: string;
};

type DepartmentRow = {
  id: string;
  department_name: string;
};

type NoticeQueryRow = Omit<NoticeRow, "comment_count"> & {
  notice_comments: { count: number }[] | null;
};

function toNoticeRow(row: NoticeQueryRow): NoticeRow {
  const { notice_comments: commentCounts, ...notice } = row;
  return { ...notice, comment_count: Number(commentCounts?.[0]?.count ?? 0) };
}

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

  if (supabase) {
    let query = supabase
      .from("notices")
      .select("id,notice_type,title,content,is_pinned,view_count,created_by,created_at,notice_comments(count)")
      .is("deleted_at", null)
      .is("notice_comments.deleted_at", null)
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
      .select("id,notice_type,title,content,is_pinned,view_count,created_by,created_at,notice_comments(count)")
      .is("deleted_at", null)
      .is("notice_comments.deleted_at", null)
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
    notices = ((data ?? []) as unknown as NoticeQueryRow[]).map(toNoticeRow);
    importantNotices = ((importantNoticeData ?? []) as unknown as NoticeQueryRow[]).map(toNoticeRow);
    departments = (departmentData ?? []) as DepartmentRow[];
  }

  return (
    <NoticeBoard
      notices={notices}
      importantNotices={importantNotices}
      comments={[]}
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
