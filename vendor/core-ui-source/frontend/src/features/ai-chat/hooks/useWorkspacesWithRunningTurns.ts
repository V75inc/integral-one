import { useMemo, useSyncExternalStore } from "react";

import {
  getRemoteTurnsSnapshot,
  getThreadSessionSnapshot,
  subscribeRemoteTurns,
  subscribeThreadSessions,
} from "../threadSessionStore";

/**
 * Workspaces with a turn running right now.
 *
 * The chat surface can only show a spinner for the workspace it is displaying.
 * Start a turn in workspace A, switch to B, and the work becomes invisible —
 * "your other workspace is still working" is a claim only the workspace
 * switcher is positioned to make.
 *
 * Two sources merge here:
 *
 * - streams this tab owns — `streamingThreadIds`, resolved to a workspace
 *   through the owning session;
 * - turns it does not — `remoteTurns` (a routine's headless turn, or the same
 *   account in another window), which carries its own workspace precisely
 *   because there is no local session to resolve it from.
 *
 * A streaming thread whose workspace is not yet known is skipped rather than
 * attributed to the active one: a locally-allocated thread has no workspace
 * until its first send, and guessing lights the wrong row.
 *
 * The returned Set is memoized on the two store snapshots, which are stable
 * between emits. Deriving it inline would hand `useSyncExternalStore` a fresh
 * reference on every call — an infinite render loop — and would re-fire any
 * effect that takes it as a dependency.
 */
export function useWorkspacesWithRunningTurns(): ReadonlySet<string> {
  const store = useSyncExternalStore(
    subscribeThreadSessions,
    getThreadSessionSnapshot,
  );
  const remote = useSyncExternalStore(
    subscribeRemoteTurns,
    getRemoteTurnsSnapshot,
  );

  return useMemo(() => {
    const ids = new Set<string>();
    for (const threadId of store.streamingThreadIds) {
      const workspaceId = store.sessions[threadId]?.workspaceId;
      if (workspaceId) ids.add(workspaceId);
    }
    for (const turn of Object.values(remote)) {
      if (turn.workspaceId) ids.add(turn.workspaceId);
    }
    return ids;
  }, [store, remote]);
}
