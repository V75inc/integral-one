import { MessageSquare } from 'lucide-react';

import { LINE_ICON_STROKE } from '../../ui';
import { Surface } from '../../../ui';
import { EmptyState } from '../../ui/EmptyState';
import { CommentThread } from '../CommentThread';
import type { Comment, User } from '../../../types';

/**
 * The discussion region for one entry: loading, empty, thread.
 *
 * One widget, every surface. The authenticated entry dialog, the wiki inline
 * page view and the public shared-track link each carried their own version
 * of this, and they had diverged in every visible respect — the public one
 * rendered flat cards with a date-only stamp and an italic "No comments yet.
 * Write the first one below!" where the signed-in one rendered an avatared,
 * threaded conversation with a proper empty state.
 *
 * Where a surface genuinely has fewer capabilities it passes fewer
 * capabilities (`canReply`, `canModerate`) rather than rendering different
 * furniture. A public visitor cannot reply, edit or moderate — so those
 * controls are absent and everything else matches.
 *
 * Pair with `CommentComposer` for the input. They are separate because the
 * composer is pinned below the scroll region on some hosts and flows inline
 * on others; `COMMENT_FOOTER_CLASS` keeps that chrome identical.
 */
export interface CommentsPanelProps {
  comments: Comment[];
  loading?: boolean;
  /** Signed-in principal, or null on anonymous surfaces. */
  user: User | null;
  /**
   * Whether this caller may post at all. Only used to word the empty state
   * ("start the discussion" vs "nobody has commented"); the composer is the
   * caller's to render.
   */
  canComment?: boolean;
  /**
   * May reply to a comment. Distinct from `canComment`: the public share API
   * exposes flat comment creation with no `parent_id`, so a visitor may join
   * the discussion without being able to branch it.
   */
  canReply?: boolean;
  /** Backend's `can_moderate` — delete comments written by others. */
  canModerate?: boolean;
  trackId?: string;

  /* Thread interaction — omit on read-only surfaces. */
  replyingToId?: string | null;
  replyText?: string;
  onReplyTextChange?: (text: string) => void;
  onStartReply?: (commentId: string) => void;
  onCancelReply?: () => void;
  onSubmitReply?: () => void;
  submittingReply?: boolean;
  editingId?: string | null;
  editText?: string;
  setEditingId?: (id: string | null) => void;
  setEditText?: (text: string) => void;
  onSaveEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

/**
 * Chrome for the pinned composer row beneath a thread. Exported so the
 * public link and the authenticated dialog cannot drift apart on padding
 * and rule weight the way their composers did.
 */
export const COMMENT_FOOTER_CLASS =
  'shrink-0 px-5 sm:px-6 py-3 border-t border-[var(--panel-border)] bg-[var(--bg)]/40';

const noop = () => {};

export function CommentsPanel({
  comments,
  loading = false,
  user,
  canComment = true,
  canReply,
  canModerate = false,
  trackId,
  replyingToId = null,
  replyText = '',
  onReplyTextChange = noop,
  onStartReply = noop,
  onCancelReply = noop,
  onSubmitReply = noop,
  submittingReply = false,
  editingId = null,
  editText = '',
  setEditingId = noop,
  setEditText = noop,
  onSaveEdit = noop,
  onDelete = noop,
}: CommentsPanelProps) {
  // Replies default to following comment rights — the common case for a
  // signed-in caller. Anonymous surfaces pass `canReply={false}` explicitly.
  const repliesAllowed = canReply ?? canComment;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <Surface
            key={i}
            tone="panel-2"
            border="none"
            radius="input"
            className="h-12 animate-pulse"
          >
            {null}
          </Surface>
        ))}
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <EmptyState
        size="dense"
        icon={<MessageSquare size={20} strokeWidth={LINE_ICON_STROKE} aria-hidden />}
        title="No comments yet"
        description={
          canComment
            ? 'Start the discussion about this entry.'
            : 'Nobody has commented on this entry.'
        }
      />
    );
  }

  return (
    <CommentThread
      comments={comments}
      user={user}
      canComment={repliesAllowed}
      canModerate={canModerate}
      replyingToId={replyingToId}
      replyText={replyText}
      onReplyTextChange={onReplyTextChange}
      onStartReply={onStartReply}
      onCancelReply={onCancelReply}
      onSubmitReply={onSubmitReply}
      submittingReply={submittingReply}
      editingId={editingId}
      editText={editText}
      setEditingId={setEditingId}
      setEditText={setEditText}
      onSaveEdit={onSaveEdit}
      onDelete={onDelete}
      trackId={trackId}
    />
  );
}
