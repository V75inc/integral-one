import { X, Send, Trash2, Edit2, Check } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { LINE_ICON_STROKE } from '../ui';
import { MentionableTextarea } from '../mentions/MentionableTextarea';
import { CommentThreadRowView } from './CommentThreadRowView';
import { isSamePrincipal, buildCommentForest } from '../../utils';
import type { CommentThreadNode } from '../../utils/commentTree';
import type { Comment, User } from '../../types';
import { Text } from '../../ui';

interface CommentThreadProps {
  comments: Comment[];
  user: User | null;
  /** When false, hide reply affordances (viewers). Author edit/delete remains. */
  canComment?: boolean;
  /** Backend's answer to "may this caller delete comments they did not
   *  write" (``can_moderate`` on the comments read). Admin/owner on the
   *  track. Drives the delete affordance ONLY — edit stays author-only. */
  canModerate?: boolean;
  replyingToId: string | null;
  replyText: string;
  onReplyTextChange: (text: string) => void;
  onStartReply: (commentId: string) => void;
  onCancelReply: () => void;
  onSubmitReply: () => void;
  submittingReply: boolean;
  editingId: string | null;
  editText: string;
  setEditingId: (id: string | null) => void;
  setEditText: (text: string) => void;
  onSaveEdit: (id: string) => void;
  onDelete: (id: string) => void;
  /** Scopes the @-picker on the reply composer to users with track
   *  visibility. Matches the backend resolver gate keyed on the
   *  parent entry's ``track_id``. */
  trackId?: string;
}

function CommentBranch({
  node,
  depth,
  user,
  replyingToId,
  replyText,
  onReplyTextChange,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  submittingReply,
  editingId,
  editText,
  setEditingId,
  setEditText,
  onSaveEdit,
  onDelete,
  trackId,
  canComment = true,
  canModerate = false,
}: {
  node: CommentThreadNode;
  depth: number;
} & Omit<CommentThreadProps, 'comments'>) {
  const c = node.comment;
  // A comment posted through a public share link carries the sentinel
  // author id and no author export, so the generic fallback labelled it
  // "Member" — presenting an anonymous visitor as somebody with workspace
  // membership, on the signed-in surface as well as the public one. The
  // label is deliberately not "Guest": that word already means a specific
  // workspace membership role in the access model.
  const isPublicAuthor = c.author_id === 'public';
  const displayName = isPublicAuthor
    ? 'Public visitor'
    : c.author?.display_name ||
      (isSamePrincipal(user, c.author_id) ? user?.display_name : undefined) ||
      'Member';
  const isAuthor = isSamePrincipal(user, c.author_id);
  // Edit stays author-only — rewriting another person's words is not
  // moderation, and `update_comment` refuses it regardless of role.
  const authorControls = isAuthor && editingId !== c.id;
  // Delete additionally opens to track admins/owners. Without this the
  // backend's moderation path is unreachable from the UI for exactly the
  // comments that need it: a public visitor's, which have no author to be.
  const deleteControl = (isAuthor || canModerate) && editingId !== c.id;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center group">
        {editingId === c.id ? (
          <div className="flex gap-2 items-center min-w-0 flex-1">
            <Avatar
              name={displayName}
              size="sm"
              url={c.author?.avatar_url}
              attachmentId={c.author?.avatar_attachment_id}
              userId={c.author?.id}
              version={c.author?.updated_at}
              ringVariant="none"
            />
            <div className="min-w-0 flex-1 flex items-center gap-2 rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel)] pl-3 pr-1.5 py-1 transition-colors duration-fast hover:border-[var(--text-subtle)] focus-within:border-[var(--text-muted)]">
              <input
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); onSaveEdit(c.id); }
                  if (e.key === 'Escape') { setEditingId(null); }
                }}
                className="flex-1 min-w-0 py-1.5 text-sm bg-transparent text-[var(--text)] focus:outline-none placeholder:text-[var(--text-subtle)]"
              />
              <button
                type="button"
                onClick={() => onSaveEdit(c.id)}
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 md:w-7 md:h-7 rounded-md text-[var(--success-fg)] hover:bg-[var(--panel-2)] transition-colors duration-fast"
                aria-label="Save"
              >
                <Check size={14} strokeWidth={LINE_ICON_STROKE} />
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 md:w-7 md:h-7 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors duration-fast"
                aria-label="Cancel edit"
              >
                <X size={14} strokeWidth={LINE_ICON_STROKE} />
              </button>
            </div>
          </div>
        ) : (
          <CommentThreadRowView
            displayName={displayName}
            createdAt={c.created_at}
            avatarUrl={c.author?.avatar_url}
            avatarUserId={c.author?.id}
            avatarAttachmentId={c.author?.avatar_attachment_id}
            avatarVersion={c.author?.updated_at}
            text={c.text}
            depth={depth}
            footer={
              canComment ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    replyingToId === c.id ? onCancelReply() : onStartReply(c.id)
                  }
                  className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  {replyingToId === c.id ? 'Cancel' : 'Reply'}
                </button>
                {replyingToId === c.id && (
                  <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-input)] bg-[var(--panel)] border border-[var(--panel-border)] pl-3 pr-1.5 py-1 transition-colors duration-fast hover:border-[var(--text-subtle)] focus-within:border-[var(--text-muted)]">
                    <div className="flex-1 min-w-0">
                      <MentionableTextarea
                        value={replyText}
                        onChange={onReplyTextChange}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSubmitReply();
                          }
                        }}
                        placeholder="Write a reply… (use @ to mention)"
                        rows={1}
                        className="w-full min-w-0 py-1.5 text-sm text-[var(--text)] bg-transparent resize-none focus:outline-none placeholder:text-[var(--text-subtle)]"
                        trackId={trackId}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={onSubmitReply}
                      disabled={submittingReply || !replyText.trim()}
                      aria-label="Send reply"
                      className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text-subtle)] transition-colors duration-fast"
                    >
                      <Send size={14} strokeWidth={LINE_ICON_STROKE} />
                    </button>
                  </div>
                )}
              </>
              ) : null
            }
          />
        )}
        {(authorControls || deleteControl) && (
          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity shrink-0">
            {authorControls && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(c.id);
                  setEditText(c.text);
                }}
                className="p-1.5 rounded-md hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-[var(--text-muted)]"
                aria-label="Edit comment"
              >
                <Edit2 size={12} strokeWidth={LINE_ICON_STROKE} />
              </button>
            )}
            {deleteControl && (
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                className="p-1.5 rounded-md text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]"
                aria-label={
                  isAuthor
                    ? 'Delete comment'
                    : isPublicAuthor
                      ? "Remove this public visitor's comment"
                      : "Remove this member's comment"
                }
              >
                <Trash2 size={12} strokeWidth={LINE_ICON_STROKE} />
              </button>
            )}
          </div>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="space-y-2">
          {node.children.map(ch => (
            <CommentBranch
              key={ch.comment.id}
              node={ch}
              depth={depth + 1}
              user={user}
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
              canComment={canComment}
              canModerate={canModerate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentThread(props: CommentThreadProps) {
  const { comments, ...branchProps } = props;
  const forest = buildCommentForest(comments);
  if (forest.length === 0) {
    return (
      <Text variant="body" tone="muted" as="p">No comments yet.</Text>
    );
  }
  return (
    <div className="space-y-3">
      {forest.map(node => (
        <CommentBranch
          key={node.comment.id}
          node={node}
          depth={0}
          {...branchProps}
        />
      ))}
    </div>
  );
}
