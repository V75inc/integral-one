/**
 * Composable list meta-widget (Pillar 4 of the agent-authorable substrate).
 *
 * Generic, declarative list driven entirely by ``view.config``:
 *   - ``group_by``  — field key whose values become section headers
 *   - ``sort``      — array of ``{ field, direction }`` rules
 *   - ``filter``    — single object ``{ rules: [{field, op, value}, ...] }``
 *   - ``projection``— array of field keys to surface as inline metadata
 *   - ``density``   — "compact" | "comfortable" | "roomy"
 *
 * Most "I want a list of X grouped by Y" agent requests resolve to this
 * widget without writing new code.
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
  groupByField,
  readConfigArray,
  readConfigString,
  readEntryField,
  resolverContextFromBindings,
  ungroupedLabel,
} from './utils';

function ComposableListInner({
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
  const projection = readConfigArray<string>(config, 'projection');
  const sortRules = readConfigArray<{ field: string; direction?: 'asc' | 'desc' }>(
    config,
    'sort'
  );
  const filterRules = readConfigArray<{
    field: string;
    op?: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'lt';
    value?: unknown;
  }>((config.filter as Record<string, unknown>) || {}, 'rules');
  const density = readConfigString(config, 'density') || 'comfortable';

  const filtered = applyFilters(entries, filterRules, resolverContextFromBindings(config));
  const sorted = applySort(filtered, sortRules);
  const groups = groupByField(sorted, groupBy);

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

  const spacing =
    density === 'compact' ? 'space-y-1' : density === 'roomy' ? 'space-y-6' : 'space-y-3';

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([key, items]) => (
        <section key={key || '__ungrouped__'}>
          {groupBy ? (
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {key || ungroupedLabel()} <span className="opacity-60">({items.length})</span>
            </h3>
          ) : null}
          <div className={spacing}>
            {items.map((entry) => (
              <div key={entry.id} className="space-y-1">
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
                  <div className="flex flex-wrap gap-2 px-3 text-[11px] text-[var(--text-muted)]">
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
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export const ComposableList = ComposableListInner;
