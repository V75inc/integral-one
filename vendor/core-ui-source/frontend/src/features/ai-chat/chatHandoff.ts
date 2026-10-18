/**
 * Short-lived handoff so navigating away from /agent still opens the
 * companion chat (and optionally restores the same thread) — keeps Undo
 * reachable after clicking a Created link.
 */

export const OPEN_AI_CHAT_EVENT = 'integral:open-ai-chat';
const HANDOFF_KEY = 'integral:ai-chat-handoff';
const LAST_THREAD_KEY = 'integral:ai-chat-last-thread';
const CHAT_DRAFT_KEY = 'integral:ai-chat-draft';
const HANDOFF_TTL_MS = 60_000;

export type ChatHandoff = {
  threadId?: string | null;
  ts: number;
};

type LastActiveThread = { threadId: string; workspaceId: string | null };

/**
 * Persist the active chat thread so Created-link handoff can restore it.
 *
 * Keyed by workspace: a thread remembered in one workspace must not be
 * re-selected after switching to another — the runtime's mount-time restore
 * used to do exactly that and reopened the previous workspace's conversation.
 * `workspaceId` is optional for callers that do not know it (the dock's
 * handoff listener); an unknown workspace matches any reader.
 */
export function rememberActiveChatThreadId(
  threadId: string | null,
  workspaceId?: string | null,
): void {
  try {
    if (!threadId || threadId.startsWith('local-')) {
      sessionStorage.removeItem(LAST_THREAD_KEY);
      return;
    }
    const payload: LastActiveThread = { threadId, workspaceId: workspaceId ?? null };
    sessionStorage.setItem(LAST_THREAD_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * Read the remembered thread. When `workspaceId` is given, a thread recorded
 * under a *different* workspace is ignored; one recorded with no workspace
 * (or read with none) is returned as before.
 */
export function peekLastActiveChatThreadId(workspaceId?: string | null): string | null {
  try {
    const raw = sessionStorage.getItem(LAST_THREAD_KEY);
    if (!raw) return null;
    let parsed: LastActiveThread;
    try {
      const candidate = JSON.parse(raw) as unknown;
      if (!candidate || typeof candidate !== 'object') {
        // Pre-keyed slot held a bare id string.
        parsed = { threadId: raw, workspaceId: null };
      } else {
        parsed = candidate as LastActiveThread;
      }
    } catch {
      parsed = { threadId: raw, workspaceId: null };
    }
    if (!parsed.threadId) return null;
    if (
      workspaceId &&
      parsed.workspaceId &&
      parsed.workspaceId !== workspaceId
    ) {
      return null;
    }
    return parsed.threadId;
  } catch {
    return null;
  }
}

export function requestOpenCompanionChat(opts?: {
  threadId?: string | null;
  draftText?: string | null;
  /** Explicit user action to send the scoped handoff immediately. */
  submit?: boolean;
  workspaceId?: string | null;
  principalId?: string | null;
}): void {
  const payload: ChatHandoff = {
    threadId: opts?.threadId ?? null,
    ts: Date.now(),
  };
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
    if (opts?.draftText?.trim()) {
      sessionStorage.setItem(
        CHAT_DRAFT_KEY,
        JSON.stringify({ text: opts.draftText.trim(), ts: payload.ts,
          submit: opts.submit === true, workspaceId: opts.workspaceId ?? null, principalId: opts.principalId ?? null }),
      );
    }
  } catch {
    /* private mode / quota — event alone still helps if the dock is mounted */
  }
  window.dispatchEvent(
    new CustomEvent(OPEN_AI_CHAT_EVENT, { detail: payload }),
  );
}

export type PendingChatInput = { text: string; submit: boolean; workspaceId: string | null; principalId: string | null };

/** Consume once, only when the runtime can accept the handoff. */
export function consumePendingChatInput(): PendingChatInput | null {
  try {
    const raw = sessionStorage.getItem(CHAT_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(CHAT_DRAFT_KEY);
    const parsed = JSON.parse(raw) as { text?: string; ts?: number; submit?: boolean; workspaceId?: string | null; principalId?: string | null };
    if (!parsed?.ts || Date.now() - parsed.ts > HANDOFF_TTL_MS) return null;
    if (typeof parsed.text !== 'string' || !parsed.text.trim()) return null;
    return { text: parsed.text.trim(), submit: parsed.submit === true,
      workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : null,
      principalId: typeof parsed.principalId === 'string' ? parsed.principalId : null };
  } catch {
    return null;
  }
}

/** Compatibility for draft-only consumers; never submits. */
export function consumePendingChatDraft(): string | null {
  return consumePendingChatInput()?.text ?? null;
}

/** Read + clear a still-fresh handoff (or null if missing/expired). */
export function consumeChatHandoff(): ChatHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as ChatHandoff;
    if (!parsed?.ts || Date.now() - parsed.ts > HANDOFF_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Peek without clearing (dock open vs runtime thread switch). */
export function peekChatHandoff(): ChatHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatHandoff;
    if (!parsed?.ts || Date.now() - parsed.ts > HANDOFF_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** A deliberate empty conversation is a view choice, scoped to its owner. */
export type FreshChatScope = {
  principalId: string | null;
  workspaceId: string | null;
  providerId: string;
};

function freshChatKey(scope: FreshChatScope): string | null {
  if (!scope.principalId || !scope.workspaceId) return null;
  return `integral:ai-chat-fresh:${JSON.stringify([scope.principalId, scope.workspaceId, scope.providerId])}`;
}

export function rememberFreshChat(scope: FreshChatScope, fresh: boolean): void {
  const key = freshChatKey(scope);
  if (!key) return;
  try {
    if (fresh) sessionStorage.setItem(key, '1');
    else sessionStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable; the in-memory selection still works. */
  }
}

export function prefersFreshChat(scope: FreshChatScope): boolean {
  const key = freshChatKey(scope);
  if (!key) return false;
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
