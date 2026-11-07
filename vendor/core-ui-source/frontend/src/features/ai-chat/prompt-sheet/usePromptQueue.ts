import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThreadRuntime } from '@assistant-ui/react';
import { useQueryClient } from '@tanstack/react-query';

import {
  blessStagingToken,
  cancelPromptQueueAll,
  getPromptQueue,
  getStagingTokenState,
  markPromptWrite,
  resolvePromptQuestion,
  revokeStagingToken,
} from '../../../api/agentive';
import { useConfirm } from '../../../context/ConfirmContext';
import { invalidateAfterAgentWrite } from '../../../services/graphMutationInvalidation';
import { useChatActivity } from '../AIChatSurface';
import type { PromptItem, PromptQueue } from './types';

export async function resumeIfNeeded(
  threadRuntime: ReturnType<typeof useThreadRuntime> | null,
  resumeText: string | null | undefined,
  appendAssistantNote: (text: string) => void | Promise<string | null>,
  stillCurrent: () => boolean = () => true,
  resumeRequired = true,
) {
  if (!resumeText || !threadRuntime) return;
  try {
    // Keep the resolved review visible as an assistant note. The runtime
    // continuation starts separately and never appends a user utterance.
    // The note write bumps the stored thread revision. Starting admission in
    // parallel races that write and can report a false thread-busy conflict.
    // Use the persisted note id, never its optimistic client-only id.
    const noteId = await appendAssistantNote(resumeText);
    if (noteId === null || !stillCurrent()) return;
    if (!resumeRequired) return;
    const messages = threadRuntime.getState().messages;
    const parentId = noteId ?? messages[messages.length - 1]?.id ?? null;
    threadRuntime.startRun({
      parentId,
      sourceId: null,
      runConfig: { custom: { hostAction: 'prompt_sheet_resume' } },
    });
  } catch {
    /* non-fatal */
  }
}

export function usePromptQueue() {
  const { activeThreadId, appendAssistantNote, isThreadStreaming } =
    useChatActivity();
  const threadRuntime = useThreadRuntime();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<PromptQueue | null>(null);
  const [open, setOpen] = useState(false);
  const [queueScope, setQueueScope] = useState(activeThreadId);
  // Read inside the poll interval without making it a dependency (which would
  // tear down and rebuild the listeners on every open/close).
  const openRef = useRef(false);
  useLayoutEffect(() => { openRef.current = open; }, [open]);
  const [index, setIndex] = useState(0);
  const resumedRefreshes = useRef(new Set<string>());
  const reviewNotes = useRef(new Map<string, Promise<string | null>>());
  const reviewEpisode = useRef<{ threadId: string; queue: PromptQueue } | null>(null);
  // Resume we saw while a stream was active — retry once it settles.
  // getPromptQueue only returns resume_text on the reconcile that closes the
  // sheet, so a mid-stream miss cannot be recovered from a later poll alone.
  const pendingResumeRef = useRef<{
    threadId: string;
    resumeText: string;
    resultQueue?: PromptQueue;
    resumeRequired: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [refreshError, setRefreshError] = useState<string | null>(null);
  const live = useRef({ activeThreadId, appendAssistantNote, isThreadStreaming, threadRuntime, queueScope });
  useLayoutEffect(() => {
    live.current = { activeThreadId, appendAssistantNote, isThreadStreaming, threadRuntime, queueScope };
  }, [activeThreadId, appendAssistantNote, isThreadStreaming, threadRuntime, queueScope]);
  const generation = useRef(0);
  const fetching = useRef<string | null>(null);
  const retryAt = useRef(0);
  const failures = useRef(0);

  const resumeOnce = useCallback((threadId: string, text: string | null | undefined, resultQueue?: PromptQueue, resumeRequired = true) => {
    if (!text || live.current.activeThreadId !== threadId) return;
    if (live.current.isThreadStreaming(threadId)) {
      // A clear chat approval is applied before its ordinary native turn
      // continues. The continuation belongs to that run; do not launch a
      // second Prompt Sheet resume while its stream is active — and do not
      // mark the key consumed until we actually resume, or a mid-stream
      // poll permanently drops the continuation.
      // A passive observation must not replace an explicit continuation.
      if (pendingResumeRef.current?.threadId === threadId && pendingResumeRef.current.resumeRequired && !resumeRequired) return;
      pendingResumeRef.current = { threadId, resumeText: text, resultQueue, resumeRequired };
      return;
    }
    pendingResumeRef.current = null;
    const episode = resultQueue?.items.length ? resultQueue
      : reviewEpisode.current?.threadId === threadId ? reviewEpisode.current.queue : undefined;
    // Deduplicate one resolved review, not identical wording across new reviews.
    // Readback links can improve between the completion event and the action
    // response. Their wording must not create a second receipt for one review.
    const key = JSON.stringify([threadId, episode?.opened_at, episode?.items.map((item) => item.id), episode?.items.length ? undefined : text]);
    if (resumeRequired && resumedRefreshes.current.has(key)) return;
    if (resumeRequired) resumedRefreshes.current.add(key);
    if (resumedRefreshes.current.size > 64) resumedRefreshes.current.delete(resumedRefreshes.current.values().next().value!);
    // Share the persisted receipt across action/poll races. A passive receipt
    // does not consume the explicit action's authority to continue afterward.
    let note = reviewNotes.current.get(key);
    if (!note) {
      const appendNote = live.current.appendAssistantNote;
      note = Promise.resolve().then(() => appendNote(text));
      reviewNotes.current.set(key, note);
      if (reviewNotes.current.size > 64) reviewNotes.current.delete(reviewNotes.current.keys().next().value!);
    }
    void resumeIfNeeded(live.current.threadRuntime, text, () => note!,
      () => live.current.activeThreadId === threadId && !live.current.isThreadStreaming(threadId), resumeRequired);
  }, []);

  const refreshRequested = useRef<string | null>(null);
  const refreshCallback = useRef<(() => Promise<void>) | null>(null);
  const refresh = useCallback(async (): Promise<void> => {
    const threadId = activeThreadId;
    if (!threadId || Date.now() < retryAt.current) return;
    if (fetching.current === threadId) {
      refreshRequested.current = threadId;
      return;
    }
    fetching.current = threadId;
    const requestGeneration = generation.current;
    try {
      const res = await getPromptQueue(threadId);
      if (live.current.activeThreadId !== threadId || generation.current !== requestGeneration) return;
      if (live.current.queueScope !== threadId) { setError(null); setIndex(0); }
      setQueueScope(threadId);
      failures.current = 0;
      retryAt.current = 0;
      setRefreshError(null);
      if (!res.open) {
        // Refreshing or reopening observes status; it never authorizes a model run.
        resumeOnce(threadId, res.resume_text, res.queue as unknown as PromptQueue, false);
        setQueue(null);
        setOpen(false);
        return;
      }
      const q = res.queue as unknown as PromptQueue;
      reviewEpisode.current = { threadId, queue: q };
      setQueue(q);
      setOpen(true);
      setIndex((i) => {
        const items = q.items || [];
        const currentItem = items[i];
        if (currentItem && currentItem.status === 'pending') return i;
        const pendingIdx = items.findIndex((it) => it.status === 'pending');
        return pendingIdx >= 0 ? pendingIdx : Math.min(i, Math.max(0, items.length - 1));
      });
    } catch (failure: unknown) {
      if (live.current.activeThreadId !== threadId || generation.current !== requestGeneration) return;
      if (live.current.queueScope !== threadId) {
        setQueue(null); setOpen(false); setError(null); setQueueScope(threadId);
      }
      failures.current += 1;
      const retryAfter = Number((failure as { response?: { headers?: Record<string, unknown> } })?.response?.headers?.['retry-after']);
      const backoffSeconds = Math.min(60, 5 * 2 ** Math.min(failures.current, 4));
      retryAt.current = Date.now() + Math.max(backoffSeconds, Number.isFinite(retryAfter) ? retryAfter : 0) * 1000;
      setRefreshError('Could not refresh approval status. Your current review is kept; retrying shortly.');
    } finally {
      if (fetching.current === threadId) fetching.current = null;
      if (refreshRequested.current === threadId) {
        refreshRequested.current = null;
        if (live.current.activeThreadId === threadId && generation.current === requestGeneration) {
          queueMicrotask(() => void refreshCallback.current?.());
        }
      }
    }
  }, [activeThreadId, resumeOnce]);
  useLayoutEffect(() => { refreshCallback.current = refresh; }, [refresh]);

  useEffect(() => {
    generation.current += 1;
    retryAt.current = 0;
    failures.current = 0;
    let stopped = false;
    queueMicrotask(() => { if (!stopped) void refresh(); });
    const onStaging = (event: Event) => {
      const threadId = (event as CustomEvent<{ threadId?: string }>).detail?.threadId;
      if (threadId && threadId !== live.current.activeThreadId) return;
      void refresh();
    };
    // Local, same-tab signal emitted by this hook's own actions below.
    window.addEventListener('staging-state-changed', onStaging);
    // Server-driven signals arrive from the agent WebSocket under the
    // `integral:` namespace (see hooks/useAgentiveWebSocket.ts). Listening only
    // for the un-namespaced name meant NO server event ever reached the sheet:
    // a queue opened by a streaming turn appeared only on the 2s poll below,
    // and `composerLocked` (= sheet.open) lagged with it, leaving a window
    // where the user could start a second turn against an open sheet.
    window.addEventListener('integral:staging-state-changed', onStaging);
    window.addEventListener('integral:staging-created', onStaging);
    window.addEventListener('integral:prompt-queue-refresh', onStaging);
    // Poll lightly while open so tool results from a streaming turn appear.
    // Back off when there is no sheet: the fast cadence only earns its keep
    // while the user is looking at one, but some polling has to continue so a
    // queue opened without a WS event is still noticed.
    let timer: ReturnType<typeof window.setTimeout>;
    const poll = async () => {
      await refresh();
      if (!stopped) timer = window.setTimeout(poll, document.hidden ? 30000 : openRef.current ? 5000 : 20000);
    };
    timer = window.setTimeout(poll, 5000);
    return () => {
      window.removeEventListener('staging-state-changed', onStaging);
      window.removeEventListener('integral:staging-state-changed', onStaging);
      window.removeEventListener('integral:staging-created', onStaging);
      window.removeEventListener('integral:prompt-queue-refresh', onStaging);
      stopped = true;
      generation.current += 1;
      window.clearTimeout(timer);
    };
  }, [refresh]);

  // Flush a resume that was deferred because a stream was already active.
  useEffect(() => {
    const pending = pendingResumeRef.current;
    if (!pending || !activeThreadId || pending.threadId !== activeThreadId) {
      return;
    }
    if (isThreadStreaming(pending.threadId)) return;
    resumeOnce(pending.threadId, pending.resumeText, pending.resultQueue, pending.resumeRequired);
  }, [activeThreadId, isThreadStreaming, resumeOnce]);

  const scopeCurrent = queueScope === activeThreadId;
  const items = scopeCurrent ? queue?.items ?? [] : [];
  const current: PromptItem | null = items[index] ?? null;

  const applyQueueResult = useCallback(
    (res: {
      queue?: PromptQueue;
      resume_text?: string | null;
      resume_required?: boolean;
      closed?: boolean;
    }) => {
      if (live.current.activeThreadId !== activeThreadId) return;
      setQueueScope(activeThreadId);
      if (res.closed) {
        setOpen(false);
        setQueue(null);
        resumeOnce(activeThreadId!, res.resume_text, res.queue, res.resume_required);
        return;
      }
      if (res.queue) {
        setQueue(res.queue);
        setOpen(res.queue.status === 'open');
        const pendingIdx = res.queue.items.findIndex((it) => it.status === 'pending');
        if (pendingIdx >= 0) setIndex(pendingIdx);
      }
    },
    [activeThreadId, resumeOnce],
  );

  const answerQuestion = useCallback(
    async (choices: string[], freeText?: string) => {
      if (!activeThreadId || !current || current.kind !== 'question' || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await resolvePromptQuestion({
          threadId: activeThreadId,
          itemId: current.id,
          choices,
          freeText,
        });
        applyQueueResult(res as never);
      } catch {
        setError('Could not record that answer.');
      } finally {
        setBusy(false);
      }
    },
    [activeThreadId, applyQueueResult, busy, current],
  );

  const skipQuestion = useCallback(async () => {
    if (!activeThreadId || !current || current.kind !== 'question' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await resolvePromptQuestion({
        threadId: activeThreadId,
        itemId: current.id,
        skip: true,
      });
      applyQueueResult(res as never);
    } catch {
      setError('Could not skip.');
    } finally {
      setBusy(false);
    }
  }, [activeThreadId, applyQueueResult, busy, current]);

  const approveWrite = useCallback(
    async () => {
      if (!activeThreadId || !current || current.kind !== 'staged_write' || busy)
        return;
      setBusy(true);
      setError(null);
      let applicationConfirmed = false;
      try {
        const staged = await getStagingTokenState(current.token);
        if (!staged) {
          throw new Error(
            'Could not verify the impact of this change. Refresh and try again.',
          );
        }
        const requiresStrongConfirmation =
          staged.requires_strong_confirmation;
        const strongConfirmation = requiresStrongConfirmation
          ? await confirm({
              title: 'Confirm high-impact change',
              message:
                'Review the affected records, access, or structure, then confirm this exact action: ' +
                (current.summary || 'Staged change'),
              confirmLabel: 'Confirm change',
              variant: 'danger',
            })
          : false;
        if (requiresStrongConfirmation && !strongConfirmation) return;
        const blessRes = await blessStagingToken(current.token, {
          strongConfirmation,
        });
        if (!blessRes.ok) {
          throw new Error(blessRes.message || 'Approval failed.');
        }
        const exec = blessRes.execute_result as
          | (Record<string, unknown> & {
              error?: unknown;
              filed?: boolean;
              skipped?: boolean;
              message?: unknown;
            })
          | undefined;
        const execFailed =
          !!exec &&
          (!!exec.error || exec.ok === false || exec.filed === false || exec.skipped === true);
        if (execFailed) {
          const msg =
            typeof exec?.message === 'string' && exec.message.trim()
              ? exec.message
              : 'The change was approved but the write was refused.';
          setError(msg);
          window.dispatchEvent(new Event('staging-state-changed'));
          return;
        }
        if (!exec) {
          setError(
            'Approval was recorded. Application is still pending; refresh to check its result.',
          );
          window.dispatchEvent(new Event('staging-state-changed'));
          return;
        }
        // mark-write only when the executor consumed the token — a merely
        // blessed card must stay in the sheet (state_mismatch → 422).
        const stagedState = (blessRes.staged_change as { state?: string } | undefined)
          ?.state;
        if (stagedState && stagedState !== 'consumed') {
          const lastErr = (
            blessRes.staged_change as {
              last_error?: { message?: string } | null;
            }
          )?.last_error;
          setError(
            lastErr?.message?.trim() ||
              'Approved, but the write has not completed yet.',
          );
          window.dispatchEvent(new Event('staging-state-changed'));
          return;
        }
        applicationConfirmed = stagedState === 'consumed' || blessRes.consumed === true;
        if (applicationConfirmed) {
          await invalidateAfterAgentWrite(queryClient, { staged, executeResult: exec });
        }
        const res = await markPromptWrite({
          threadId: activeThreadId,
          token: current.token,
          status: 'approved',
        });
        if (res.error) throw new Error(res.detail || 'The change has not finished applying.');
        applyQueueResult(res as never);
        window.dispatchEvent(new Event('staging-state-changed'));
      } catch (err: unknown) {
        const detail =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { message?: string; detail?: string } } })
                .response?.data
            : undefined;
        setError(
          applicationConfirmed
            ? 'The change was applied, but approval status could not refresh. Refresh status; do not approve it again.'
            : detail?.message ||
            detail?.detail ||
            (err instanceof Error ? err.message : '') ||
            'Could not verify approval or application. Refresh status before retrying.',
        );
        window.dispatchEvent(new Event('staging-state-changed'));
      } finally {
        setBusy(false);
      }
    },
    [activeThreadId, applyQueueResult, busy, confirm, current, queryClient],
  );

  const rejectWrite = useCallback(async () => {
    if (!activeThreadId || !current || current.kind !== 'staged_write' || busy)
      return;
    setBusy(true);
    setError(null);
    try {
      await revokeStagingToken(current.token);
      const res = await markPromptWrite({
        threadId: activeThreadId,
        token: current.token,
        status: 'rejected',
      });
      applyQueueResult(res as never);
      window.dispatchEvent(new Event('staging-state-changed'));
    } catch {
      setError('Could not reject that write.');
    } finally {
      setBusy(false);
    }
  }, [activeThreadId, applyQueueResult, busy, current]);

  const cancelAll = useCallback(async () => {
    if (!activeThreadId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await cancelPromptQueueAll(activeThreadId);
      applyQueueResult(res as never);
      window.dispatchEvent(new Event('staging-state-changed'));
    } catch {
      setError('Could not cancel.');
    } finally {
      setBusy(false);
    }
  }, [activeThreadId, applyQueueResult, busy]);

  const page = useMemo(
    () => ({
      index,
      total: items.length,
      canPrev: index > 0,
      canNext: index < items.length - 1,
      prev: () => setIndex((i) => Math.max(0, i - 1)),
      next: () => setIndex((i) => Math.min(items.length - 1, i + 1)),
    }),
    [index, items.length],
  );

  return {
    open: scopeCurrent && open,
    queue: scopeCurrent ? queue : null,
    current,
    items,
    page,
    busy,
    error: scopeCurrent ? error ?? refreshError : null,
    refresh,
    answerQuestion,
    skipQuestion,
    approveWrite,
    rejectWrite,
    cancelAll,
  };
}
