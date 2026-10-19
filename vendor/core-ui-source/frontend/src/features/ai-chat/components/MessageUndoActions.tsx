/**
 * Per-message undo / rollback actions for agent-staged writes.
 *
 * - Pre-consume: revoke a blessed-but-not-yet-consumed token.
 * - Post-consume: rollback committed graph writes via the staging rollback API.
 *
 * Only mounts when the message carries an undo-eligible staged change
 * (stable string key from useAuiState — avoids the unstable-array loop
 * documented in Thread.tsx InlineStagedCards).
 */

import { Undo2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuiState } from '@assistant-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getStagingTokenState,
  revokeStagingToken,
  rollbackStagingToken,
} from '../../../api/agentive';
import { getRollbackStatusShared } from '../staging/rollbackStatusCache';
import { useConfirm } from '../../../context/ConfirmContext';
import { extractStagedChangesFromParts } from '../staging/extractStagedChanges';
import { type StagedChange, type StagedChangeState } from '../staging/types';
import { invalidateAfterAgentWrite } from '../../../services/graphMutationInvalidation';
import { useChatActivity } from '../AIChatSurface';

type UndoTarget =
  | { mode: 'revoke'; staged: StagedChange }
  | { mode: 'rollback'; staged: StagedChange; available: boolean; reason?: string };

function pickUndoTarget(staged: StagedChange[]): UndoTarget | null {
  if (staged.length === 0) return null;

  const blessed = staged.find((s) => s.state === 'blessed' && !s.rolled_back_at);
  if (blessed) {
    return { mode: 'revoke', staged: blessed };
  }

  const consumed = staged.find(
    (s) => s.state === 'consumed' && !s.rolled_back_at,
  );
  if (consumed) {
    return { mode: 'rollback', staged: consumed, available: false };
  }
  return null;
}

function applyStagingOverlay(
  staged: StagedChange[],
  overlay: Readonly<Record<string, StagedChangeState>>,
): StagedChange[] {
  if (Object.keys(overlay).length === 0) return staged;
  return staged.map((s) =>
    overlay[s.token] ? { ...s, state: overlay[s.token] } : s,
  );
}

function computeEligibilityKey(
  content: unknown,
  parts: unknown,
  overlay: Readonly<Record<string, StagedChangeState>>,
): string | null {
  const staged = applyStagingOverlay(
    extractStagedChangesFromParts(
      content as Parameters<typeof extractStagedChangesFromParts>[0],
      parts as Parameters<typeof extractStagedChangesFromParts>[1],
    ),
    overlay,
  );
  const target = pickUndoTarget(staged);
  if (!target) return null;
  return target.mode === 'revoke'
    ? `revoke:${target.staged.token}`
    : `rollback:${target.staged.token}`;
}

/** Gate: only mount the interactive undo control when this message needs it. */
export function MessageUndoActions() {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const content = useAuiState((s) => s.message.content);
  const parts = useAuiState((s) => s.message.parts);
  const [stagingOverlay, setStagingOverlay] = useState<
    Record<string, StagedChangeState>
  >({});

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string; state?: StagedChangeState }>)
        .detail;
      if (!detail?.token || !detail.state) return;
      setStagingOverlay((prev) => {
        if (prev[detail.token!] === detail.state) return prev;
        return { ...prev, [detail.token!]: detail.state! };
      });
    };
    window.addEventListener('integral:staging-state-changed', handler);
    return () => {
      window.removeEventListener('integral:staging-state-changed', handler);
    };
  }, []);

  // Reconcile mint-time ``pending`` snapshots against live token state so Undo
  // survives remount / warm cache after consume (companion handoff path).
  useEffect(() => {
    const staged = extractStagedChangesFromParts(
      content as Parameters<typeof extractStagedChangesFromParts>[0],
      parts as Parameters<typeof extractStagedChangesFromParts>[1],
    );
    if (staged.length === 0) return;
    let cancelled = false;
    (async () => {
      const patches: Record<string, StagedChangeState> = {};
      await Promise.all(
        staged.map(async (s) => {
          if (s.state === 'consumed' || s.state === 'revoked' || s.state === 'expired') {
            return;
          }
          const live = await getStagingTokenState(s.token);
          if (!live?.state) {
            // Token gone after consume TTL — treat as consumed for rollback probe.
            patches[s.token] = 'consumed';
            return;
          }
          if (live.state !== s.state) {
            patches[s.token] = live.state as StagedChangeState;
          }
        }),
      );
      if (cancelled || Object.keys(patches).length === 0) return;
      setStagingOverlay((prev) => ({ ...prev, ...patches }));
    })();
    return () => {
      cancelled = true;
    };
  }, [content, parts]);

  const staged = applyStagingOverlay(
    extractStagedChangesFromParts(
      content as Parameters<typeof extractStagedChangesFromParts>[0],
      parts as Parameters<typeof extractStagedChangesFromParts>[1],
    ),
    stagingOverlay,
  );
  const rolledBack = staged.find((change) => Boolean(change.rolled_back_at));
  const eligibilityKey = computeEligibilityKey(content, parts, stagingOverlay);

  if (isRunning) return null;
  if (rolledBack) {
    return <RollbackNotice summary={rolledBack.summary} />;
  }
  if (!eligibilityKey) return null;
  return (
    <MessageUndoActionsInner
      eligibilityKey={eligibilityKey}
      stagingOverlay={stagingOverlay}
    />
  );
}

function RollbackNotice({ summary }: { summary: string }) {
  return (
    <span
      role="status"
      className="text-xs text-[var(--text-subtle)]"
    >
      Undone: {summary}.
    </span>
  );
}

function resolveTargetFromKey(
  key: string,
  content: unknown,
  parts: unknown,
  overlay: Readonly<Record<string, StagedChangeState>>,
): UndoTarget | null {
  const staged = applyStagingOverlay(
    extractStagedChangesFromParts(
      content as Parameters<typeof extractStagedChangesFromParts>[0],
      parts as Parameters<typeof extractStagedChangesFromParts>[1],
    ),
    overlay,
  );
  const target = pickUndoTarget(staged);
  if (!target) return null;
  const expected =
    target.mode === 'revoke'
      ? `revoke:${target.staged.token}`
      : `rollback:${target.staged.token}`;
  return expected === key ? target : null;
}

function MessageUndoActionsInner({
  eligibilityKey,
  stagingOverlay,
}: {
  eligibilityKey: string;
  stagingOverlay: Readonly<Record<string, StagedChangeState>>;
}) {
  const confirm = useConfirm();
  const { appendAssistantNote } = useChatActivity();
  const queryClient = useQueryClient();
  const content = useAuiState((s) => s.message.content);
  const parts = useAuiState((s) => s.message.parts);

  const initialTarget = resolveTargetFromKey(
    eligibilityKey,
    content,
    parts,
    stagingOverlay,
  );
  const [target, setTarget] = useState<UndoTarget | null>(initialTarget);
  const [loading, setLoading] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [completedSummary, setCompletedSummary] = useState<string | null>(null);

  useEffect(() => {
    const next = resolveTargetFromKey(
      eligibilityKey,
      content,
      parts,
      stagingOverlay,
    );
    setTarget((prev) => {
      if (!next && !prev) return prev;
      if (!next || !prev) return next;
      if (prev.mode !== next.mode) return next;
      if (prev.staged.token !== next.staged.token) return next;
      if (prev.mode === 'rollback' && next.mode === 'rollback') {
        if (prev.available === next.available && prev.reason === next.reason) {
          return prev;
        }
      }
      return next;
    });
    setStatusHint(null);
    if (!next || next.mode !== 'rollback') return;

    let cancelled = false;
    (async () => {
      const status = await getRollbackStatusShared(next.staged.token);
      if (cancelled) return;
      setTarget((prev) => {
        if (!prev || prev.mode !== 'rollback' || prev.staged.token !== next.staged.token) {
          return prev;
        }
        const available = Boolean(status.ok && status.available);
        const reason = available
          ? undefined
          : status.message ?? status.reason ?? 'Undo unavailable';
        if (prev.available === available && prev.reason === reason) return prev;
        return { mode: 'rollback', staged: next.staged, available, reason };
      });
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on the derived eligibility signature, not raw content/parts: those
    // change on every token of a streaming message, and re-running this would
    // re-query staging eligibility per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibilityKey, stagingOverlay]);

  if (completedSummary) {
    return <RollbackNotice summary={completedSummary} />;
  }
  if (!target) return null;

  const handleRevoke = async () => {
    const ok = await confirm({
      title: 'Undo approval?',
      message: `Reject "${target.staged.summary}" before it is applied.`,
      confirmLabel: 'Undo',
      variant: 'danger',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await revokeStagingToken(target.staged.token);
      if (!res.ok) {
        setStatusHint(res.message ?? 'Undo failed.');
        return;
      }
      window.dispatchEvent(
        new CustomEvent('integral:staging-state-changed', {
          detail: { token: target.staged.token, state: 'revoked' },
        }),
      );
      appendAssistantNote(
        `Approval withdrawn: ${target.staged.summary} was not applied.`,
      );
    } catch (err) {
      setStatusHint(err instanceof Error ? err.message : 'Undo failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    if (target.mode !== 'rollback' || !target.available) return;
    const ok = await confirm({
      title: 'Undo agent change?',
      message: `This will reverse the changes from "${target.staged.summary}".`,
      confirmLabel: 'Undo changes',
      variant: 'danger',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await rollbackStagingToken(target.staged.token);
      if (!res.ok) {
        setStatusHint(res.message ?? 'Rollback failed.');
        return;
      }
      await invalidateAfterAgentWrite(queryClient, {
        staged: target.staged,
        executeResult: target.staged.execute_result,
      });
      setCompletedSummary(target.staged.summary);
      appendAssistantNote(
        `Undo complete: ${target.staged.summary} was reversed. The earlier completion and readback messages describe the state before this undo.`,
      );
    } catch (err) {
      setStatusHint(err instanceof Error ? err.message : 'Rollback failed.');
    } finally {
      setLoading(false);
    }
  };

  const onClick = target.mode === 'revoke' ? handleRevoke : handleRollback;
  const disabled =
    loading || (target.mode === 'rollback' && !target.available);
  const title =
    target.mode === 'revoke'
      ? 'Undo approval (not yet applied)'
      : target.available
        ? 'Undo agent changes'
        : target.reason ?? 'Undo unavailable';

  return (
    <>
      <button
        type="button"
        aria-label={title}
        title={title}
        disabled={disabled}
        onClick={onClick}
        className="
          flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)]
          hover:bg-[var(--panel-2)] hover:text-[var(--text)]
          disabled:cursor-not-allowed disabled:opacity-40
          transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
        "
      >
        <Undo2Icon size={14} />
      </button>
      {statusHint && (
        <span className="sr-only" role="status">
          {statusHint}
        </span>
      )}
    </>
  );
}
