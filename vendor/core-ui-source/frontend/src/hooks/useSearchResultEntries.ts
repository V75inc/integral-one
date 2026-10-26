import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { feedApi, type FeedEntriesPage } from '../api/feed';
import { tracksApi } from '../api/tracks';
import { FEED_ENTRIES_QUERY_KEY_ROOT } from '../queryKeys';

/** Read the ranked selection through the ordinary, permission-checked list API.
 * Never walk unrelated pages to find search hits or retry a rejected batch.
 */
export function useSearchResultEntries({
  entryIds,
  workspaceId,
  principalId,
  trackId,
  params = {},
  enabled,
}: {
  entryIds: string[];
  workspaceId?: string;
  principalId?: string;
  trackId?: string;
  params?: Record<string, unknown>;
  enabled: boolean;
}) {
  const ids = [...new Set(entryIds)].slice(0, 50);
  const client = useQueryClient();
  const prefix = useMemo(() => [
    ...(trackId ? ['track', trackId, 'entries'] : FEED_ENTRIES_QUERY_KEY_ROOT),
    'search-matches', principalId, workspaceId,
  ], [trackId, principalId, workspaceId]);
  const query = useQuery({
    queryKey: [...prefix, ids, params],
    enabled: enabled && Boolean(workspaceId && principalId) && ids.length > 0,
    queryFn: () => {
      const selection = { ...params, entry_ids: ids.join(','), limit: 50, include_total: false };
      return trackId
        ? tracksApi.getEntriesPage(trackId, selection)
        : feedApi.getEntriesPage(selection);
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 30000,
  });
  // Match pages participate in the same optimistic edits/deletes as the list.
  // Scope the patch to this principal and workspace, including cached searches.
  const patchPage = useCallback((update: (page: FeedEntriesPage) => FeedEntriesPage) => {
    client.setQueriesData<FeedEntriesPage>({ queryKey: prefix }, old => old ? update(old) : old);
  }, [client, prefix]);
  return { ...query, patchPage };
}
