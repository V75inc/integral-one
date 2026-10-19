/**
 * Module-level store for chat stream state.
 *
 * This used to live in `useState`/`useRef` inside `useAIChatRuntime`, which
 * meant it died with the hook instance. Three ordinary actions destroy that
 * instance — closing the dock, navigating to `/agent` (the dock unmounts and
 * the page mounts its own runtime), and switching provider — so an in-flight
 * turn was lost by simply moving around, and the dock and `/agent` were two
 * disconnected worlds with separate caches of the same threads.
 *
 * Hoisting it here makes the runtime a *view* over shared state: any number
 * of runtime instances read and write the same sessions, and a remount
 * rehydrates instead of starting blank.
 *
 * `getSnapshot` must return a referentially stable value between changes —
 * `useSyncExternalStore` re-renders forever otherwise — so `state` is
 * replaced only when something actually changed.
 */

import {
  createEmptySession,
  evictIdleSessions,
  evictOtherWorkspaceSessions,
  addStreamingThreadId,
  removeStreamingThreadId,
  type ThreadSessionState,
} from "./threadSessionRegistry";

export type ThreadSessionStoreState = {
  sessions: Record<string, ThreadSessionState>;
  streamingThreadIds: string[];
};

const EMPTY: ThreadSessionStoreState = {
  sessions: {},
  streamingThreadIds: [],
};

let state: ThreadSessionStoreState = EMPTY;
const listeners = new Set<() => void>();

function emit(next: ThreadSessionStoreState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeThreadSessions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getThreadSessionSnapshot(): ThreadSessionStoreState {
  return state;
}

/**
 * Read-through accessors. The hook previously mirrored this state into refs
 * so callbacks could read it without re-subscribing — and those mirrors were
 * updated in an effect, i.e. one render behind. The concurrency check read
 * the lagging copy. Reading the store directly removes the mirror and the
 * staleness with it.
 */
export function peekSessions(): Record<string, ThreadSessionState> {
  return state.sessions;
}

export function peekStreamingThreadIds(): readonly string[] {
  return state.streamingThreadIds;
}

export function updateThreadSession(
  threadId: string,
  patch:
    | Partial<ThreadSessionState>
    | ((prev: ThreadSessionState) => ThreadSessionState),
  opts?: { workspaceId?: string | null; protectThreadId?: string | null },
): void {
  const prev = state.sessions[threadId] ?? createEmptySession(opts?.workspaceId ?? null);
  const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
  if (next === prev) return;
  let sessions = { ...state.sessions, [threadId]: next };
  sessions = evictIdleSessions(
    sessions,
    state.streamingThreadIds,
    opts?.protectThreadId ?? null,
  );
  emit({ ...state, sessions });
}

export function markThreadStreaming(threadId: string): void {
  const streamingThreadIds = addStreamingThreadId(
    state.streamingThreadIds,
    threadId,
  );
  if (streamingThreadIds.length === state.streamingThreadIds.length) return;
  emit({ ...state, streamingThreadIds });
}

export function unmarkThreadStreaming(threadId: string): void {
  const streamingThreadIds = removeStreamingThreadId(
    state.streamingThreadIds,
    threadId,
  );
  if (streamingThreadIds.length === state.streamingThreadIds.length) return;
  emit({ ...state, streamingThreadIds });
}

/** Drop other workspaces' idle transcripts; streaming work always survives. */
export function evictOtherWorkspaces(keepWorkspaceId: string | null): void {
  const sessions = evictOtherWorkspaceSessions(
    state.sessions,
    keepWorkspaceId,
    state.streamingThreadIds,
  );
  if (Object.keys(sessions).length === Object.keys(state.sessions).length) return;
  emit({ ...state, sessions });
}

/**
 * Abort every in-flight stream and clear the store.
 *
 * For identity changes only — logout, or switching user. Navigation must NOT
 * call this: surviving navigation is the entire point of the store.
 */
export function resetThreadSessions(): void {
  for (const session of Object.values(state.sessions)) {
    session.abortController?.abort();
  }
  emitRemote({});
  emit(EMPTY);
}

/**
 * Drop cached transcripts on a provider change without touching in-flight
 * streams. A different backend means different session ids, so the
 * transcripts are not portable — but a turn already running against the old
 * provider still owns its connection and finishes on its own.
 */
export function clearIdleTranscripts(): void {
  const streaming = new Set(state.streamingThreadIds);
  const sessions: Record<string, ThreadSessionState> = {};
  for (const [id, session] of Object.entries(state.sessions)) {
    if (streaming.has(id) || session.streaming) sessions[id] = session;
  }
  if (Object.keys(sessions).length === Object.keys(state.sessions).length) return;
  emit({ ...state, sessions });
}

/**
 * Threads a turn is running on that this tab did NOT start — a routine's
 * headless turn, or the same account in another window.
 *
 * Kept separate from `streamingThreadIds`, which means "this tab owns a live
 * stream for that thread". Merging them would make a remote turn look
 * cancellable from here, and it is not: there is no AbortController for a
 * connection this tab never opened.
 */
let remoteTurns: Record<string, { workspaceId: string | null; turnId: string | null }> =
  {};
const remoteListeners = new Set<() => void>();

function emitRemote(next: typeof remoteTurns): void {
  remoteTurns = next;
  for (const l of remoteListeners) l();
}

export function subscribeRemoteTurns(listener: () => void): () => void {
  remoteListeners.add(listener);
  return () => {
    remoteListeners.delete(listener);
  };
}

export function getRemoteTurnsSnapshot(): typeof remoteTurns {
  return remoteTurns;
}

export function markRemoteTurnStarted(
  threadId: string,
  workspaceId: string | null,
  turnId: string | null,
): void {
  if (remoteTurns[threadId]?.turnId === turnId) return;
  emitRemote({ ...remoteTurns, [threadId]: { workspaceId, turnId } });
}

export function markRemoteTurnFinished(threadId: string, turnId: string | null): void {
  const current = remoteTurns[threadId];
  if (!current) return;
  // A late `completed` for a turn that has already been superseded by a newer
  // `started` must not clear the newer one — this is what `turn_id` is for.
  if (turnId && current.turnId && current.turnId !== turnId) return;
  const { [threadId]: _done, ...rest } = remoteTurns;
  emitRemote(rest);
}

/**
 * Monotonic id source for locally-minted ids (threads, draft messages).
 *
 * Must be module-level now that the store is: the counter used to live in a
 * per-hook ref starting at 0, so two runtime instances — the dock and
 * `/agent` — each minted `thr-1`, `a-1`, `u-1` and collided the moment they
 * shared a store. assistant-ui surfaces that as "a message with the same id
 * already exists in the parent tree".
 *
 * Deliberately NOT reset by `resetThreadSessions`: ids must stay unique for
 * the life of the page, and recycling them after a logout would reintroduce
 * exactly the collision this exists to prevent. `__resetForTests` is the one
 * exception, so a test file's cases start from a clean slate.
 */
let idCounter = 0;

export function nextLocalId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Test-only: abort in-flight streams and clear the store between cases.
 *
 * Deliberately does NOT reset `idCounter`. A stream aborted here unmarks
 * itself asynchronously in its own `finally`, which can land *after* the next
 * case has started — and if ids restarted from zero, that late unmark would
 * target a thread the new case had just minted with the same id. Monotonic
 * ids make the stale callback a harmless no-op.
 */
export function __resetThreadSessionStoreForTests(): void {
  for (const session of Object.values(state.sessions)) {
    session.abortController?.abort();
  }
  state = EMPTY;
  remoteTurns = {};
  listeners.forEach((l) => l());
  remoteListeners.forEach((l) => l());
}
