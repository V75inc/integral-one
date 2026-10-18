import type { QueryClient } from '@tanstack/react-query';
import {
  invalidateFeedCaches,
  invalidateWorkspaceListCaches,
} from '../queryKeys';
import { extractConsumedNav } from '../features/ai-chat/staging/consumedSummary';
import type { StagedChange } from '../features/ai-chat/staging/types';
import type { ActivityEvent } from '../utils/changeEvent';

export const ENTRY_REFETCH_EVENT = 'integral:entry-refetch';
export const COMMENT_REFETCH_EVENT = 'integral:comment-refetch';

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
  qc: QueryClient,
  appId?: string | null,
): Promise<void> {
  if (appId) {
    await qc.invalidateQueries({ queryKey: ['dashboard-data', appId] });
  } else {
    await qc.invalidateQueries({ queryKey: ['dashboard-data'] });
  }
}

/** Refresh dashboard layout list + aggregates for an app (or all apps). */
async function invalidateDashboardCaches(
  qc: QueryClient,
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
  qc: QueryClient,
  trackId?: string | null,
): Promise<void> {
  await invalidateFeedCaches(qc);
  if (trackId) {
    await qc.invalidateQueries({ queryKey: ['track', trackId, 'entries'] });
  }
}

function maybeDispatchEntryRefetch(action: string, entryId?: string): void {
  if (!entryId) return;
  if (action === 'entry.delete' || action === 'delete_entry') return;
  dispatchEntryRefetch(entryId);
}

/** Invalidate list/detail caches after a ChangeEvent from the events stream. */
export async function invalidateAfterChangeEvent(
  qc: QueryClient,
  evt: ActivityEvent,
): Promise<void> {
  const action = evt.action;
  if (!action) return;

  if (action === 'notification.create') {
    await qc.invalidateQueries({ queryKey: ['notifications'] });
    const after = asRecord(evt.after);
    if (after?.type === 'mention' && typeof after.entry_id === 'string') {
      dispatchCommentRefetch(after.entry_id);
    }
    return;
  }

  if (action === 'comment.create') {
    const after = asRecord(evt.after);
    const entryId = typeof after?._entry_id === 'string'
      ? after._entry_id
      : undefined;
    await Promise.all([
      invalidateFeedCaches(qc),
      invalidateTrackEntryLists(qc, trackIdFromScope(evt.scope)),
    ]);
    if (entryId) dispatchCommentRefetch(entryId);
    return;
  }

  if (action.startsWith('entry.')) {
    await Promise.all([
      invalidateTrackEntryLists(qc, trackIdFromScope(evt.scope)),
      // Aggregates may change; scope is track-scoped so refresh all open dashboards.
      invalidateDashboardData(qc),
    ]);
    maybeDispatchEntryRefetch(action, evt.resource_id);
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

/** Invalidate caches after an agent staging write completes (bless / fallback). */
export async function invalidateAfterAgentWrite(
  qc: QueryClient,
  input: { staged: StagedChange; executeResult?: unknown },
): Promise<void> {
  const { staged, executeResult } = input;
  const kind = staged.kind || String(staged.diff_machine?.op || '');

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
