import type { Comment } from '../types';

export interface CommentThreadNode {
  comment: Comment;
  children: CommentThreadNode[];
}

export interface RootPreviewRow {
  comment: Comment;
  /** Total nested comments under this root (not counting the root). */
  replyCount: number;
}

function commentTime(c: Comment): number {
  return new Date(c.created_at || 0).getTime();
}

/**
 * Build a comment forest: roots are top-level comments or orphans (missing parent in set).
 * Direct replies are sorted oldest-first under each parent.
 */
export function buildCommentForest(flat: Comment[]): CommentThreadNode[] {
  const byId = new Map(flat.map(c => [c.id, c]));
  const childrenByParent = new Map<string, Comment[]>();

  for (const c of flat) {
    const pid = c.parent_id;
    if (pid && byId.has(pid)) {
      const arr = childrenByParent.get(pid) ?? [];
      arr.push(c);
      childrenByParent.set(pid, arr);
    }
  }

  const roots = flat.filter(c => {
    const pid = c.parent_id;
    return !pid || !byId.has(pid);
  });

  function buildNode(c: Comment): CommentThreadNode {
    const raw = childrenByParent.get(c.id) ?? [];
    const kids = [...raw].sort((a, b) => commentTime(a) - commentTime(b));
    return { comment: c, children: kids.map(buildNode) };
  }

  roots.sort((a, b) => commentTime(a) - commentTime(b));
  return roots.map(buildNode);
}

export function countSubtreeComments(node: CommentThreadNode): number {
  return node.children.reduce(
    (acc, ch) => acc + 1 + countSubtreeComments(ch),
    0
  );
}

/** Newest root threads first, for card preview (up to `limit` roots). */
export function getNewestRootPreviews(
  forest: CommentThreadNode[],
  limit: number
): RootPreviewRow[] {
  const sorted = [...forest].sort(
    (a, b) => commentTime(b.comment) - commentTime(a.comment)
  );
  return sorted.slice(0, limit).map(node => ({
    comment: node.comment,
    replyCount: countSubtreeComments(node),
  }));
}

/** Single newest root thread for compact card preview; optional first reply (oldest reply). */
export function getSingleNewestThreadPreview(
  forest: CommentThreadNode[]
): {
  root: CommentThreadNode;
  firstReply: CommentThreadNode | null;
  subtreeReplyCount: number;
} | null {
  if (forest.length === 0) return null;
  const sorted = [...forest].sort(
    (a, b) => commentTime(b.comment) - commentTime(a.comment)
  );
  const root = sorted[0];
  const firstReply = root.children[0] ?? null;
  const subtreeReplyCount = countSubtreeComments(root);
  return { root, firstReply, subtreeReplyCount };
}
