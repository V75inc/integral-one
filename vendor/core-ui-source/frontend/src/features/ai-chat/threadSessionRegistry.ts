import type { ThreadMessageLike } from "@assistant-ui/react";

/** Max concurrent in-flight streams across different threads (I-CHAT-PAR-02). */
export const MAX_CONCURRENT_STREAMS = 5;

/**
 * Local refusal when a send arrives while this thread already has a turn.
 * The running indicator already says that. It is not a failed turn, and it
 * must not stay on screen after the reply finishes.
 */
export const THREAD_ALREADY_RESPONDING = "This conversation is already responding.";

/** Max cached thread transcripts in memory before LRU eviction. */
export const MAX_CACHED_THREAD_SESSIONS = 20;

export type ThreadSessionState = {
  /**
   * Workspace the thread belongs to.
   *
   * Sessions are keyed by thread id alone, which left no way to say "drop the
   * other workspace's transcripts" — so the workspace-switch path reached for
   * a blunt wipe of everything, in-flight streams included. Carrying the
   * workspace makes that eviction selective. Null until the owning thread's
   * workspace is known (a locally-allocated thread before its first send).
   */
  workspaceId: string | null;
  messages: ThreadMessageLike[];
  streaming: boolean;
  activityText: string | null;
  streamError: string | null;
  abortController: AbortController | null;
  lastLoadedAt: number;
  activeWorkItemId?: string | null;
};

export function createEmptySession(
  workspaceId: string | null = null,
): ThreadSessionState {
  return {
    workspaceId,
    messages: [],
    streaming: false,
    activityText: null,
    streamError: null,
    abortController: null,
    lastLoadedAt: 0,
  };
}

export function evictIdleSessions(
  sessions: Record<string, ThreadSessionState>,
  streamingThreadIds: readonly string[],
  protectThreadId?: string | null,
): Record<string, ThreadSessionState> {
  const keys = Object.keys(sessions);
  if (keys.length <= MAX_CACHED_THREAD_SESSIONS) return sessions;

  const streaming = new Set(streamingThreadIds);
  const candidates = keys
    .filter(
      (id) =>
        id !== protectThreadId &&
        !streaming.has(id) &&
        !sessions[id]?.streaming,
    )
    .sort(
      (a, b) =>
        (sessions[a]?.lastLoadedAt ?? 0) - (sessions[b]?.lastLoadedAt ?? 0),
    );

  let next = { ...sessions };
  for (const id of candidates) {
    if (Object.keys(next).length <= MAX_CACHED_THREAD_SESSIONS) break;
    const { [id]: _removed, ...rest } = next;
    next = rest;
  }
  return next;
}

export function addStreamingThreadId(
  prev: readonly string[],
  threadId: string,
): string[] {
  if (prev.includes(threadId)) return [...prev];
  return [...prev, threadId];
}

export function removeStreamingThreadId(
  prev: readonly string[],
  threadId: string,
): string[] {
  return prev.filter((id) => id !== threadId);
}

/**
 * Drop cached transcripts belonging to workspaces other than `keepWorkspaceId`.
 *
 * Streaming sessions are kept regardless of workspace — a turn the user
 * started is theirs to finish, and killing it because they glanced at another
 * workspace is the behaviour this replaces. Sessions with an unknown
 * workspace are kept too: guessing wrong here throws away live work.
 */
export function evictOtherWorkspaceSessions(
  sessions: Record<string, ThreadSessionState>,
  keepWorkspaceId: string | null,
  streamingThreadIds: readonly string[],
): Record<string, ThreadSessionState> {
  const streaming = new Set(streamingThreadIds);
  const next: Record<string, ThreadSessionState> = {};
  for (const [id, session] of Object.entries(sessions)) {
    const keep =
      streaming.has(id) ||
      session.streaming ||
      session.workspaceId == null ||
      session.workspaceId === keepWorkspaceId;
    if (keep) next[id] = session;
  }
  return next;
}
