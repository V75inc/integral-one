/**
 * Everything the agent is waiting on you for, in one place.
 *
 * Pending agent work was scattered across four surfaces — the inline card in
 * whichever conversation minted it, the bell modal's Approvals tab,
 * `/approvals`, and `/background-tasks` — with no single view and no shared
 * count. That is not a tidiness complaint: a staged change was once visible
 * ONLY as the inline card in its own thread, so the Approvals page said "all
 * clear" while a card sat awaiting approval in chat (the note in
 * `StagedChatApprovals` records that incident), and later in this work an
 * interrupted turn left a real staged change reachable from nowhere but
 * `/approvals`.
 *
 * This hook is the aggregate. It does not replace those pages — each section
 * links out to the full surface — it just makes "is anything waiting on me?"
 * answerable without visiting four places.
 *
 * Counting rule: **staged changes + policy approvals**. Routines are listed
 * but never counted — a scheduled task running on its own schedule is status,
 * not a request, and a badge that lights up for work nobody asked you to do
 * trains people to ignore the badge.
 *
 * Clarifying questions are NOT included, despite belonging here conceptually:
 * `/agentive/questions/pending` answers per thread, so there is no way to ask
 * "which threads have an unanswered question?" without walking every thread.
 * Adding a user-scoped listing is the prerequisite; until then, counting them
 * would mean guessing.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';

import { listApprovals, type ApprovalResponse } from '../../../api/approvals';
import { listPendingStagedChanges } from '../../../api/agentive';
import { listRoutines, type RoutineResponse } from '../../../api/routines';
import type { StagedChange } from '../staging/types';

export type AgentInboxItemKind = 'staged' | 'approval' | 'routine';

export interface AgentInbox {
  staged: StagedChange[];
  approvals: ApprovalResponse[];
  routines: RoutineResponse[];
  /** Items genuinely awaiting a decision. Routines deliberately excluded. */
  actionableCount: number;
  loading: boolean;
  /** True when any source failed; the rest still render. */
  degraded: boolean;
  refetch: () => void;
}

const STAGED_KEY = ['agent-inbox', 'staged'] as const;
const APPROVALS_KEY = ['agent-inbox', 'approvals'] as const;
const ROUTINES_KEY = ['agent-inbox', 'routines'] as const;

// Inspect only status, preserving each query's independently inferred data type.
const retryFailedRead = (query: { state: { status: string } }): number | false =>
  query.state.status === 'error' ? 10_000 : false;

export function useAgentInbox({ enabled = true }: { enabled?: boolean } = {}): AgentInbox {
  const queryClient = useQueryClient();

  const results = useQueries({
    queries: [
      {
        queryKey: STAGED_KEY,
        queryFn: async () => {
          // `/staging/pending` deliberately returns pending AND blessed —
          // a blessed token whose write was refused (or whose kind has no
          // executor) is still owed. Filtering to `pending` alone made a
          // change that failed with 403 vanish from the inbox as though it
          // had succeeded. Only terminal states leave the list.
          const open = await listPendingStagedChanges();
          return open.filter(
            (sc) => sc.state === 'pending' || sc.state === 'blessed',
          );
        },
        enabled,
        // Recover failed reads while observed; healthy queues stay event-driven.
        refetchInterval: retryFailedRead,
        staleTime: 10_000,
      },
      {
        queryKey: APPROVALS_KEY,
        queryFn: async () => {
          const res = await listApprovals({ status: 'pending' });
          return res.approvals ?? [];
        },
        enabled,
        // Recover failed reads while observed; healthy queues stay event-driven.
        refetchInterval: retryFailedRead,
        staleTime: 10_000,
      },
      {
        queryKey: ROUTINES_KEY,
        queryFn: async () => (await listRoutines()).routines ?? [],
        enabled,
        // Recover failed reads while observed; healthy queues stay event-driven.
        refetchInterval: retryFailedRead,
        staleTime: 30_000,
      },
    ],
  });

  const [stagedQ, approvalsQ, routinesQ] = results;

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['agent-inbox'] });
  }, [queryClient]);

  // The app already broadcasts these; without listening, the inbox would sit
  // stale behind a decision the user just made on another surface — exactly
  // the disagreement between surfaces this view exists to end.
  //
  // `staging-created` matters as much as the resolution events: without it a
  // change staged seconds ago leaves the badge dark until something unrelated
  // triggers a refetch. Observed live — the card sat awaiting approval in chat
  // while the Inbox tab showed no count.
  useEffect(() => {
    if (!enabled) return;
    // Bulk changes can emit hundreds of graph events. Coalesce them into a
    // bounded refresh without postponing updates indefinitely during a burst.
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      if (refreshTimer !== undefined) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        refetch();
      }, 250);
    };
    window.addEventListener('integral:staging-created', onChange);
    window.addEventListener('integral:staging-state-changed', onChange);
    window.addEventListener('integral:graph-changed', onChange);
    window.addEventListener('integral:agent-events-reconnected', onChange);
    return () => {
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      window.removeEventListener('integral:staging-created', onChange);
      window.removeEventListener('integral:staging-state-changed', onChange);
      window.removeEventListener('integral:graph-changed', onChange);
      window.removeEventListener('integral:agent-events-reconnected', onChange);
    };
  }, [enabled, refetch]);

  const staged = useMemo(() => stagedQ.data ?? [], [stagedQ.data]);
  const approvals = useMemo(() => approvalsQ.data ?? [], [approvalsQ.data]);
  const routines = useMemo(() => routinesQ.data ?? [], [routinesQ.data]);

  return {
    staged,
    approvals,
    routines,
    actionableCount: staged.length + approvals.length,
    loading: results.some((r) => r.isLoading || r.isFetching),
    // One failed source must not blank the others — a broken routines
    // endpoint should not hide a pending approval.
    degraded: results.some((r) => r.isError),
    refetch,
  };
}
