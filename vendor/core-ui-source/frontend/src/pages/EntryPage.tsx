import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { entriesApi, tracksApi } from '../api';
import { useScopeOptional } from '../context/ScopeContext';
import { useSetCrumbs } from '../context/CrumbsContext';
import { useWorkspaceCrumbPrefix } from '../hooks/useWorkspaceCrumbPrefix';
import { buildTrackBreadcrumbs } from '../utils/buildTrackBreadcrumbs';
import { EntryDetail } from '../components/entries/EntryDetail';
import { usePublishPageContext } from '../hooks/usePublishPageContext';
import { trackPath } from '../utils/resourcePaths';
import type { Entry, Track } from '../types';
import { Surface, Text } from '../ui';

/**
 * Full-page entry view — the route entry types opt into via
 * `form_schema.open_as_page: true` navigate to instead of the default
 * track-modal overlay (see TrackDetailPage.tsx's `handleEntryOpen`).
 * Thin wrapper: fetches the entry, then renders the SAME EntryDetail every
 * other app already uses, just with `variant="page"` swapping Modal for
 * EntryDetailPageChrome. "Closing" a page means navigating back to the
 * entry's track, not unmounting an overlay.
 */
export function EntryPage() {
  const { entryId } = useParams<{ entryId: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The workspace the entry lives in ('' when it could not be read). Files,
  // comments and related records are read under the active workspace scope, so
  // a link opened from another workspace must switch scope first; otherwise the
  // entry loads but its files are refused and the page shows "No file yet".
  const [entryWorkspaceId, setEntryWorkspaceId] = useState<string | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const scopeCtx = useScopeOptional();
  const scope = scopeCtx?.scope ?? null;
  const setScope = scopeCtx?.setScope;

  useEffect(() => {
    if (!entry?.track_id) return;
    let cancelled = false;
    setEntryWorkspaceId(null);
    tracksApi
      .get(entry.track_id)
      .then(t => {
        if (cancelled) return;
        setTrack(t);
        setEntryWorkspaceId(t.app?.workspace_id || t.workspace_id || '');
      })
      .catch(() => {
        if (!cancelled) setEntryWorkspaceId('');
      });
    return () => {
      cancelled = true;
    };
  }, [entry?.track_id]);

  // Home › Workspace › App › Track › this entry, the same trail the track page shows,
  // instead of the bare "Entries" the URL alone gives.
  const workspaceCrumbs = useWorkspaceCrumbPrefix(entryWorkspaceId || null);
  useSetCrumbs(
    track
      ? [...workspaceCrumbs, ...buildTrackBreadcrumbs(track, { entryTitle: entry?.title || null })]
      : []
  );

  useEffect(() => {
    if (setScope && entryWorkspaceId && scope?.workspaceId !== entryWorkspaceId) {
      setScope({ workspaceId: entryWorkspaceId });
    }
  }, [entryWorkspaceId, scope?.workspaceId, setScope]);

  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    setEntry(null);
    setError(null);
    entriesApi
      .get(entryId)
      .then(e => {
        if (!cancelled) setEntry(e);
      })
      .catch(() => {
        if (!cancelled) setError('Entry not found or you no longer have access.');
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  // Tell the assistant which entry is open, so "improve this document" means this one.
  // Titles and ids only (never the body); the assistant reads the body itself.
  usePublishPageContext(
    entry
      ? {
          pageKind: 'entry_page',
          focusedEntryId: entry.id,
          focusedTrackId: entry.track_id,
          metadata: { entry_title: entry.title || undefined, entry_type: entry.type || undefined },
        }
      : null,
  );

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Text variant="body-sm" tone="muted" as="p">{error}</Text>
      </div>
    );
  }

  // Without a scope provider (embedded or in tests) there is nothing to switch.
  const scopeReady =
    !scopeCtx ||
    entryWorkspaceId === '' ||
    (!!entryWorkspaceId && scope?.workspaceId === entryWorkspaceId);
  if (!entry || !scopeReady) {
    return (
      <div className="min-h-screen">
        <Surface tone="panel" border="default" className="h-14" />
        <div className="mx-auto max-w-page px-4 sm:px-6 md:px-10 py-4 sm:py-5">
          <Surface tone="panel-2" radius="input" className="h-40 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <EntryDetail
      key={entry.id}
      entry={entry}
      variant="page"
      onClose={() => navigate(trackPath(entry.track_id))}
      onUpdate={setEntry}
      // This page has no list cache to patch, so return to the track after
      // deleting the entry.
      onDelete={() => navigate(trackPath(entry.track_id))}
    />
  );
}
