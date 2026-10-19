/**
 * ``reverse_relation_list`` region — read-only list of entries elsewhere
 * that reference the current (bound host) entry via a ``relation`` field —
 * e.g. every Payslip whose ``pay_run`` field points at this Pay Run.
 *
 * Unlike every other related-view mechanism in this codebase
 * (``:anchored_track/<view>`` — forward-only, an entry's own auto-
 * provisioned child track), this needs no anchor-track relationship and
 * works across independent, non-anchored tracks (same-app or cross-app):
 * it fetches directly from the generic reverse-relation surface
 * (``GET /entries/{id}/related?relation=<field_key>``, walking inbound
 * ``REFERENCES`` edges scoped by ``field_key``) rather than through
 * ``ComposableViewSlot``'s track+view-key pipeline — so, like
 * ``FormRegionWidget``'s self-fetch mode and ``ChartRegionWidget``'s
 * ``source: 'self'`` mode, it deliberately ignores the ``entries`` prop
 * ``ComposableViewSlot``/``ViewRenderer`` would otherwise pass (that prop
 * is scoped to the CURRENT track — e.g. sibling Pay Runs — not the related
 * track this region actually wants).
 *
 * Config: ``{relation: string, title?: string, entry_type?: string,
 * entry_types?: string[]}`` —
 * bound via ``config.__bindings.entryId`` (the host entry id), same
 * namespace every other bindings-aware widget reads from. ``entry_type``
 * narrows to source Entries of one EntryType (matched by slugified name)
 * — needed whenever more than one entry type shares the same relation
 * field key back to this host (e.g. Payroll's Compensation Record,
 * Payslip, and Pay Run Line all have their own ``employee`` field; an
 * Employee's "Payslips" region sets ``entry_type: payslip`` so it doesn't
 * also pull in Compensation Records).
 */

import { useEffect, useState } from 'react';
import { entriesApi } from '../../api';
import { EntryCard } from '../entries/EntryCard';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui';
import { Text } from '../../ui';
import type { ViewWidgetProps } from './types';
import type { Entry } from '../../types';

/** One page at a time — matches the size every other paginated list in the
 *  app defaults to (audit log, track entries). */
const PAGE_SIZE = 25;

export function ReverseRelationListWidget({
  view,
  onEntryOpen,
  onEntryDelete,
  onEntryEdit,
  track,
  publicPermissions,
  publicToken,
}: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const hostEntryId = typeof bindings.entryId === 'string' ? bindings.entryId : undefined;
  const relation = typeof config.relation === 'string' ? config.relation : '';
  const title = typeof config.title === 'string' ? config.title : undefined;
  const entryType = typeof config.entry_type === 'string' ? config.entry_type : undefined;
  const entryTypes = Array.isArray(config.entry_types)
    ? config.entry_types.map(String).filter(Boolean)
    : undefined;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!hostEntryId || !relation) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    entriesApi
      .listRelated(hostEntryId, relation, { limit: PAGE_SIZE, entryType, entryTypes })
      .then(res => {
        if (cancelled) return;
        setEntries(Array.isArray(res?.entries) ? res.entries : []);
        setCursor(res?.nextCursor ?? null);
        setHasMore(Boolean(res?.hasMore));
      })
      .catch(e => {
        if (!cancelled) setError(String(e?.message || e || 'Failed to load related records'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bindings is a
    // fresh object every render; only its __refreshKey member should
    // re-trigger this fetch (see RelatedViewsSection.tsx's docstring on
    // the shared refresh-nonce convention — e.g. clicking "Generate
    // Payslips" should refresh this list without a full page reopen).
  }, [hostEntryId, relation, entryType, entryTypes?.join('|'), bindings.__refreshKey]);

  if (loading) {
    return <Text variant="body" tone="muted" as="p">Loading…</Text>;
  }
  if (error) {
    return (
      <Text variant="body" tone="muted" as="p">
        Failed to load related records.
      </Text>
    );
  }

  const loadMore = () => {
    if (!hostEntryId || !relation || !cursor || loadingMore) return;
    setLoadingMore(true);
    entriesApi
      .listRelated(hostEntryId, relation, { limit: PAGE_SIZE, cursor, entryType, entryTypes })
      .then(res => {
        const more = Array.isArray(res?.entries) ? res.entries : [];
        setEntries(prev => [...prev, ...more]);
        setCursor(res?.nextCursor ?? null);
        setHasMore(Boolean(res?.hasMore));
      })
      .catch(e => setError(String(e?.message || e || 'Failed to load more')))
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="space-y-3">
      {title ? (
        <Text
          as="h3"
          variant="meta"
          weight="semibold"
          tone="muted"
          className="block uppercase tracking-wide"
        >
          {title}{' '}
          <span className="opacity-60">
            ({entries.length}
            {hasMore ? '+' : ''})
          </span>
        </Text>
      ) : null}
      {entries.length === 0 ? (
        <div className="app-card">
          <EmptyState title="No related records yet" />
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              showTrackChip
              track={track}
              onOpen={(e, opts) => onEntryOpen(e, opts)}
              onDelete={onEntryDelete}
              onEdit={onEntryEdit}
              publicMode={!!publicPermissions}
              hideComments={publicPermissions ? !publicPermissions.read_comments : false}
              publicToken={publicToken}
              publicPermissions={publicPermissions}
            />
          ))}
          {hasMore ? (
            <div className="pt-1">
              <Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
