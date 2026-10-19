/**
 * The staged-change state machine, shared by every surface that approves one.
 *
 * It used to live entirely inside `StagedChangeCard`'s render, so the
 * Approvals page — which shows the same pending changes — reimplemented
 * approval as a bare `blessStagingToken` call. That reimplementation was
 * missing **cache invalidation**, so a write that did land stayed invisible
 * until a manual refresh — a consequence of the logic living in one
 * component's body rather than somewhere both surfaces could reach. Hence
 * this hook.
 *
 * There is deliberately no client-side write fallback any more. When a bless
 * lands without `execute_result` the write has not happened yet and the
 * agent performs it on its next turn (`onNeedsAgentNudge`). The old fallback
 * ran the write over REST and then *revoked* the token, so the server's
 * truth was "rejected" for a change that had in fact been applied: the card
 * read "Rejected" after a reload, Undo had nothing to roll back, and the
 * write carried no staging provenance.
 *
 * Deliberately NOT moved here: the rollback confirmation dialog. That is a
 * presentation decision — a row in a list may want different phrasing, or
 * none — so the hook exposes `rollback.execute()` and lets the caller decide
 * whether to ask first.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  blessStagingToken,
  getStagingTokenState,
  revokeStagingToken,
  rollbackStagingToken,
} from '../../../api/agentive';
import { invalidateAfterAgentWrite } from '../../../services/graphMutationInvalidation';
import type { StagedChange, StagedChangeState } from './types';
import { extractConsumedNav, type ConsumedNav } from './consumedSummary';
import { stashUndoTokensFromConsumedNav } from './entryUndoStash';
// Invalidation rides on the `staging-state-changed` event this hook already
// dispatches, so there is nothing to call directly here.
import { getRollbackStatusShared } from './rollbackStatusCache';

export type StagedChangeStatus =
  | { kind: 'idle'; state: StagedChangeState }
  | { kind: 'loading'; state: StagedChangeState }
  | { kind: 'error'; state: StagedChangeState; message: string };

export type AgentNudgeHostAction =
  | 'staging_follow_through'
  | 'prompt_sheet_resume';

export interface UseStagedChangeOptions {
  /** Fired once the change reaches consumed / revoked / expired. */
  onTerminal?: (token: string) => void;
  /**
   * Called when the bless succeeded but the agent still owes a turn:
   * - no ``execute_result`` → host-apply blessed token(s)
   * - ``needs_agent_build`` → design affirmed; host continues the build
   *
   * Never called when execute failed/skipped — Prompt Sheet and the card
   * surface the error instead of an empty host turn.
   *
   * Only the chat card can nudge: it has a thread runtime. A list row passes
   * nothing and the nudge is skipped, which is correct — there is no
   * conversation to nudge.
   */
  onNeedsAgentNudge?: (hostAction: AgentNudgeHostAction) => void;
  /** Explicit UI confirmation for server-classified high-impact changes. */
  onNeedsStrongConfirmation?: (summary: string) => Promise<boolean>;
}

export interface UseStagedChangeResult {
  status: StagedChangeStatus;
  state: StagedChangeState;
  busy: boolean;
  error: string | null;
  consumedNav: ConsumedNav;
  isTerminal: boolean;
  isBlessed: boolean;
  bless: () => Promise<void>;
  revoke: () => Promise<void>;
  rollback: {
    available: boolean;
    reason: string | null;
    loading: boolean;
    done: boolean;
    execute: () => Promise<void>;
  };
}

function execFailureMessage(exec: {
  message?: unknown;
  detail?: unknown;
  skipped?: boolean;
}): string {
  if (typeof exec.message === 'string' && exec.message) return exec.message;
  if (exec.skipped === true) return 'The server skipped this write.';
  const detail = exec.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    if (parts.length) return parts.join(' ');
  }
  return 'Server write failed.';
}

export function useStagedChange(
  staged: StagedChange,
  {
    onTerminal,
    onNeedsAgentNudge,
    onNeedsStrongConfirmation,
  }: UseStagedChangeOptions = {},
): UseStagedChangeResult {
  const [status, setStatus] = useState<StagedChangeStatus>({
    kind: 'idle',
    state: staged.state,
  });
  const [consumedNav, setConsumedNav] = useState<ConsumedNav>(
    () => staged.consumed_nav ?? {},
  );
  const [rollbackAvailable, setRollbackAvailable] = useState(false);
  const [rollbackReason, setRollbackReason] = useState<string | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rolledBack, setRolledBack] = useState(Boolean(staged.rolled_back_at));

  const queryClient = useQueryClient();
  const latestConsumedNav = useRef(consumedNav);
  latestConsumedNav.current = consumedNav;

  // Reconcile against the backend on mount.
  //
  // `staged.state` is a snapshot from the persisted tool-call result, taken
  // at mint time and therefore always `pending`. Without this, remounting
  // after navigation shows "AWAITING APPROVAL" for a change approved long
  // ago.
  //
  // Tier 2 — the token is unknown to the backend (swept after its TTL, or
  // the in-memory store was lost to a restart) — is where the honesty
  // matters: at that point "approved" and "never approved" are
  // indistinguishable, so we must not claim either. Positive evidence in the
  // snapshot (consumed / blessed / revoked / expired) is preserved; anything
  // still `pending` falls to `expired`, which renders as a muted "Expired."
  // rather than a green confirmation. Defaulting to consumed would have made
  // an untouched card claim it applied a change after any refresh.
  useEffect(() => {
    // A snapshot that is already terminal cannot change, so asking is pure
    // cost — and transcripts are mostly settled cards. `blessed` is NOT
    // terminal: it still becomes `consumed` when the write lands, so it keeps
    // reconciling. Only `pending` genuinely needs the round trip.
    if (
      staged.state === 'consumed' ||
      staged.state === 'revoked' ||
      staged.state === 'expired'
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const fresh = await getStagingTokenState(staged.token);
      if (cancelled) return;
      if (!fresh) {
        setStatus((prev) => {
          if (prev.kind === 'loading') return prev;
          if (
            prev.state === 'consumed' ||
            prev.state === 'blessed' ||
            prev.state === 'revoked' ||
            prev.state === 'expired'
          ) {
            return prev;
          }
          return { kind: 'idle', state: 'expired' };
        });
        return;
      }
      const freshState = (fresh as { state?: StagedChangeState }).state;
      if (!freshState) return;
      // A recorded failure is why this instance can explain a refusal it did
      // not witness. Without it a card that learned the state from a reload
      // could only say "approved, not yet applied".
      const recorded = (fresh as { last_error?: { message?: string } | null })
        .last_error;
      setStatus((prev) => {
        if (prev.kind === 'loading') return prev;
        if (recorded?.message) {
          return { kind: 'error', state: freshState, message: recorded.message };
        }
        return { kind: 'idle', state: freshState };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [staged.token]);

  // Backend-pushed state changes (e.g. the agent consumed the token on its
  // own turn) so the surface flips without waiting for the next message.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          token?: string;
          state?: StagedChangeState;
          last_error?: { message?: string } | null;
        }>
      ).detail;
      if (!detail || detail.token !== staged.token || !detail.state) return;
      // Let optimistic local clicks own pending → blessed/revoked; only take
      // the push as authoritative for everything else.
      const pushed = detail.last_error;
      setStatus((prev) => {
        if (prev.kind === 'loading') return prev;
        const state = detail.state as StagedChangeState;
        if (pushed?.message) {
          return { kind: 'error', state, message: pushed.message };
        }
        return { kind: 'idle', state };
      });
    };
    window.addEventListener('integral:staging-state-changed', handler);
    return () => {
      window.removeEventListener('integral:staging-state-changed', handler);
    };
  }, [staged.token]);

  // Post-consume Undo eligibility.
  useEffect(() => {
    if (status.state !== 'consumed' || rolledBack) {
      setRollbackAvailable(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getRollbackStatusShared(staged.token);
      if (cancelled) return;
      const available = Boolean(res.ok && res.available);
      setRollbackAvailable(available);
      setRollbackReason(
        available ? null : (res.message ?? res.reason ?? 'Undo unavailable'),
      );
      if (available) {
        stashUndoTokensFromConsumedNav(staged.token, latestConsumedNav.current);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `consumedNav` is deliberately NOT a dependency: it is state whose
    // identity changes on every extraction, which re-ran this probe on each
    // render and made rollback-status the single noisiest call on a
    // transcript. It is read through a ref because the effect only needs its
    // value at the moment the probe resolves, not a reason to run again.
  }, [status.state, staged.token, rolledBack]);

  useEffect(() => {
    if (!onTerminal) return;
    if (
      status.state === 'consumed' ||
      status.state === 'revoked' ||
      status.state === 'expired'
    ) {
      onTerminal(staged.token);
    }
  }, [status.state, staged.token, onTerminal]);

  const bless = useCallback(
    async () => {
      setStatus((prev) => ({ kind: 'loading', state: prev.state }));
      try {
        const current = await getStagingTokenState(staged.token);
        const requiresStrongConfirmation = Boolean(
          current?.requires_strong_confirmation ??
            staged.requires_strong_confirmation,
        );
        let strongConfirmation = false;
        if (requiresStrongConfirmation) {
          if (!onNeedsStrongConfirmation) {
            setStatus((prev) => ({
              kind: 'error',
              state: prev.state,
              message: 'Review this high-impact change in chat before approving it.',
            }));
            return;
          }
          strongConfirmation = await onNeedsStrongConfirmation(staged.summary);
          if (!strongConfirmation) {
            setStatus((prev) => ({ kind: 'idle', state: prev.state }));
            return;
          }
        }
        const res = await blessStagingToken(staged.token, { strongConfirmation });
        if (!res.ok) {
          setStatus((prev) => ({
            kind: 'error',
            state: prev.state,
            message: res.message ?? 'Approval failed.',
          }));
          return;
        }

        // Blessing only marks the token approved. Whether the write ran is
        // whatever the backend says:
        //   - `execute_result` present and clean → it already ran.
        //   - `execute_result` carrying an error, `filed: false`, or
        //     `skipped: true` → surface it, stay blessed; do NOT nudge
        //     (an empty host turn is not a retry).
        //   - `needs_agent_build` → design affirmed; staging_follow_through
        //     + host design-build directive (AGENT-17). Also emit the
        //     staging event so Prompt Sheet reconcile can drain.
        //   - absent → blessed; staging_follow_through host-applies next.
        let writeCompleted = false;
        let needsAgentBuild = false;
        let needsFollowThrough = false;
        let executePayload: unknown;
        const exec = res.execute_result as
          | (Record<string, unknown> & {
              error?: unknown;
              filed?: boolean;
              skipped?: boolean;
              message?: unknown;
              detail?: unknown;
              needs_agent_build?: boolean;
            })
          | undefined;
        const execFailed =
          !!exec && (!!exec.error || exec.filed === false || exec.skipped === true);
        needsAgentBuild = !!exec && !execFailed && exec.needs_agent_build === true;

        if (needsAgentBuild) {
          executePayload = exec;
          setStatus({ kind: 'idle', state: 'consumed' });
        } else if (exec && !execFailed) {
          executePayload = exec;
          setConsumedNav(extractConsumedNav(exec, staged));
          setStatus({ kind: 'idle', state: 'consumed' });
          writeCompleted = true;
        } else if (exec) {
          setStatus({
            kind: 'error',
            state: 'blessed',
            message: execFailureMessage(exec),
          });
        } else {
          setStatus({ kind: 'idle', state: 'blessed' });
          needsFollowThrough = true;
        }

        if (writeCompleted || needsAgentBuild) {
          if (writeCompleted) {
            const nav = extractConsumedNav(executePayload, staged);
            stashUndoTokensFromConsumedNav(staged.token, nav);
            void invalidateAfterAgentWrite(queryClient, {
              staged,
              executeResult: executePayload,
            });
          }
          window.dispatchEvent(
            new CustomEvent('integral:staging-state-changed', {
              detail: {
                token: staged.token,
                state: 'consumed',
              },
            }),
          );
        }
        if (needsAgentBuild || needsFollowThrough) {
          // Design affirm uses the same host action: backend allows
          // staging_follow_through with no blessed tokens when a design is
          // affirmed for build. prompt_sheet_resume requires a drained sheet
          // and races the reconcile that closes it.
          onNeedsAgentNudge?.('staging_follow_through');
        }
      } catch (err) {
        setStatus((prev) => ({
          kind: 'error',
          state: prev.state,
          message: err instanceof Error ? err.message : 'Network error.',
        }));
      }
    },
    [staged, queryClient, onNeedsAgentNudge, onNeedsStrongConfirmation],
  );

  const revoke = useCallback(async () => {
    setStatus((prev) => ({ kind: 'loading', state: prev.state }));
    try {
      const res = await revokeStagingToken(staged.token);
      if (!res.ok) {
        setStatus((prev) => ({
          kind: 'error',
          state: prev.state,
          message: res.message ?? 'Revoke failed.',
        }));
        return;
      }
      setStatus({ kind: 'idle', state: 'revoked' });
    } catch (err) {
      setStatus((prev) => ({
        kind: 'error',
        state: prev.state,
        message: err instanceof Error ? err.message : 'Network error.',
      }));
    }
  }, [staged.token]);

  const executeRollback = useCallback(async () => {
    if (!rollbackAvailable || rollbackLoading) return;
    setRollbackLoading(true);
    try {
      const res = await rollbackStagingToken(staged.token);
      if (!res.ok) {
        setStatus((prev) => ({
          kind: 'error',
          state: prev.state,
          message: res.message ?? 'Rollback failed.',
        }));
        return;
      }
      setRolledBack(true);
      setRollbackAvailable(false);
      window.dispatchEvent(
        new CustomEvent('integral:staging-state-changed', {
          detail: { token: staged.token, state: 'revoked' },
        }),
      );
      await invalidateAfterAgentWrite(queryClient, {
        staged,
        executeResult: staged.execute_result,
      });
    } catch (err) {
      setStatus((prev) => ({
        kind: 'error',
        state: prev.state,
        message: err instanceof Error ? err.message : 'Rollback failed.',
      }));
    } finally {
      setRollbackLoading(false);
    }
  }, [rollbackAvailable, rollbackLoading, staged, queryClient]);

  return {
    status,
    state: status.state,
    busy: status.kind === 'loading',
    error: status.kind === 'error' ? status.message : null,
    consumedNav,
    isTerminal:
      status.state === 'consumed' ||
      status.state === 'revoked' ||
      status.state === 'expired',
    isBlessed: status.state === 'blessed',
    bless,
    revoke,
    rollback: {
      available: rollbackAvailable,
      reason: rollbackReason,
      loading: rollbackLoading,
      done: rolledBack,
      execute: executeRollback,
    },
  };
}
