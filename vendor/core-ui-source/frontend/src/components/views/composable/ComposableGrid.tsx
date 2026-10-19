/**
 * Composable grid meta-widget — card grid driven by ``view.config``:
 * group_by, color_by, projection (fields shown on each card), card_layout
 * ("compact" | "comfortable" | "roomy").
 */

import { useMemo } from 'react';
import { EntryCard } from '../../entries/EntryCard';
import { EmptyState } from '../../ui';
import { RelationValue } from '../../entries/relations';
import type { ViewWidgetProps } from '../types';
import type { OperationalModelFieldSpec } from '../../../types';
import { Text } from '../../../ui';
import {
  applyFilters,
  applySort,
  colorFromValue,
  groupByField,
  readConfigArray,
  readConfigString,
  readEntryField,
  resolverContextFromBindings,
  ungroupedLabel,
} from './utils';

function ComposableGridInner({
  entries,
  view,
  fields,
  isLoading,
  onEntryOpen,
  onEntryDelete,
  onEntryEdit,
  emptyState,
  track,
  publicPermissions,
  publicToken,
}: ViewWidgetProps) {
  const config = view.config || {};
  const relationByKey = useMemo(() => {
    const out: Record<string, NonNullable<OperationalModelFieldSpec['relation']>> = {};
    for (const f of fields ?? []) {
      if (String(f.type || '').toLowerCase() === 'relation' && f.relation) {
        out[f.key] = f.relation;
      }
    }
    return out;
  }, [fields]);
  const groupBy = readConfigString(config, 'group_by');
  const colorBy = readConfigString(config, 'color_by');
  const projection = readConfigArray<string>(config, 'projection');
  const cardLayout = readConfigString(config, 'card_layout') || 'comfortable';
  const sortRules = readConfigArray<{ field: string; direction?: 'asc' | 'desc' }>(
    config,
    'sort'
  );
  const filterRules = readConfigArray<{
    field: string;
    op?: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'lt';
    value?: unknown;
  }>((config.filter as Record<string, unknown>) || {}, 'rules');

  const filtered = applyFilters(entries, filterRules, resolverContextFromBindings(config));
  const sorted = applySort(filtered, sortRules);

  if (isLoading && entries.length === 0) {
    return <Text variant="body" tone="muted" as="p">Loading…</Text>;
  }
  if (!sorted.length) {
    return (
      emptyState || (
        <div className="app-card">
          <EmptyState title="No entries match this view" />
        </div>
      )
    );
  }

  const groups = groupByField(sorted, groupBy);
  const gridCols =
    cardLayout === 'compact'
      ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
      : cardLayout === 'roomy'
        ? 'grid-cols-1 md:grid-cols-2'
        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([key, items]) => (
        <section key={key || '__ungrouped__'}>
          {groupBy ? (
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {key || ungroupedLabel()} <span className="opacity-60">({items.length})</span>
            </h3>
          ) : null}
          <div className={`grid gap-3 ${gridCols}`}>
            {items.map((entry) => {
              const accent = colorBy
                ? colorFromValue(readEntryField(entry, colorBy))
                : null;
              return (
                <div
                  key={entry.id}
                  className="rounded-md border border-[var(--panel-border)] bg-[var(--panel)]"
                  style={
                    accent ? { borderTop: `3px solid ${accent}` } : undefined
                  }
                >
                  <EntryCard
                    entry={entry}
                    showTrackChip={false}
                    track={track}
                    onOpen={(e, opts) => onEntryOpen(e, opts)}
                    onDelete={onEntryDelete}
                    onEdit={onEntryEdit}
                    publicMode={!!publicPermissions}
                    hideComments={publicPermissions ? !publicPermissions.read_comments : false}
                    publicToken={publicToken}
                    publicPermissions={publicPermissions}
                  />
                  {projection.length ? (
                    <div className="flex flex-wrap gap-1.5 px-3 pb-2 text-[11px] text-[var(--text-muted)]">
                      {projection.map((field) => {
                        const value = readEntryField(entry, field);
                        if (value == null || value === '') return null;
                        const relation = relationByKey[field];
                        return (
                          <span
                            key={field}
                            className="rounded-full bg-[var(--panel-2)] px-2 py-0.5"
                            title={field}
                          >
                            {field}:{' '}
                            {relation ? (
                              <RelationValue
                                value={value}
                                relation={relation}
                                variant="inline"
                                stopPropagation
                              />
                            ) : (
                              String(value)
                            )}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export const ComposableGrid = ComposableGridInner;
