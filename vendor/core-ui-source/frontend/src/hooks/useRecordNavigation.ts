import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Entry } from '../types';

export interface RecordNavigation {
  canPrevious: boolean;
  canNext: boolean;
  busy: boolean;
  label: string;
  cancel(): void;
  previous(): void;
  next(): void;
}

/** Navigate only the current list's authorized, ordered results. A fresh detail
 * read gates every transition; stale asynchronous responses never reopen a sheet. */
export function useRecordNavigation({
  enabled, contextKey, entryId, entries, page, pageCount, loading,
  loadPage, readEntry, openEntry, onError,
}: {
  enabled: boolean;
  contextKey: string;
  entryId?: string;
  entries: Entry[];
  page: number;
  pageCount: number;
  loading: boolean;
  loadPage(page: number): Promise<Entry[]>;
  readEntry(id: string): Promise<Entry>;
  openEntry(entry: Entry, page: number): void;
  onError(message: string): void;
}): RecordNavigation | undefined {
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const identity = `${contextKey}|${entryId ?? ''}|${enabled}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  useEffect(() => {
    sequence.current++;
    inFlight.current = false;
    setBusy(false);
    return () => { sequence.current++; };
  }, [identity]);
  const cancel = useCallback(() => {
    sequence.current++;
    inFlight.current = false;
    setBusy(false);
  }, []);
  const index = entries.findIndex(entry => entry.id === entryId);
  if (!enabled || !entryId || index < 0) return undefined;

  const move = async (direction: -1 | 1) => {
    if (inFlight.current || loading) return;
    inFlight.current = true;
    setBusy(true);
    const request = ++sequence.current;
    const active = () => request === sequence.current && currentIdentity.current === identity;
    try {
      let targetPage = page;
      let target = entries[index + direction];
      // Only fetch on an explicit navigation action, never prefetch a whole
      // Track. Empty pages can occur under client-side type/tag filters.
      let pagesRead = 0;
      while (!target && targetPage + direction >= 1 && targetPage + direction <= pageCount) {
        if (pagesRead++ >= 10) {
          if (active()) onError('Narrow the list filters before navigating further. The current record is unchanged.');
          return;
        }
        targetPage += direction;
        const candidates = await loadPage(targetPage);
        if (!active()) return;
        target = direction === 1 ? candidates[0] : candidates[candidates.length - 1];
      }
      if (!target) {
        onError(direction === 1 ? 'No next record in this list.' : 'No previous record in this list.');
        return;
      }
      const fresh = await readEntry(target.id);
      if (active()) openEntry(fresh, targetPage);
    } catch {
      if (active()) onError('Could not open the adjacent record. The current record is unchanged.');
    } finally {
      if (active()) { inFlight.current = false; setBusy(false); }
    }
  };
  return {
    canPrevious: !loading && (index > 0 || page > 1),
    canNext: !loading && (index < entries.length - 1 || page < pageCount),
    busy,
    cancel,
    label: `Record ${index + 1} on page ${page}`,
    previous: () => { void move(-1); },
    next: () => { void move(1); },
  };
}

/** Preserve a draft started while an adjacent detail read is still pending. */
export function useRecordNavigationDraftGuard(navigation: RecordNavigation | undefined, draftOpen: boolean) {
  useLayoutEffect(() => {
    if (draftOpen && navigation?.busy) navigation.cancel();
  }, [draftOpen, navigation?.busy, navigation?.cancel]);
}
