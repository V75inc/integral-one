import { useCallback, useEffect, useRef, useState } from 'react';
import { commentsApi, entriesApi } from '../api';
import { publicSharingApi } from '../api/sharing';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import type { Comment } from '../types';

export interface UseEntryCommentsOptions {
  entryId: string;
  trackId?: string;
  onCommentCountChange?: (count: number) => void;
  enabled?: boolean;
  publicToken?: string;
}

export function useEntryComments({
  entryId,
  trackId,
  onCommentCountChange,
  enabled = true,
  publicToken,
}: UseEntryCommentsOptions) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const onCountRef = useRef(onCommentCountChange);
  onCountRef.current = onCommentCountChange;

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  // Backend-computed: may this caller delete comments they did not write.
  // Never true on the public surface — an anonymous visitor administers
  // nothing, and the public read has no such flag to report.
  const [canModerate, setCanModerate] = useState(false);

  const bumpCommentCount = useCallback((next: Comment[]) => {
    onCountRef.current?.(next.length);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoadingComments(false);
      return;
    }
    let cancelled = false;
    setLoadingComments(true);

    const fetchPromise: Promise<{ comments: Comment[]; canModerate: boolean }> =
      publicToken
        ? publicSharingApi
            .getPublicComments(publicToken, entryId)
            .then(res => ({ comments: res.comments || [], canModerate: false }))
        : entriesApi.getCommentsWithMeta(entryId);

    fetchPromise
      .then(({ comments: nextComments, canModerate: nextCanModerate }) => {
        if (cancelled) return;
        setComments(nextComments);
        setCanModerate(nextCanModerate);
        bumpCommentCount(nextComments);
      })
      .catch(() => {
        if (cancelled) return;
        setComments([]);
        // Fail closed: a failed read must not leave a stale moderation
        // affordance on screen from a previous entry.
        setCanModerate(false);
      })
      .finally(() => {
        if (!cancelled) setLoadingComments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId, bumpCommentCount, enabled, publicToken]);

  const submitComment = useCallback(async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const c = publicToken
        ? (await publicSharingApi.createPublicComment(publicToken, entryId, commentText.trim())).comment
        : await entriesApi.addComment(entryId, commentText.trim());
      setComments(p => {
        const next = [...p, c];
        bumpCommentCount(next);
        return next;
      });
      setCommentText('');
    } catch {
      showToast('Failed to post comment', 'error');
    } finally {
      setSubmittingComment(false);
    }
  }, [commentText, entryId, bumpCommentCount, showToast, publicToken]);

  const submitReply = useCallback(async () => {
    if (!replyingToId || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      const c = await entriesApi.addComment(
        entryId,
        replyText.trim(),
        replyingToId
      );
      setComments(p => {
        const next = [...p, c];
        bumpCommentCount(next);
        return next;
      });
      setReplyingToId(null);
      setReplyText('');
    } catch {
      showToast('Failed to post reply', 'error');
    } finally {
      setSubmittingReply(false);
    }
  }, [entryId, replyingToId, replyText, bumpCommentCount, showToast]);

  const deleteComment = useCallback(
    async (id: string) => {
      const target = comments.find(c => c.id === id);
      const raw = target?.text?.trim() || '';
      const excerpt =
        raw.length > 160 ? `${raw.slice(0, 160)}…` : raw || '(empty comment)';
      const ok = await confirm({
        title: 'Delete comment',
        message: `Permanently delete this comment?\n\n“${excerpt}”`,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await commentsApi.delete(id);
        setComments(p => {
          const next = p.filter(c => c.id !== id);
          bumpCommentCount(next);
          return next;
        });
      } catch {
        showToast('Failed to delete comment', 'error');
      }
    },
    [comments, confirm, bumpCommentCount, showToast]
  );

  const saveEditComment = useCallback(
    async (id: string) => {
      try {
        const updated = await commentsApi.update(id, editCommentText);
        setComments(p =>
          p.map(c =>
            c.id === id ? { ...c, text: updated.text || editCommentText } : c
          )
        );
        setEditingCommentId(null);
      } catch {
        showToast('Failed to update comment', 'error');
      }
    },
    [editCommentText, showToast]
  );

  return {
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
  };
}
