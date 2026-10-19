import { CommentsPanel } from './comments/CommentsPanel';
import { CommentComposer } from './comments/CommentComposer';
import type { useEntryComments } from '../../hooks/useEntryComments';

type EntryCommentsModel = ReturnType<typeof useEntryComments>;

export interface EntryCommentsSectionProps {
  model: EntryCommentsModel;
  className?: string;
  canCreateComments?: boolean;
}

/**
 * Comments thread + composer for the wiki inline page view.
 *
 * Thin now: the thread and the composer are the shared widgets the entry
 * dialog and the public share link also render. This file used to carry its
 * own copy of the composer chrome — same intent, separately maintained, and
 * already drifting (it lacked the disabled hover reset the dialog had).
 */
export function EntryCommentsSection({
  model,
  className = '',
  canCreateComments = true,
}: EntryCommentsSectionProps) {
  const {
    user,
    comments,
    loadingComments,
    commentText,
    setCommentText,
    submittingComment,
    submitComment,
    replyingToId,
    replyText,
    setReplyText,
    setReplyingToId,
    submittingReply,
    submitReply,
    editingCommentId,
    editCommentText,
    setEditingCommentId,
    setEditCommentText,
    saveEditComment,
    deleteComment,
    canModerate,
    trackId,
  } = model;

  return (
    <section className={className} aria-label="Comments">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)] mb-3">
        Comments · {comments.length}
      </h3>
      <CommentsPanel
        comments={comments}
        loading={loadingComments}
        user={user}
        canComment={canCreateComments}
        canModerate={canModerate}
        replyingToId={replyingToId}
        replyText={replyText}
        onReplyTextChange={setReplyText}
        onStartReply={id => {
          setReplyingToId(id);
          setReplyText('');
        }}
        onCancelReply={() => {
          setReplyingToId(null);
          setReplyText('');
        }}
        onSubmitReply={() => void submitReply()}
        submittingReply={submittingReply}
        editingId={editingCommentId}
        editText={editCommentText}
        setEditingId={setEditingCommentId}
        setEditText={setEditCommentText}
        onSaveEdit={saveEditComment}
        onDelete={deleteComment}
        trackId={trackId}
      />
      {canCreateComments && (
        <CommentComposer
          className="mt-4"
          value={commentText}
          onChange={setCommentText}
          onSubmit={() => void submitComment()}
          submitting={submittingComment}
          trackId={trackId}
        />
      )}
    </section>
  );
}
