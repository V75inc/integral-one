/**
 * Entry-page Undo for agent-created entries. Token comes from session stash
 * (set on staging consume) and/or ``?undo=<token>`` on Created links.
 */
import { Undo2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  getStagingRollbackStatus,
  rollbackStagingToken,
} from '../../api/agentive';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { invalidateFeedCaches } from '../../queryKeys';
import {
  clearEntryUndoToken,
  peekEntryUndoToken,
  stashEntryUndoToken,
} from '../../features/ai-chat/staging/entryUndoStash';
import { Text } from '../../ui';
import { LINE_ICON_STROKE } from '../ui';

export function EntryAgentUndoButton({
  entryId,
  trackId,
}: {
  entryId: string;
  trackId?: string | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const undoFromQuery = searchParams.get('undo')?.trim() || '';
  const [token, setToken] = useState<string | null>(() => {
    return undoFromQuery || peekEntryUndoToken(entryId);
  });
  const [available, setAvailable] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const next = undoFromQuery || peekEntryUndoToken(entryId);
    setToken(next);
    if (undoFromQuery && entryId) {
      stashEntryUndoToken(entryId, undoFromQuery);
    }
  }, [entryId, undoFromQuery]);

  useEffect(() => {
    if (!token || done) {
      setAvailable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const status = await getStagingRollbackStatus(token);
      if (cancelled) return;
      const ok = Boolean(status.ok && status.available);
      setAvailable(ok);
      setReason(ok ? null : status.message ?? status.reason ?? 'Undo unavailable');
      if (!ok) {
        // Stale token — drop stash so we don't keep teasing Undo.
        clearEntryUndoToken(entryId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, done, entryId]);

  if (!token || done) return null;

  const handleUndo = async () => {
    if (!available || loading) return;
    const ok = await confirm({
      title: 'Undo agent change?',
      message: 'This will reverse the assistant’s create/update for this entry.',
      confirmLabel: 'Undo changes',
      variant: 'danger',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await rollbackStagingToken(token);
      if (!res.ok) {
        showToast(res.message ?? 'Rollback failed.', 'error');
        return;
      }
      clearEntryUndoToken(entryId);
      setDone(true);
      setAvailable(false);
      if (undoFromQuery) {
        setSearchParams(
          prev => {
            const next = new URLSearchParams(prev);
            next.delete('undo');
            return next;
          },
          { replace: true },
        );
      }
      if (trackId) {
        void queryClient.invalidateQueries({ queryKey: ['track', trackId, 'entries'] });
      }
      void queryClient.invalidateQueries({ queryKey: ['entry', entryId] });
      void invalidateFeedCaches(queryClient);
      showToast('Assistant changes undone.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rollback failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleUndo()}
      disabled={!available || loading}
      title={available ? 'Undo agent changes' : reason ?? 'Undo unavailable'}
      aria-label={available ? 'Undo agent changes' : reason ?? 'Undo unavailable'}
      className="
        group
        inline-flex items-center justify-center
        w-10 h-10 sm:w-8 sm:h-8 rounded-md
        hover:bg-[var(--danger-bg)]
        transition-colors duration-fast
        disabled:cursor-not-allowed disabled:opacity-40
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
      "
    >
      <Text
        as="span"
        variant="meta"
        tone="subtle"
        className="inline-flex group-hover:text-[var(--danger-fg)]"
      >
        <Undo2Icon size={14} strokeWidth={LINE_ICON_STROKE} />
      </Text>
    </button>
  );
}
