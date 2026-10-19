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

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ entryId?: string }>).detail;
      if (!detail?.entryId || detail.entryId !== openEntryId) return;
      void entriesApi.get(openEntryId).then(onRefetched);
    };

    window.addEventListener(ENTRY_REFETCH_EVENT, handler);
    return () => window.removeEventListener(ENTRY_REFETCH_EVENT, handler);
  }, [openEntryId, onRefetched]);
}
