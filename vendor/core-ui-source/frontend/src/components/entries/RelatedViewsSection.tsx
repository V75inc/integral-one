/**
 * RelatedViewsSection — Phase 3.1 Plan 03.1-04 (ANC-06).
 *
 * Renders inline related-view widgets declared on an entry type's
 * ``related_views`` manifest slot. Each declaration has a ``view`` reference
 * and an optional ``bind`` map. Two forms of ``view`` reference:
 *
 *   - bare view key (e.g. ``"board"``) — looks up the view inside the
 *     CURRENT entry's track CP
 *   - resolver-prefixed (e.g. ``":anchored_track/board"``) — tokenize at
 *     the first ``/``; the prefix MUST be a registered template-var
 *     resolver token (see ``views/composable/templateVarResolvers.ts``);
 *     the resolver returns a track id; the suffix is the view key looked
 *     up within THAT track's CP.
 *
 * Routing through ``ComposableViewSlot`` ensures the server-side
 * ``View.entry_type_keys`` filter (RESEARCH Pitfall 5) is honored — we
 * never bypass the ``view_id`` query parameter on the entries endpoint.
 *
 * Fail-soft: if a resolver returns ``null`` (e.g. ``:anchored_track`` on
 * an entry with no ANCHORS edge), the slot is silently skipped. If the
 * entry type has no related_views or it is empty, nothing renders.
 *
 * Cross-slot refresh: an ``action_bar`` button runs a tool as a side
 * effect entirely outside the normal entry-mutation callbacks (it calls
 * ``toolsApi.call`` directly, not ``entriesApi.update``) — so a sibling
 * slot on the SAME page (e.g. a payslip list next to the "Generate
 * Payslips" button that created those very payslips) had no way to learn
 * a tool run just changed the data underneath it, and kept showing
 * whatever it fetched on mount until the whole page was reopened. Every
 * slot below shares one ``refreshNonce``, forwarded via ``bindings`` (the
 * same ``__bindings`` namespace every self-fetching widget already reads
 * off ``config.__bindings``) as ``__refreshKey`` (a plain number a fetch
 * effect can depend on) and ``onActionComplete`` (bumps it — read only by
 * ``ActionBarWidget``, ignored by every other widget). No new prop
 * pipeline through ``ViewRenderer``/``ViewWidgetProps`` — reuses the
 * bindings channel that already flows to every related-view slot.
 */

import { useCallback, useState } from 'react';
import { resolveTemplateVar } from '../views/composable/templateVarResolvers';
import { ComposableViewSlot } from '../views/ComposableViewSlot';
import { Text } from '../../ui/Text';
import type { OperationalModelFieldSpec, EntryTypeNode, RelatedViewSpec } from '../../types';
import type { ViewWidgetProps } from '../../views/types';

export type RelatedViewsSectionProps = {
  entry: { id: string; custom_fields?: Record<string, unknown> };
  entryTypeSpec: { related_views?: RelatedViewSpec[] } | null | undefined;
  user: { id: string };
  currentTrackId: string;
  /**
   * Pre-resolved id of the Track reached via the entry's ANCHORS edge
   * (Plan 03.1-01 + 03.1-02). EntryDetail.tsx derives this from the
   * entry's relation-field values for fields with ``target='track'``
   * before passing it in. Undefined when the entry has no anchor edge.
   */
  anchoredTrackId?: string;
  fields?: OperationalModelFieldSpec[];
  entryTypes?: EntryTypeNode[];
  onEntryOpen?: ViewWidgetProps['onEntryOpen'];
  onEntryPersist?: ViewWidgetProps['onEntryPersist'];
  onEntryCreate?: ViewWidgetProps['onEntryCreate'];
  onViewUpdate?: ViewWidgetProps['onViewUpdate'];
  isEditor?: boolean;
  /**
   * Owning app id. Extension views embedded here have no ``track`` prop, so
   * they cannot read ``track.app.id`` unless the host forwards it.
   */
  appId?: string;
  /**
   * Section heading. Default ``Related`` for the secondary column.
   * Pass ``null`` for primary modal/detail content (no "Related" label).
   */
  heading?: string | null;
  /** Override ``data-testid`` (default ``related-views-section``). */
  testId?: string;
};

/** Split related_views into primary (modal/detail main column) vs related. */
export function splitRelatedViewsByPosition(
  relatedViews: RelatedViewSpec[] | undefined | null
): { primary: RelatedViewSpec[]; related: RelatedViewSpec[] } {
  const all = relatedViews ?? [];
  return {
    primary: all.filter(rv => rv.position === 'primary'),
    related: all.filter(rv => rv.position !== 'primary'),
  };
}

export function RelatedViewsSection({
  entry,
  entryTypeSpec,
  user,
  currentTrackId,
  anchoredTrackId,
  fields,
  entryTypes,
  onEntryOpen,
  onEntryPersist,
  onEntryCreate,
  onViewUpdate,
  isEditor,
  appId,
  heading = 'Related',
  testId = 'related-views-section',
}: RelatedViewsSectionProps) {
  const relatedViews: RelatedViewSpec[] = entryTypeSpec?.related_views ?? [];
  const [refreshNonce, setRefreshNonce] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshNonce(n => n + 1), []);

  if (!relatedViews.length) {
    return null;
  }

  const resolverContext = {
    userId: user.id,
    entryId: entry.id,
    anchoredTrackId,
  };

  // Build the slot specs first so we can short-circuit completely when every
  // entry resolved to null (no anchored track yet → section stays empty).
  const slotSpecs = relatedViews
    .map((rv, idx) => {
      const slashIdx = rv.view.indexOf('/');
      let resolvedTrackId: string = currentTrackId;
      let viewKey: string = rv.view;
      const isResolverRef = rv.view.startsWith(':') && slashIdx > 0;
      if (isResolverRef) {
        const resolverToken = rv.view.slice(0, slashIdx);
        viewKey = rv.view.slice(slashIdx + 1);
        const resolved = resolveTemplateVar(resolverToken, resolverContext);
        if (!resolved) {
          return null;
        }
        resolvedTrackId = resolved;
      }
      return {
        key: `${rv.view}-${idx}`,
        trackId: resolvedTrackId,
        viewKey,
        // A resolver-prefixed reference (e.g. `:anchored_track/view_key`)
        // resolves to a DIFFERENT, real track and renders that track's own
        // view exactly as if you'd opened it directly — track-scoped is
        // correct there, same as the backend's own
        // `_validate_related_view_scope_placement` (operational_model_compile.py)
        // already skips this exact case. Only a bare, same-tier view key
        // (this entry's own related_views registry) gets the entry-scope
        // restriction — that's the case a track-only widget could actually
        // be smuggled into with no track to act against.
        allowedScopes: isResolverRef
          ? undefined
          : (['entry', 'both'] as Array<'track' | 'entry' | 'both'>),
        bindings: {
          ...rv.bind,
          currentUser: user.id,
          entryId: entry.id,
          ...(appId ? { appId } : {}),
          // Live custom_fields of the host entry — e.g. ActionBarWidget
          // reads `entryValues.status` to evaluate a button's `disabled_if`
          // (a Pay Run's "Finalize" button graying out once status is
          // "paid", matching its own confirm_message's promise). Not a new
          // prop pipeline: same `__bindings` namespace every self-fetching
          // widget already reads off `config.__bindings`.
          entryValues: entry.custom_fields,
          __refreshKey: refreshNonce,
          onActionComplete: bumpRefresh,
        },
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (!slotSpecs.length) {
    return null;
  }

  return (
    <section
      className="related-views mt-6"
      data-testid={testId}
    >
      {heading ? (
        <Text
          variant="meta"
          tone="subtle"
          weight="medium"
          as="h3"
          className="uppercase tracking-[0.08em] mb-3"
        >
          {heading}
        </Text>
      ) : null}
      <div className="space-y-4">
        {slotSpecs.map(spec => (
          <ComposableViewSlot
            key={spec.key}
            trackId={spec.trackId}
            viewKey={spec.viewKey}
            bindings={spec.bindings}
            fields={fields}
            entryTypes={entryTypes}
            onEntryOpen={onEntryOpen}
            onEntryPersist={onEntryPersist}
            onEntryCreate={onEntryCreate}
            onViewUpdate={onViewUpdate}
            isEditor={isEditor}
          />
        ))}
      </div>
    </section>
  );
}
