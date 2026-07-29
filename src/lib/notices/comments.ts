export type NoticeCommentLike = {
  id: string;
  notice_id: string;
  parent_id: string | null;
  created_at: string;
};

export type NoticeCommentTreeNode<T extends NoticeCommentLike> = T & {
  replies: NoticeCommentTreeNode<T>[];
};

export function buildNoticeCommentTree<T extends NoticeCommentLike>(comments: T[]): NoticeCommentTreeNode<T>[] {
  const nodes = new Map<string, NoticeCommentTreeNode<T>>();
  const roots: NoticeCommentTreeNode<T>[] = [];

  comments
    .slice()
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .forEach((comment) => {
      nodes.set(comment.id, { ...comment, replies: [] });
    });

  nodes.forEach((node) => {
    const parent = node.parent_id ? nodes.get(node.parent_id) : null;
    if (parent && parent.notice_id === node.notice_id) {
      parent.replies.push(node);
      return;
    }
    roots.push(node);
  });

  return roots;
}

export function countNoticeCommentsByNoticeId(comments: NoticeCommentLike[]) {
  const countMap = new Map<string, number>();
  comments.forEach((comment) => {
    countMap.set(comment.notice_id, (countMap.get(comment.notice_id) ?? 0) + 1);
  });
  return countMap;
}
