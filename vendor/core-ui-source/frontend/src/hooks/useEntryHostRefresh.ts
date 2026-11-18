import { useCallback, useLayoutEffect, useMemo } from 'react';
import { entriesApi } from '../api';
import type { Entry } from '../types';

/** Share host reads and discard responses after navigation or workspace changes. */
export function useEntryHostRefresh(
  entryId: string,
  workspaceId: string | undefined,
  onRefreshed: (entry: Entry) => void,
): () => Promise<void> {
  const scope = useMemo<{ active: boolean; pending?: Promise<void>; again?: boolean }>(
    () => ({ active: false }), [entryId, workspaceId],
  );
  useLayoutEffect(() => {
    scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  return useCallback(() => {
    if (!scope.active) return Promise.resolve();
    // A read already in flight started before whatever changed the record, so it may show the old values: ask for
    // one more read after it, and hand every caller the same promise.
    if (scope.pending) { scope.again = true; return scope.pending; }
    scope.pending = (async () => {
      try {
        do {
          scope.again = false;
          try {
            const refreshed = await entriesApi.get(entryId);
            if (scope.active) onRefreshed(refreshed);
          } catch {
            // Preserve the displayed record; a later refresh can recover.
          }
        } while (scope.again && scope.active);
      } finally {
        scope.pending = undefined;
      }
    })();
    return scope.pending;
  }, [entryId, onRefreshed, scope]);
}
