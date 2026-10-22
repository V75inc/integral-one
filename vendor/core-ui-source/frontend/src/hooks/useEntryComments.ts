import { mergeComments } from '../utils/commentTree';
import { COMMENT_REFETCH_EVENT } from '../services/graphMutationInvalidation';
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
  const scope = `${entryId}:${publicToken || ""}`;
  const currentScope = useRef({ key: scope });
  if (currentScope.current.key !== scope) currentScope.current = { key: scope };
  const revision = useRef(0);
  const hasLoaded = useRef(false);
  const posting = useRef(false);
  const replying = useRef(false);
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

  useEffect(() => { if (enabled && !loadingComments && hasLoaded.current) onCountRef.current?.(comments.length); }, [comments, loadingComments, enabled]);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    hasLoaded.current = false;
    setComments([]);
    setCommentText('');
    setReplyText('');
    setReplyingToId(null);
    setEditingCommentId(null);
    setEditCommentText('');
    posting.current = false;
    replying.current = false;
    setSubmittingComment(false);
    setSubmittingReply(false);
    setCanModerate(false);
    if (!enabled) { setLoadingComments(false); return; }
    const load = () => {
      const id = ++requestId;
      const started = revision.current;
      setLoadingComments(true);
      const promise = publicToken
        ? publicSharingApi.getPublicComments(publicToken, entryId)
            .then(res => ({ comments: res.comments || [], canModerate: false }))
        : entriesApi.getCommentsWithMeta(entryId);
      promise.then(result => {
        if (cancelled || id !== requestId) return;
        if (started !== revision.current) { load(); return; }
        hasLoaded.current = true;
        setComments(mergeComments(result.comments));
        setCanModerate(result.canModerate);
      }).catch(() => { if (!cancelled && id === requestId) setCanModerate(false); })
        .finally(() => { if (!cancelled && id === requestId) setLoadingComments(false); });
    };
    const refetch = (event: Event) => {
      if ((event as CustomEvent<{ entryId?: string }>).detail?.entryId === entryId) load();
    };
    load();
    window.addEventListener(COMMENT_REFETCH_EVENT, refetch);
    return () => { cancelled = true; window.removeEventListener(COMMENT_REFETCH_EVENT, refetch); };
  }, [entryId, enabled, publicToken]);

  const submitComment = useCallback(async () => {
    if (!commentText.trim() || posting.current) return;
    posting.current = true;
    revision.current++;
    const requestScope = currentScope.current;
    setSubmittingComment(true);
    try {
      const c = publicToken
        ? (await publicSharingApi.createPublicComment(publicToken, entryId, commentText.trim())).comment
        : await entriesApi.addComment(entryId, commentText.trim());
      if (requestScope !== currentScope.current) return;
      revision.current++;
      setComments(p => mergeComments(p, [c]));
      setCommentText('');
    } catch {
      showToast('Failed to post comment', 'error');
    } finally {
      if (requestScope === currentScope.current) {
        posting.current = false;
        setSubmittingComment(false);
      }
    }
  }, [commentText, entryId, showToast, publicToken, scope]);

  const submitReply = useCallback(async () => {
    if (!replyingToId || !replyText.trim() || replying.current) return;
    replying.current = true;
    revision.current++;
    const requestScope = currentScope.current;
    setSubmittingReply(true);
    try {
      const c = await entriesApi.addComment(
        entryId,
        replyText.trim(),
        replyingToId
      );
      if (requestScope !== currentScope.current) return;
      revision.current++;
      setComments(p => mergeComments(p, [c]));
      setReplyingToId(null);
      setReplyText('');
    } catch {
      showToast('Failed to post reply', 'error');
    } finally {
      if (requestScope === currentScope.current) {
        replying.current = false;
        setSubmittingReply(false);
      }
    }
  }, [entryId, replyingToId, replyText, showToast, scope]);

  const deleteComment = useCallback(
    async (id: string) => {
      const requestScope = currentScope.current;
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
      if (!ok || requestScope !== currentScope.current) return;
      try {
        await commentsApi.delete(id);
        if (requestScope !== currentScope.current) return;
        revision.current++;
        setComments(p => p.filter(c => c.id !== id));
      } catch {
        showToast('Failed to delete comment', 'error');
      }
    },
    [comments, confirm, showToast]
  );

  const saveEditComment = useCallback(
    async (id: string) => {
      const requestScope = currentScope.current;
      try {
        const updated = await commentsApi.update(id, editCommentText);
        if (requestScope !== currentScope.current) return;
        revision.current++;
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
