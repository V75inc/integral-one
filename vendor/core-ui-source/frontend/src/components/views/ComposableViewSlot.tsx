/**
 * ComposableViewSlot — Phase 3.1 Plan 03.1-04 (ANC-06).
 *
 * A thin embeddable wrapper that renders ONE saved view by key inside an
 * arbitrary host (e.g. EntryDetail.tsx's RelatedViewsSection). It fetches:
 *
 *   1. The list of saved views on the target track  (GET /api/tracks/{id}/views)
 *   2. The entries scoped to the selected view      (GET /api/entries?view_id=...)
 *
 * RESEARCH Pitfall 5 — we MUST route entries through the ``view_id`` query
 * parameter so the server-side ``View.entry_type_keys`` filter applies.
 * NEVER call ``/api/entries?track_id=...`` directly here — that would bypass
 * the filter and surface entries the view was supposed to hide.
 *
 * View widget dispatch reuses the shared ``ViewRenderer`` from
 * ``components/views/registry.tsx`` so any registered widget (feed, kanban,
 * table, calendar, gallery, composable_*) renders identically to the
 * standalone view surface.
 *
 * The ``bindings`` prop is forwarded to the widget's ``config`` namespace as
 * ``__bindings`` so resolver-driven filter rules (e.g.
 * ``{field: 'assignee', op: 'eq', value: ':current_user'}``) can pick up
 * pre-resolved template-var values from the host. Widgets that don't
 * consume bindings simply ignore the key.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { entriesApi } from '../../api';
import { useTrackViews } from '../../hooks/useTrackViews';
import { viewsForTrackQueryKey } from '../../queryKeys';
import { savedViewUsesHostedEntryList } from '../../views/savedViewEntryList';
import type {
  OperationalModelFieldSpec,
  Entry,
  EntryTypeNode,
  SavedView,
} from '../../types';
import type { EntryCreateInput, ViewWidgetProps } from '../../views/types';
import { ViewRenderer, getWidget } from './registry';

export type ComposableViewSlotProps = {
  trackId: string;
  viewKey: string;
  bindings?: Record<string, unknown>;
  /** Optional field specs forwarded to the embedded widget so relation-
   *  typed columns / template tokens can be resolved. Hosts (e.g. a
   *  RelationValue cell) inject these when the embedded view should see
   *  the same field universe as the host context. */
  fields?: OperationalModelFieldSpec[];
  entryTypes?: EntryTypeNode[];
  onEntryOpen?: ViewWidgetProps['onEntryOpen'];
  onEntryPersist?: ViewWidgetProps['onEntryPersist'];
  onEntryCreate?: ViewWidgetProps['onEntryCreate'];
  onViewUpdate?: ViewWidgetProps['onViewUpdate'];
  isEditor?: boolean;
  allowedScopes?: string[];
};

export function ComposableViewSlot({
  trackId,
  viewKey,
  bindings,
  fields,
  entryTypes,
  onEntryOpen,
  onEntryPersist,
  onEntryCreate,
  onViewUpdate,
  isEditor,
  allowedScopes,
}: ComposableViewSlotProps) {
  const queryClient = useQueryClient();
  const viewsQuery = useTrackViews(trackId);
  const views = viewsQuery.data ?? [];
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const viewsLoading = viewsQuery.isPending && views.length === 0;
  const error = viewsQuery.isError
    ? String(viewsQuery.error?.message || viewsQuery.error || 'Failed to load views')
    : null;

  // Locate the matching view by key (or by name fallback).
  //
  // The manifest ``key:`` a related_views entry references (e.g.
  // ``lines_table``) survives compilation as ``config._manifest_view_key``
  // (see operational_model_compile.py's view normalization) — NOT as a
  // top-level ``.key`` property, which SavedView never actually carries.
  // Without this check every anchored-track related_view silently fails to
  // resolve ("View \"x\" not found on this track") for any view whose name
  // doesn't happen to literally equal its manifest key.
  const view = useMemo<SavedView | undefined>(() => {
    if (!views.length) return undefined;
    return (
      views.find(
        v =>
          String(
            (v.config as { _manifest_view_key?: string } | undefined)
              ?._manifest_view_key || ''
          ) === viewKey
      ) ||
      views.find(v => (v as SavedView & { key?: string }).key === viewKey) ||
      views.find(v => (v.type || '').toLowerCase() === viewKey.toLowerCase()) ||
      views.find(v => (v.name || '').toLowerCase() === viewKey.toLowerCase())
    );
  }, [views, viewKey]);

  // Load entries once we know the view id — RESEARCH Pitfall 5: route via
  // ``view_id`` so the server-side entry_type_keys filter is honored.
  useEffect(() => {
    if (!view || !savedViewUsesHostedEntryList(view)) {
      setEntries([]);
      setEntriesLoading(false);
      return;
    }
    let cancelled = false;
    setEntriesLoading(true);
    entriesApi
      .list({ track_id: trackId, view_id: view.id, limit: 200 })
      .then((es: Entry[]) => {
        if (cancelled) return;
        setEntries(es);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setEntriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, view?.id, view?.type]);

  const handleEntryOpen = onEntryOpen ?? (() => {});

  const handleEntryPersist = useCallback(
    async (entry: Entry) => {
      if (!onEntryPersist) return;
      const updated = await onEntryPersist(entry);
      const merged = (updated || entry) as Entry;
      setEntries(prev => prev.map(e => (e.id === merged.id ? merged : e)));
      return merged;
    },
    [onEntryPersist]
  );

  const handleEntryCreate = useCallback(
    async (input: EntryCreateInput) => {
      if (!onEntryCreate) return;
      const created = await onEntryCreate({ ...input, track_id: trackId });
      if (created) {
        setEntries(prev => [...prev.filter(e => e.id !== created.id), created]);
      }
      return created;
    },
    [onEntryCreate, trackId]
  );

  const handleViewUpdate = useCallback(
    (next: SavedView) => {
      onViewUpdate?.(next);
      queryClient.setQueryData<SavedView[]>(
        viewsForTrackQueryKey(trackId),
        prev => (prev ? prev.map(v => (v.id === next.id ? next : v)) : prev)
      );
    },
    [onViewUpdate, queryClient, trackId]
  );

  if (viewsLoading) {
    return (
      <div
        data-testid="composable-view-slot-loading"
        className="h-12 bg-[var(--panel-2)] rounded-[var(--radius-input)] animate-pulse"
      />
    );
  }
  if (error) {
    return (
      <div
        data-testid="composable-view-slot-error"
        className="text-sm text-[var(--text-subtle)]"
      >
        Failed to load related view.
      </div>
    );
  }
  if (!view) {
    return (
      <div
        data-testid="composable-view-slot-missing"
        className="text-sm text-[var(--text-subtle)]"
      >
        View &quot;{viewKey}&quot; not found on this track.
      </div>
    );
  }

  if (allowedScopes) {
    const widgetScope = getWidget(view.type)?.scope ?? 'track';
    if (!allowedScopes.includes(widgetScope)) {
      return (
        <div
          data-testid="composable-view-slot-scope-rejected"
          className="text-sm text-[var(--text-subtle)]"
        >
          View &quot;{viewKey}&quot; (type &quot;{view.type}&quot;) is
          track-scoped and cannot render here.
        </div>
      );
    }
  }

  // Forward ``bindings`` via the view config so widgets that opt-in to
  // template-var resolution can pick up pre-resolved values.
  //
  // Also override ``track_id`` with the resolved ``trackId`` prop this slot
  // was actually fetched against. Template-sourced views (is_template: true
  // — every view reached via ``:anchored_track/...``) always carry an empty
  // ``track_id`` on the raw View record, since one template view is shared
  // across every Track anchored from it. A widget that creates/mutates
  // entries directly (e.g. EditableTableWidget's "+ Add row") needs a real
  // track id to pass to the entries API, not the template's empty one —
  // without this override, entry-create silently 403s (no track = no
  // resolvable permission).
  const viewWithBindings: SavedView = {
    ...view,
    track_id: trackId,
    ...(bindings
      ? { config: { ...(view.config || {}), __bindings: bindings } }
      : null),
  } as SavedView;

  return (
    <div data-testid="composable-view-slot">
      <ViewRenderer
        view={viewWithBindings}
        entries={entries}
        isLoading={entriesLoading}
        onEntryOpen={handleEntryOpen}
        onEntryPersist={onEntryPersist ? handleEntryPersist : undefined}
        onEntryCreate={onEntryCreate ? handleEntryCreate : undefined}
        onViewUpdate={onViewUpdate ? handleViewUpdate : undefined}
        isEditor={isEditor}
        fields={fields}
        entryTypes={entryTypes}
      />
    </div>
  );
}
