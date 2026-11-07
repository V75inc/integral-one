import { useCallback, useLayoutEffect, useMemo } from 'react';
import { entriesApi } from '../api';
import type { Entry } from '../types';

/** Share host reads and discard responses after navigation or workspace changes. */
export function useEntryHostRefresh(
  entryId: string,
  workspaceId: string | undefined,
  onRefreshed: (entry: Entry) => void,
): () => Promise<void> {
  const scope = useMemo<{ active: boolean; pending?: Promise<void> }>(
    () => ({ active: false }), [entryId, workspaceId],
  );
  useLayoutEffect(() => {
    scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  return useCallback(() => {
    if (!scope.active) return Promise.resolve();
    if (scope.pending) return scope.pending;
    scope.pending = (async () => {
      try {
        const refreshed = await entriesApi.get(entryId);
        if (scope.active) onRefreshed(refreshed);
      } catch {
        // Preserve the displayed record; a later refresh can recover.
      } finally {
        scope.pending = undefined;
      }
    })();
    return scope.pending;
  }, [entryId, onRefreshed, scope]);
}
