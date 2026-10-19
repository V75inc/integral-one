import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { entriesApi } from '../api';
import { EntryDetail } from '../components/entries/EntryDetail';
import { usePublishPageContext } from '../hooks/usePublishPageContext';
import { trackPath } from '../utils/resourcePaths';
import type { Entry } from '../types';
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

  if (!entry) {
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
