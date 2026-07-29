import { describe, expect, it } from "vitest";
import { buildNoticeCommentTree, countNoticeCommentsByNoticeId } from "@/lib/notices/comments";

const comments = [
  { id: "2", notice_id: "notice-a", parent_id: "1", created_at: "2026-07-29T09:01:00.000Z" },
  { id: "1", notice_id: "notice-a", parent_id: null, created_at: "2026-07-29T09:00:00.000Z" },
  { id: "3", notice_id: "notice-a", parent_id: "2", created_at: "2026-07-29T09:02:00.000Z" },
  { id: "4", notice_id: "notice-b", parent_id: null, created_at: "2026-07-29T09:03:00.000Z" }
];

describe("notice comments", () => {
  it("builds nested reply trees in chronological order", () => {
    const tree = buildNoticeCommentTree(comments.filter((comment) => comment.notice_id === "notice-a"));

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe("1");
    expect(tree[0]?.replies[0]?.id).toBe("2");
    expect(tree[0]?.replies[0]?.replies[0]?.id).toBe("3");
  });

  it("counts comments per notice", () => {
    const countMap = countNoticeCommentsByNoticeId(comments);

    expect(countMap.get("notice-a")).toBe(3);
    expect(countMap.get("notice-b")).toBe(1);
  });
});
