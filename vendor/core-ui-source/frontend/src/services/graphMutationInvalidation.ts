import { matchQuery, type QueryClient, type InvalidateQueryFilters } from '@tanstack/react-query';
import {
  type QueryInvalidator,
  invalidateFeedCaches,
  invalidateWorkspaceListCaches,
} from '../queryKeys';
import { extractConsumedNav } from '../features/ai-chat/staging/consumedSummary';
import type { StagedChange } from '../features/ai-chat/staging/types';
import type { ActivityEvent } from '../utils/changeEvent';

export const ENTRY_REFETCH_EVENT = 'integral:entry-refetch';
export const COMMENT_REFETCH_EVENT = 'integral:comment-refetch';
export const APP_DELETED_EVENT = 'integral:app-deleted';

const ENTRY_WRITE_KINDS = new Set([
  'create_entry',
  'update_entry',
  'delete_entry',
  'file_content',
  'bulk_update_entries',
  'add_entry_tag',
  'remove_entry_tag',
  'add_comment',
]);

const TRACK_WRITE_KINDS = new Set([
  'create_track',
  'update_track',
  'delete_track',
]);

const APP_WRITE_KINDS = new Set(['create_app', 'update_app', 'delete_app']);

const DASHBOARD_WRITE_KINDS = new Set([
  'create_dashboard',
  'update_dashboard',
  'delete_dashboard',
]);

export function trackIdFromScope(scope?: string): string | undefined {
  if (!scope?.startsWith('track:')) return undefined;
  const id = scope.slice('track:'.length);
  return id || undefined;
}

export function appIdFromScope(scope?: string): string | undefined {
  if (!scope?.startsWith('app:')) return undefined;
  const id = scope.slice('app:'.length);
  return id || undefined;
}

/** Refresh open dashboard aggregate queries (charts/metrics). */
async function invalidateDashboardData(
  qc: QueryInvalidator,
  appId?: string | null,
): Promise<void> {
  await Promise.all(['app-home-data', 'app-home-definition', 'app-home-query'].map(root => qc.invalidateQueries({ queryKey: appId ? [root, appId] : [root] })));
  if (appId) {
    await qc.invalidateQueries({ queryKey: ['dashboard-data', appId] });
  } else {
    await qc.invalidateQueries({ queryKey: ['dashboard-data'] });
  }
}

/** Refresh dashboard layout list + aggregates for an app (or all apps). */
async function invalidateDashboardCaches(
  qc: QueryInvalidator,
  appId?: string | null,
): Promise<void> {
  await Promise.all([
    appId
      ? qc.invalidateQueries({ queryKey: ['dashboards', appId] })
      : qc.invalidateQueries({ queryKey: ['dashboards'] }),
    invalidateDashboardData(qc, appId),
  ]);
}

/** Ask open entry dialogs to refetch GET /entries/:id for the latest payload. */
export function dispatchEntryRefetch(entryId: string): void {
  window.dispatchEvent(
    new CustomEvent(ENTRY_REFETCH_EVENT, { detail: { entryId } }),
  );
}

/** Ask an open Entry detail to refresh its locally-held comment thread. */
export function dispatchCommentRefetch(entryId: string): void {
  window.dispatchEvent(
    new CustomEvent(COMMENT_REFETCH_EVENT, { detail: { entryId } }),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trackIdFromExecuteResult(executeResult?: unknown): string | undefined {
  const result = asRecord(executeResult);
  if (!result) return undefined;
  for (const key of ['entry', 'track'] as const) {
    const node = asRecord(result[key]);
    const inner = node ? asRecord(node[key]) : null;
    const resource = inner?.id ? inner : node;
    const trackId = resource?.track_id;
    if (typeof trackId === 'string' && trackId) return trackId;
  }
  return undefined;
}

function entryIdFromStaged(
  staged: StagedChange,
  executeResult?: unknown,
): string | undefined {
  const nav = extractConsumedNav(executeResult ?? {}, staged);
  if (nav.entryId) return nav.entryId;
  const diff = staged.diff_machine ?? {};
  const fromDiff = diff.entry_id;
  if (typeof fromDiff === 'string' && fromDiff) return fromDiff;
  const result = asRecord(executeResult);
  const entry = result ? asRecord(result.entry) : null;
  const inner = entry ? asRecord(entry.entry) : null;
  const id = inner?.id ?? entry?.id;
  return typeof id === 'string' && id ? id : undefined;
}

function trackIdFromStaged(
  staged: StagedChange,
  executeResult?: unknown,
): string | undefined {
  const nav = extractConsumedNav(executeResult ?? {}, staged);
  if (nav.trackId) return nav.trackId;
  const fromExecute = trackIdFromExecuteResult(executeResult);
  if (fromExecute) return fromExecute;
  const diff = staged.diff_machine ?? {};
  const fromDiff = diff.track_id;
  return typeof fromDiff === 'string' && fromDiff ? fromDiff : undefined;
}

function appIdFromStaged(staged: StagedChange): string | undefined {
  const diff = staged.diff_machine ?? {};
  const fromDiff = diff.app_id;
  return typeof fromDiff === 'string' && fromDiff ? fromDiff : undefined;
}

async function invalidateTrackEntryLists(
  qc: QueryInvalidator,
  trackId?: string | null,
): Promise<void> {
  await invalidateFeedCaches(qc);
  if (trackId) {
    await qc.invalidateQueries({ queryKey: ['track', trackId, 'entries'] });
  }
}

interface DetailRefreshes { entries: Set<string>; comments: Set<string> }

function requestCommentRefetch(entryId: string, batch?: DetailRefreshes): void {
  if (batch) batch.comments.add(entryId);
  else dispatchCommentRefetch(entryId);
}

function maybeDispatchEntryRefetch(action: string, entryId?: string, batch?: DetailRefreshes): void {
  if (!entryId) return;
  if (action === 'entry.delete' || action === 'delete_entry') return;
  if (batch) batch.entries.add(entryId);
  else dispatchEntryRefetch(entryId);
}

/** Metadata changes must refresh open pickers and saved-view schema too. */
async function invalidateConfiguration(qc: QueryInvalidator, trackId?: string): Promise<void> {
  await Promise.all([
    ...['tags', 'entryTypes', 'views', 'operationalModel', 'operational-models', 'operational-model'].map(
      root => qc.invalidateQueries({ queryKey: [root] }),
    ),
    invalidateTrackEntryLists(qc, trackId),
    invalidateDashboardData(qc),
  ]);
}

/** Invalidate list/detail caches after a ChangeEvent from the events stream. */
export async function invalidateAfterChangeEvent(
  qc: QueryInvalidator,
  evt: ActivityEvent,
  batch?: DetailRefreshes,
): Promise<void> {
  const action = evt.action;
  if (!action) return;

  if (action === 'operational_model.delete') {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['operational-models'] }),
      qc.invalidateQueries({ queryKey: ['operational-model'], refetchType: 'none' }),
    ]);
    return;
  }

  if (['tag.', 'view.', 'entry_type.', 'operational_model.'].some(prefix => action.startsWith(prefix))) {
    await invalidateConfiguration(qc, trackIdFromScope(evt.scope));
    return;
  }

  if (action === 'notification.create') {
    await qc.invalidateQueries({ queryKey: ['notifications'] });
    const after = asRecord(evt.after);
    if (after?.type === 'mention' && typeof after.entry_id === 'string') {
      requestCommentRefetch(after.entry_id, batch);
    }
    return;
  }

  if (action.startsWith('comment.')) {
    const after = asRecord(evt.after) || asRecord(evt.before);
    const entryId = typeof after?._entry_id === 'string'
      ? after._entry_id
      : undefined;
    await Promise.all([
      invalidateFeedCaches(qc),
      invalidateTrackEntryLists(qc, trackIdFromScope(evt.scope)),
    ]);
    if (entryId) requestCommentRefetch(entryId, batch);
    return;
  }

  if (action.startsWith('entry.')) {
    await Promise.all([
      invalidateTrackEntryLists(qc, trackIdFromScope(evt.scope)),
      // Aggregates may change; scope is track-scoped so refresh all open dashboards.
      invalidateDashboardData(qc),
    ]);
    maybeDispatchEntryRefetch(action, evt.resource_id, batch);
    return;
  }

  if (action === 'track.delete') {
    // The detail page is still mounted when this event arrives. Refetching
    // the deleted track 404s and toasts "Track not found" beside the success
    // toast. Mark those queries stale without a request; navigation unmounts
    // them. List caches still refresh so the parent app and track index drop
    // the row.
    const trackId = evt.resource_id ?? trackIdFromScope(evt.scope);
    await Promise.all([
      invalidateFeedCaches(qc),
      invalidateWorkspaceListCaches(qc),
      qc.invalidateQueries({ queryKey: ['tracks'] }),
      trackId
        ? qc.invalidateQueries({
            queryKey: ['track', trackId],
            refetchType: 'none',
          })
        : Promise.resolve(),
      invalidateDashboardData(qc),
    ]);
    return;
  }

  if (action.startsWith('track.')) {
    const trackId = evt.resource_id ?? trackIdFromScope(evt.scope);
    await Promise.all([
      invalidateTrackEntryLists(qc, trackId),
      invalidateWorkspaceListCaches(qc),
      qc.invalidateQueries({ queryKey: ['tracks'] }),
      trackId
        ? qc.invalidateQueries({ queryKey: ['track', trackId] })
        : Promise.resolve(),
      invalidateDashboardData(qc),
    ]);
    return;
  }

  if (action.startsWith('dashboard.')) {
    await invalidateDashboardCaches(
      qc,
      appIdFromScope(evt.scope) ?? evt.resource_id,
    );
    return;
  }

  if (action.startsWith('app.')) {
    const appId = evt.resource_id ?? appIdFromScope(evt.scope);
    await Promise.all([
      invalidateFeedCaches(qc),
      invalidateWorkspaceListCaches(qc),
      qc.invalidateQueries({ queryKey: ['apps'] }),
      invalidateDashboardCaches(qc, appId),
    ]);
  }
}

/** Reconcile a history/bulk burst once per active query, never per event. */
export async function invalidateAfterChangeEvents(qc: QueryClient, events: ActivityEvent[]): Promise<void> {
  const filters: InvalidateQueryFilters[] = [];
  const details: DetailRefreshes = { entries: new Set(), comments: new Set() };
  const collector: QueryInvalidator = {
    invalidateQueries: async filter => { filters.push(filter ?? {}); },
  };
  for (const event of events) await invalidateAfterChangeEvent(collector, event, details);
  if (!filters.length) return;
  const withheld = filters.filter(filter => filter.refetchType === 'none');
  const refresh = filters.filter(filter => filter.refetchType !== 'none');
  await qc.invalidateQueries({
    predicate: query => filters.some(filter => matchQuery(filter, query)),
    refetchType: 'none',
  });
  const refreshFilter = {
    type: 'active' as const,
    predicate: (query: import('@tanstack/react-query').Query) => refresh.some(filter => matchQuery(filter, query))
      && !withheld.some(filter => matchQuery(filter, query)),
  };
  const alreadyReading = new Set(qc.getQueryCache().findAll(refreshFilter)
    .filter(query => query.state.fetchStatus === 'fetching').map(query => query.queryHash));
  await qc.refetchQueries(refreshFilter, { cancelRefetch: false });
  if (alreadyReading.size) {
    // A read begun before this mutation may hold an older snapshot. Wait for
    // it, then make one fresh read; never cancel/restart it per event.
    await qc.refetchQueries({ ...refreshFilter,
      predicate: query => alreadyReading.has(query.queryHash) && refreshFilter.predicate(query),
    }, { cancelRefetch: false });
  }
  const deleted = new Set(events.filter(event => event.action === 'entry.delete').map(event => event.resource_id));
  for (const entryId of details.entries) if (!deleted.has(entryId)) dispatchEntryRefetch(entryId);
  for (const entryId of details.comments) if (!deleted.has(entryId)) dispatchCommentRefetch(entryId);
}

/** Invalidate caches after an agent staging write completes (bless / fallback). */
export async function invalidateAfterAgentWrite(
  qc: QueryInvalidator,
  input: { staged: StagedChange; executeResult?: unknown },
): Promise<void> {
  const { staged, executeResult } = input;
  const kind = staged.kind || String(staged.diff_machine?.op || '');

  if (kind === 'batch') {
    await Promise.all([
      invalidateConfiguration(qc), invalidateWorkspaceListCaches(qc),
      qc.invalidateQueries({ queryKey: ['apps'] }),
      qc.invalidateQueries({ queryKey: ['tracks'] }),
      invalidateDashboardCaches(qc),
    ]);
    return;
  }
  if (['create_tag', 'update_tag', 'merge_tags', 'publish_profile_draft'].includes(kind)
    || kind.startsWith('modify_operational_model.')) {
    await invalidateConfiguration(qc, trackIdFromStaged(staged, executeResult));
    return;
  }

  if (ENTRY_WRITE_KINDS.has(kind)) {
    await Promise.all([
      invalidateTrackEntryLists(qc, trackIdFromStaged(staged, executeResult)),
      // Chart/metric widgets read aggregates — refresh without waiting for poll.
      invalidateDashboardData(qc, appIdFromStaged(staged)),
    ]);
    maybeDispatchEntryRefetch(kind, entryIdFromStaged(staged, executeResult));
    return;
  }

  if (TRACK_WRITE_KINDS.has(kind)) {
    const trackId = trackIdFromStaged(staged, executeResult);
    await Promise.all([
      invalidateTrackEntryLists(qc, trackId),
      invalidateWorkspaceListCaches(qc),
      qc.invalidateQueries({ queryKey: ['tracks'] }),
      trackId
        ? qc.invalidateQueries({ queryKey: ['track', trackId] })
        : Promise.resolve(),
      invalidateDashboardData(qc, appIdFromStaged(staged)),
    ]);
    return;
  }

  if (APP_WRITE_KINDS.has(kind)) {
    const appId = appIdFromStaged(staged);
    const result = asRecord(executeResult);
    const removed = result && !result.error && result.ok !== false && result.skipped !== true && result.filed !== false
      && (result.deleted === true || result.deleted_app_id === appId
        || result.uninstalled === true || result.status === 'uninstalled');
    if (kind === 'delete_app' && appId && removed) {
      window.dispatchEvent(new CustomEvent(APP_DELETED_EVENT, { detail: { appId } }));
    }
    await Promise.all([
      invalidateFeedCaches(qc),
      invalidateWorkspaceListCaches(qc),
      qc.invalidateQueries({ queryKey: ['apps'] }),
      invalidateDashboardCaches(qc, appId),
    ]);
    return;
  }

  if (DASHBOARD_WRITE_KINDS.has(kind)) {
    await invalidateDashboardCaches(qc, appIdFromStaged(staged));
  }
}
