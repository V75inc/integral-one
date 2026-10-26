/** Shared React Query keys for cross-route cache reuse. */

import type { QueryClient } from '@tanstack/react-query';

export const TRACKS_LIST_DEFAULT_PARAMS = { limit: 100 } as const;

/** Query prefixes wiped on workspace switch — not keyed by workspace id. */
export const WORKSPACE_SWITCH_UNSCOPED_PREFIXES = [
  'mission-control',
  'dashboards',
  'views',
  'tags',
  'notifications',
] as const;

/**
 * True when a ``['tracks', …]`` key is a list that is *not* partitioned by
 * workspace id. Workspace-scoped lists (``[...tracksListQueryKey(...), wid]``)
 * are removed by ScopeContext's ``prevWid`` predicate; these leftovers would
 * otherwise leak across a switch.
 */
export function isUnscopedTracksListQueryKey(queryKey: readonly unknown[]): boolean {
  if (queryKey[0] !== 'tracks') return false;
  if (queryKey[1] === 'for-library-merge') return true;
  if (queryKey[1] !== 'list') return false;
  // ['tracks', 'list', 'for-bindings']
  if (queryKey[2] === 'for-bindings') return true;
  // ['tracks', 'list', 'app', appId] — unscoped; scoped form appends workspaceId
  if (queryKey[2] === 'app') return typeof queryKey[4] !== 'string';
  // ['tracks', 'list', { limit }] — unscoped; scoped form appends workspaceId
  if (typeof queryKey[2] === 'object' && queryKey[2] !== null) {
    return typeof queryKey[3] !== 'string';
  }
  return false;
}

/** Remove caches that cannot be partitioned by workspace id on switch. */
export function removeUnscopedCachesOnWorkspaceSwitch(qc: QueryClient): void {
  for (const prefix of WORKSPACE_SWITCH_UNSCOPED_PREFIXES) {
    qc.removeQueries({ queryKey: [prefix] });
  }
  qc.removeQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) && isUnscopedTracksListQueryKey(q.queryKey),
  });
  // Connector panels with legacy keys still need cleanup. Preserve the new
  // workspace-partitioned observers; removing their cache disconnects future
  // invalidations from the mounted list.
  qc.removeQueries({
    predicate: (q) => q.queryKey[0] === 'connectors' && !(
      ['list', 'tools', 'catalog'].includes(String(q.queryKey[1])) &&
      typeof q.queryKey[2] === 'string' && typeof q.queryKey[3] === 'string'
    ),
  });
}

export function missionControlSnapshotQueryKey(workspaceId?: string | null) {
  return workspaceId
    ? (['mission-control', 'snapshot', workspaceId] as const)
    : (['mission-control', 'snapshot'] as const);
}

export function appsListQueryKey(scope: string, workspaceId: string) {
  return ['apps', 'list', scope, workspaceId] as const;
}

export function tracksListQueryKey(appId: string) {
  if (appId) {
    return ['tracks', 'list', 'app', appId] as const;
  }
  return ['tracks', 'list', TRACKS_LIST_DEFAULT_PARAMS] as const;
}

export const FEED_DASHBOARD_PREVIEW_QUERY_KEY = [
  'feed',
  'dashboardPreview',
  { limit: 50 },
] as const;

/**
 * Root prefix for the main feed-entries infinite-query (FeedPage uses
 * sub-keyed variants like ``[...root, workspaceId, appId, trackFilter]``).
 * Exported so call sites OTHER than FeedPage — e.g. EntryCard's
 * optimistic-delete rollback — can invalidate the feed without
 * importing from FeedPage.tsx (which would leak page-level concerns
 * into reusable components).
 */
export const FEED_ENTRIES_QUERY_KEY_ROOT = ['feed', 'entries'] as const;

/**
 * Every query whose key starts with ``['feed']``. Includes:
 *   - ``['feed', 'entries', ...]``      (FeedPage infinite query)
 *   - ``['feed', 'dashboardPreview', ...]`` (Mission Control preview)
 *   - any future ``['feed', ...]`` variant.
 *
 * Entry create / delete mutations MUST call this helper instead of
 * narrowly invalidating a single sub-key, otherwise Mission Control's
 * tallies (entries-today, active-tracks, last-activity) go stale while
 * the FeedPage list updates.
 */
export type QueryInvalidator = Pick<QueryClient, 'invalidateQueries'>;

export function invalidateFeedCaches(qc: QueryInvalidator): Promise<void> {
  return qc.invalidateQueries({ queryKey: ['feed'] });
}

/**
 * Every query whose key starts with ``['workspaces']``. Includes:
 *   - ``['workspaces']``                (top-level list)
 *   - ``['workspaces', wsId, 'tracks']`` (Mission Control per-workspace tracks)
 *   - ``['workspaces', wsId, 'apps']``   (Mission Control per-workspace apps)
 *
 * Track / App create / delete mutations MUST call this helper so the
 * Mission Control track/app counts stay current.
 */
export function invalidateWorkspaceListCaches(qc: QueryInvalidator): Promise<void> {
  return qc.invalidateQueries({ queryKey: ['workspaces'] });
}

/** Invalidate admin list/overview caches after a workspace is deleted. */
export async function invalidateAfterAdminWorkspaceDelete(
  qc: QueryClient,
  workspaceId: string,
): Promise<void> {
  qc.removeQueries({ queryKey: ['admin', 'workspace', workspaceId] });
  qc.removeQueries({ queryKey: ['admin', 'workspace-members', workspaceId] });
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'overview'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'apps'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'tracks'] }),
    invalidateWorkspaceListCaches(qc),
    qc.invalidateQueries({ queryKey: ['me', 'scope'] }),
    qc.invalidateQueries({ queryKey: ['mission-control'] }),
  ]);
}

/** Invalidate admin list/overview caches after a user is deleted. */
export async function invalidateAfterAdminUserDelete(
  qc: QueryClient,
  userId: string,
): Promise<void> {
  qc.removeQueries({ queryKey: ['admin', 'user', userId] });
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'overview'] }),
  ]);
}

/** Invalidate admin resource list caches (apps/tracks are workspace-scoped). */
export async function invalidateAfterAdminResourceMutation(
  qc: QueryClient,
  resourceType: 'app' | 'track',
  resourceId: string,
): Promise<void> {
  qc.removeQueries({ queryKey: ['admin', resourceType, resourceId] });
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['admin', resourceType === 'app' ? 'apps' : 'tracks'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'overview'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] }),
  ]);
}

export function entryTypesForTrackQueryKey(trackId: string) {
  return ['entryTypes', 'list', { track_id: trackId }] as const;
}

export function tagsForWorkspaceQueryKey(workspaceId: string) {
  return ['tags', 'workspace', workspaceId] as const;
}

export function tagsForTrackQueryKey(trackId: string) {
  return ['tags', 'list', { track_id: trackId }] as const;
}

export function viewsForTrackQueryKey(trackId: string) {
  return ['views', 'list', { track_id: trackId }] as const;
}

export function relatedCommunicationsQueryKey(entryId: string) {
  return ['related-communications', entryId] as const;
}

export function trackAttachedOperationalModelQueryKey(trackId: string) {
  return ['operationalModel', 'track', trackId] as const;
}
