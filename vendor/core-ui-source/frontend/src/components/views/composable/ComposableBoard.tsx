/**
 * Composable board meta-widget — a kanban-style column board driven
 * entirely by ``view.config`` (group_by / color_by / sort_within_column /
 * swimlanes). Most "show me a board of X by Y" agent requests resolve to
 * this widget without writing new code.
 */

import { EntryCard } from '../../entries/EntryCard';
import { EmptyState } from '../../ui';
import type { ViewWidgetProps } from '../types';
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

function ComposableBoardInner({
  entries,
  view,
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
  const groupBy = readConfigString(config, 'group_by') || 'status';
  const colorBy = readConfigString(config, 'color_by');
  const swimlanes = readConfigString(config, 'swimlanes');
  const sortWithinColumn = readConfigArray<{
    field: string;
    direction?: 'asc' | 'desc';
  }>(config, 'sort_within_column');
  const filterRules = readConfigArray<{
    field: string;
    op?: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'lt';
    value?: unknown;
  }>((config.filter as Record<string, unknown>) || {}, 'rules');

  const filtered = applyFilters(entries, filterRules, resolverContextFromBindings(config));

  if (isLoading && entries.length === 0) {
    return <Text variant="body" tone="muted" as="p">Loading…</Text>;
  }
  if (!filtered.length) {
    return (
      emptyState || (
        <div className="app-card">
          <EmptyState title="No entries match this view" />
        </div>
      )
    );
  }

  // Swimlane outer grouping (optional). When unset, render a single lane.
  const lanes = groupByField(filtered, swimlanes);

  return (
    <div className="space-y-6 overflow-x-auto">
      {Array.from(lanes.entries()).map(([laneKey, laneEntries]) => {
        const columns = groupByField(applySort(laneEntries, sortWithinColumn), groupBy);
        return (
          <div key={laneKey || '__no_swimlane__'} className="space-y-2">
            {swimlanes ? (
              <h3 className="text-[12px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {laneKey || ungroupedLabel()}
              </h3>
            ) : null}
            <div className="flex gap-3 min-w-min">
              {Array.from(columns.entries()).map(([colKey, colEntries]) => (
                <div
                  key={colKey || '__ungrouped__'}
                  className="flex-shrink-0 w-72 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-2)]/30 p-2"
                >
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      {colKey || ungroupedLabel()}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] opacity-70">
                      {colEntries.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {colEntries.map((entry) => {
                      const accent = colorBy
                        ? colorFromValue(readEntryField(entry, colorBy))
                        : null;
                      return (
                        <div
                          key={entry.id}
                          className="rounded-md border border-[var(--panel-border)] bg-[var(--panel)]"
                          style={
                            accent
                              ? { borderLeft: `3px solid ${accent}` }
                              : undefined
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const ComposableBoard = ComposableBoardInner;
