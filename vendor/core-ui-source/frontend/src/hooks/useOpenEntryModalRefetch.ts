import { useEffect } from 'react';
import { entriesApi } from '../api';
import type { Entry } from '../types';
import { ENTRY_REFETCH_EVENT } from '../services/graphMutationInvalidation';

/**
 * When an entry mutation is detected globally, refetch the full entry record
 * for the open modal — list-cache invalidation alone may miss paginated rows.
 */
export function useOpenEntryModalRefetch(
  openEntryId: string | null | undefined,
  onRefetched: (entry: Entry) => void,
): void {
  useEffect(() => {
    if (!openEntryId) return undefined;

    let cancelled = false;
    let busy = false;
    let pending = false;
    const refresh = async () => {
      if (cancelled) return;
      if (busy) { pending = true; return; }
      busy = true;
      try {
        const entry = await entriesApi.get(openEntryId);
        if (!cancelled) onRefetched(entry);
      } catch { /* Existing API notifications own read errors. */ }
      finally {
        busy = false;
        if (pending && !cancelled) { pending = false; void refresh(); }
      }
    };
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ entryId?: string }>).detail;
      if (detail?.entryId === openEntryId) void refresh();
    };

    window.addEventListener(ENTRY_REFETCH_EVENT, handler);
    return () => {
      cancelled = true;
      window.removeEventListener(ENTRY_REFETCH_EVENT, handler);
    };
  }, [openEntryId, onRefetched]);
}
