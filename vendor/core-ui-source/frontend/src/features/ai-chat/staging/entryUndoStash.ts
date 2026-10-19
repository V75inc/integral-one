/**
 * Session stash mapping entry id → staging token so EntryDetail can offer
 * Undo after the user navigates away from chat (token lives on ChangeEvents,
 * not on Entry.provenance).
 */

const PREFIX = 'integral:undo:';
const TTL_MS = 30 * 60 * 1000;

type StashPayload = { token: string; ts: number };

export function stashEntryUndoToken(entryId: string, token: string): void {
  if (!entryId || !token) return;
  try {
    const payload: StashPayload = { token, ts: Date.now() };
    sessionStorage.setItem(PREFIX + entryId, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function peekEntryUndoToken(entryId: string): string | null {
  if (!entryId) return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + entryId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StashPayload;
    if (!parsed?.token || !parsed.ts || Date.now() - parsed.ts > TTL_MS) {
      sessionStorage.removeItem(PREFIX + entryId);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function clearEntryUndoToken(entryId: string): void {
  if (!entryId) return;
  try {
    sessionStorage.removeItem(PREFIX + entryId);
  } catch {
    /* ignore */
  }
}

/** Stash undo tokens for every entry created by a consumed nav payload. */
export function stashUndoTokensFromConsumedNav(
  token: string,
  nav: {
    entryId?: string | null;
    created?: Array<{ kind: string; id: string }>;
  },
): void {
  if (!token) return;
  if (nav.entryId) stashEntryUndoToken(nav.entryId, token);
  for (const ref of nav.created || []) {
    if (ref.kind === 'entry' && ref.id) stashEntryUndoToken(ref.id, token);
  }
}
