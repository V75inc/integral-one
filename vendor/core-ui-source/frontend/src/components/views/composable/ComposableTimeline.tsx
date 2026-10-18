/**
 * Composable timeline meta-widget — entries placed on a vertical day-axis
 * via ``view.config.date_field`` (and optionally ``end_date_field``).
 * Optional grouping/coloring via ``group_by`` / ``color_by``.
 *
 * Renders a simple month-grouped vertical chronology — visually less rich
 * than a Gantt chart but covers most "show me X over time" agent
 * requests without requiring a custom widget.
 */

import { EntryCard } from '../../entries/EntryCard';
import { EmptyState } from '../../ui';
import type { ViewWidgetProps } from '../types';
import type { Entry } from '../../../types';
import { Text } from '../../../ui';
import {
  applyFilters,
  colorFromValue,
  readConfigArray,
  readConfigString,
  readEntryField,
  resolverContextFromBindings,
} from './utils';

function _parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function _monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _monthLabel(d: Date): string {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function ComposableTimelineInner({
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
  const dateField = readConfigString(config, 'date_field') || 'created_at';
  const colorBy = readConfigString(config, 'color_by');
  const filterRules = readConfigArray<{
    field: string;
    op?: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'lt';
    value?: unknown;
  }>((config.filter as Record<string, unknown>) || {}, 'rules');

  const filtered = applyFilters(entries, filterRules, resolverContextFromBindings(config));

  // Sort by the date field ascending so the chronology reads top-down.
  const sorted = [...filtered].sort((a: Entry, b: Entry) => {
    const ad = _parseDate(readEntryField(a, dateField));
    const bd = _parseDate(readEntryField(b, dateField));
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return ad.getTime() - bd.getTime();
  });

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

  const months = new Map<string, { label: string; entries: Entry[] }>();
  for (const entry of sorted) {
    const d = _parseDate(readEntryField(entry, dateField));
    if (!d) continue;
    const key = _monthKey(d);
    if (!months.has(key)) {
      months.set(key, { label: _monthLabel(d), entries: [] });
    }
    months.get(key)!.entries.push(entry);
  }

  return (
    <div className="space-y-6">
      {Array.from(months.entries()).map(([key, group]) => (
        <section key={key} className="relative">
          <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {group.label}
          </h3>
          <ol className="relative space-y-3 border-l border-[var(--panel-border)] pl-4">
            {group.entries.map((entry) => {
              const accent = colorBy
                ? colorFromValue(readEntryField(entry, colorBy))
                : null;
              const d = _parseDate(readEntryField(entry, dateField));
              return (
                <li key={entry.id} className="relative">
                  <span
                    className="absolute -left-[22px] top-3 inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: accent || 'var(--panel-border)' }}
                    aria-hidden
                  />
                  <div
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
                    {d ? (
                      <p className="px-3 pb-2 text-[11px] text-[var(--text-muted)]">
                        {d.toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

export const ComposableTimeline = ComposableTimelineInner;
