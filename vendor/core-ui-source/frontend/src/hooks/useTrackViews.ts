import { useQuery } from '@tanstack/react-query';

import { trackViewsApi } from '../api';
import { viewsForTrackQueryKey } from '../queryKeys';

const TRACK_VIEWS_STALE_MS = 30_000;

export function useTrackViews(trackId: string | undefined) {
  return useQuery({
    queryKey: viewsForTrackQueryKey(trackId ?? ''),
    enabled: Boolean(trackId),
    queryFn: () => trackViewsApi.list(trackId!),
    staleTime: TRACK_VIEWS_STALE_MS,
  });
}

export { TRACK_VIEWS_STALE_MS };
