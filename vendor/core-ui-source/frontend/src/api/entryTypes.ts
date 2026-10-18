import apiClient from './client';
import { buildTypeNameById, toArr, unwrapResource } from './helpers';
import type { EntryTypeNode } from '../types';

/**
 * Short-TTL, in-flight-deduped cache of a track's EntryType id→name map.
 *
 * Feed/search list normalization needs the map for every rendered entry's
 * track. Without a cache, one search page fanned out a GET
 * /entry-types?track_id= per match — duplicated for the same track — and a
 * single user search tripped the backend rate limiter (June 30 review R2).
 * The promise is stored synchronously so concurrent callers share one
 * request; entries resolve from the same map for TTL ms afterwards.
 */
const TYPE_NAME_CACHE_TTL_MS = 60_000;
// Failed fetches (rate-limited bursts included) stay cached briefly so a
// storm of list normalizations doesn't hammer the endpoint with retries,
// but recover quickly once the burst passes.
const TYPE_NAME_FAILURE_TTL_MS = 5_000;
const typeNameCache = new Map<
  string,
  { at: number; promise: Promise<Record<string, string>> }
>();

export function invalidateEntryTypeNameCache(trackId?: string): void {
  if (trackId) typeNameCache.delete(trackId);
  else typeNameCache.clear();
}

export function getTypeNameMapForTrack(
  trackId: string
): Promise<Record<string, string>> {
  const hit = typeNameCache.get(trackId);
  if (hit && Date.now() - hit.at < TYPE_NAME_CACHE_TTL_MS) return hit.promise;
  const promise = apiClient
    .get('/entry-types', {
      params: { track_id: trackId },
      // Background enrichment — a transient failure just renders slugless
      // type labels; never worth the app-wide error banner.
      __suppressSystemNotify: true,
    } as never)
    .then(res => buildTypeNameById(toArr(res.data)))
    .catch(() => {
      // Re-stamp with the short failure TTL so callers back off together.
      typeNameCache.set(trackId, {
        at: Date.now() - TYPE_NAME_CACHE_TTL_MS + TYPE_NAME_FAILURE_TTL_MS,
        promise: Promise.resolve({} as Record<string, string>),
      });
      return {} as Record<string, string>;
    });
  typeNameCache.set(trackId, { at: Date.now(), promise });
  return promise;
}

export const entryTypesApi = {
  list: async (params?: { track_id?: string }): Promise<EntryTypeNode[]> => {
    const { data } = await apiClient.get('/entry-types', { params });
    return toArr(data) as EntryTypeNode[];
  },
  create: (body: {
    track_id: string;
    name: string;
    icon?: string;
    form_schema?: Record<string, unknown>;
  }) =>
    apiClient
      .post('/entry-types', body)
      .then(r => {
        invalidateEntryTypeNameCache(body.track_id);
        return unwrapResource<EntryTypeNode>(r.data, 'entry_type');
      }),
  update: (
    id: string,
    body: {
      name?: string;
      icon?: string;
      form_schema?: Record<string, unknown>;
    }
  ) =>
    apiClient
      .put(`/entry-types/${id}`, body)
      .then(r => {
        invalidateEntryTypeNameCache();
        return unwrapResource<EntryTypeNode>(r.data, 'entry_type');
      }),
  delete: (id: string) =>
    apiClient.delete(`/entry-types/${id}`).then(r => {
      invalidateEntryTypeNameCache();
      return r;
    }),
};
