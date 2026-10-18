/**
 * ``grouped-list/by-relation`` — a track's entries grouped by any field.
 * Generic and app-agnostic — any operational-model manifest can use this, not
 * just Payroll's (see ``backend/app/plugins/grouped_list/__init__.py``'s
 * module docstring for why this is its own widget rather than an extension
 * of ``ComposableList``'s existing ``group_by``). First used to group
 * Compensation Records / Payslips by their ``employee`` relation field.
 *
 * Two render modes, both keyed off the same grouping:
 *   - ``mode: "sections"`` (default) — every group's entries listed inline
 *     underneath its own heading, all groups on screen at once.
 *   - ``mode: "directory"`` — a traditional master/detail drill-down, all
 *     in place (no navigating away): a directory of groups first (one row
 *     or folder tile per group + its entry count); clicking one swaps the
 *     SAME view to that one group's entries, with a "Back" affordance to
 *     return to the directory. E.g. Compensation Records' "By Employee"
 *     tab: pick an employee, see just their records, go back, pick
 *     another — without ever leaving the Compensation Records track. Only
 *     meaningful when ``group_by`` is relation-typed (its label is what
 *     the directory rows/tiles and detail heading show) — a plain-field
 *     group_by falls back to ``sections`` rendering. The directory step
 *     itself has two layouts, via ``directory_layout`` (named that, not
 *     ``layout`` — the compiler already reserves a top-level
 *     ``view.layout`` / ``view.config.layout`` object for something
 *     else):
 *       - ``"list"`` (default) — stacked rows, one per group.
 *       - ``"folders"`` — a grid of folder-icon tiles instead of rows.
 *
 * Config: ``{group_by: string, mode?: "sections" | "directory",
 * directory_layout?: "list" | "folders", title?: string,
 * empty_group_label?: string}``.
 *
 * Self-contained — reads only the ``entries``/``fields`` already passed in
 * for the current track (same pipeline every other track-level view type
 * consumes); ``directory`` mode additionally resolves each group's label
 * via ``useRelationLabels`` (same resolver ``RelationValue`` itself uses
 * for the ``sections`` heading) — plain text there, not a link, since the
 * row/heading's own click is what drives the drill-down, not navigation
 * to the related entry's own page.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder } from 'lucide-react';
import { EntryCard } from '../entries/EntryCard';
import { RelationValue, useRelationLabels, type RelationSpec } from '../entries/relations';
import { EmptyState } from '../ui';
import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from '../../views/types';
import type { OperationalModelFieldSpec, Entry } from '../../types';

const DEFAULT_EMPTY_GROUP_LABEL = 'Unassigned';

function readGroupValue(entry: Entry, fieldKey: string): unknown {
  const cf = (entry.custom_fields || {}) as Record<string, unknown>;
  if (fieldKey in cf) return cf[fieldKey];
  return (entry as unknown as Record<string, unknown>)[fieldKey];
}

/** Raw group key (id, for a relation field) -> entries in that group.
 *  Group order follows first-seen raw-key order — not alphabetical by
 *  resolved label, since resolving those is async (each row/section's own
 *  ``RelationValue``/``useRelationLabels``); acceptable for a "folder
 *  list", not a sorted report. */
function groupEntries(entries: Entry[], fieldKey: string): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const raw = readGroupValue(entry, fieldKey);
    const key = raw == null || raw === '' ? '' : String(raw);
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

/** Resolves a group key to display text — plain label, not a link (the
 *  directory row / detail heading that renders it drives its own click). */
function useGroupLabel(
  groupKey: string,
  relation: RelationSpec,
  emptyGroupLabel: string
): string {
  const { targets, loading } = useRelationLabels(groupKey || undefined, relation);
  if (!groupKey) return emptyGroupLabel;
  return targets[0]?.label || (loading ? 'Loading…' : groupKey);
}

/** One directory row — its own component so each row's ``useRelationLabels``
 *  call is independent (hooks can't run inside the parent's ``.map``
 *  directly). Clicking anywhere on the row drills into that group, in
 *  place — no navigation. */
function DirectoryRow({
  groupKey,
  count,
  relation,
  emptyGroupLabel,
  onSelect,
}: {
  groupKey: string;
  count: number;
  relation: RelationSpec;
  emptyGroupLabel: string;
  onSelect: () => void;
}) {
  const label = useGroupLabel(groupKey, relation, emptyGroupLabel);
  const countLabel = `${count} ${count === 1 ? 'record' : 'records'}`;

  return (
    <button type="button" onClick={onSelect} className="block w-full text-left">
      <Surface
        tone="panel"
        border="default"
        radius="card"
        padding="md"
        className="flex items-center justify-between gap-3"
      >
        <Text variant="body">{label}</Text>
        <Text as="span" variant="meta" tone="muted" className="flex items-center gap-1">
          {countLabel}
          <ChevronRight size={16} />
        </Text>
      </Surface>
    </button>
  );
}

/** One folder tile — ``layout: "folders"``'s per-group unit. Same click-to-
 *  drill-down behavior as ``DirectoryRow``, laid out as an icon + label
 *  tile in a grid instead of a stacked row. */
function FolderTile({
  groupKey,
  count,
  relation,
  emptyGroupLabel,
  onSelect,
}: {
  groupKey: string;
  count: number;
  relation: RelationSpec;
  emptyGroupLabel: string;
  onSelect: () => void;
}) {
  const label = useGroupLabel(groupKey, relation, emptyGroupLabel);

  return (
    <button type="button" onClick={onSelect} className="block text-left">
      <Surface
        tone="panel"
        border="default"
        radius="card"
        padding="md"
        className="flex flex-col items-center gap-2 text-center"
      >
        <Folder size={40} className="text-[var(--accent)]" strokeWidth={1.5} />
        <Text variant="body" className="w-full truncate" truncate>
          {label}
        </Text>
        <Text variant="meta" tone="muted">
          {count} {count === 1 ? 'record' : 'records'}
        </Text>
      </Surface>
    </button>
  );
}

/** Detail pane for one drilled-into group — a "Back" affordance, the
 *  group's resolved label as a heading, and its entries listed inline
 *  (same per-entry rendering ``sections`` mode uses). */
function DirectoryDetail({
  groupKey,
  items,
  relation,
  emptyGroupLabel,
  onBack,
  track,
  onEntryOpen,
  onEntryDelete,
  onEntryEdit,
  publicPermissions,
  publicToken,
}: {
  groupKey: string;
  items: Entry[];
  relation: RelationSpec;
  emptyGroupLabel: string;
  onBack: () => void;
} & Pick<
  ViewWidgetProps,
  | 'track'
  | 'onEntryOpen'
  | 'onEntryDelete'
  | 'onEntryEdit'
  | 'publicPermissions'
  | 'publicToken'
>) {
  const label = useGroupLabel(groupKey, relation, emptyGroupLabel);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1"
      >
        <ChevronLeft size={16} />
        <Text as="span" variant="meta" tone="muted">
          Back
        </Text>
      </button>
      <Text as="h2" variant="heading-sm">
        {label}
      </Text>
      <div className="space-y-3">
        {items.map(entry => (
          <EntryCard
            key={entry.id}
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
        ))}
      </div>
    </div>
  );
}

export function GroupedListWidget({
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
  const config = (view.config || {}) as Record<string, unknown>;
  const groupBy = typeof config.group_by === 'string' ? config.group_by : '';
  const mode = config.mode === 'directory' ? 'directory' : 'sections';
  const layout = config.directory_layout === 'folders' ? 'folders' : 'list';
  const title = typeof config.title === 'string' ? config.title : undefined;
  const emptyGroupLabel =
    typeof config.empty_group_label === 'string'
      ? config.empty_group_label
      : DEFAULT_EMPTY_GROUP_LABEL;

  // Which group (if any) directory mode has drilled into. Reset whenever
  // the view/grouping itself changes out from under it (switching tabs,
  // re-filtering) so a stale key never strands the widget on a detail pane
  // for a group that's no longer meaningful.
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);

  const groupByRelation = useMemo<OperationalModelFieldSpec['relation']>(() => {
    if (!groupBy) return undefined;
    const spec = (fields || []).find(f => f.key === groupBy);
    return spec && String(spec.type || '').toLowerCase() === 'relation'
      ? spec.relation
      : undefined;
  }, [fields, groupBy]);

  const groups = useMemo(() => groupEntries(entries, groupBy), [entries, groupBy]);

  if (isLoading && entries.length === 0) {
    return <Text variant="body" tone="muted" as="p">Loading…</Text>;
  }
  if (!entries.length) {
    return (
      emptyState || (
        <div className="app-card">
          <EmptyState title="No entries yet" />
        </div>
      )
    );
  }
  if (!groupBy) {
    return (
      <Text variant="body" tone="muted" as="p">
        This view has no "group by" field configured.
      </Text>
    );
  }

  // "directory" only makes sense grouping by a relation (its label is what
  // rows/headings show) — fall back to "sections" otherwise.
  if (mode === 'directory' && groupByRelation) {
    const activeItems = activeGroupKey != null ? groups.get(activeGroupKey) : undefined;
    if (activeGroupKey != null && activeItems) {
      return (
        <DirectoryDetail
          groupKey={activeGroupKey}
          items={activeItems}
          relation={groupByRelation}
          emptyGroupLabel={emptyGroupLabel}
          onBack={() => setActiveGroupKey(null)}
          track={track}
          onEntryOpen={onEntryOpen}
          onEntryDelete={onEntryDelete}
          onEntryEdit={onEntryEdit}
          publicPermissions={publicPermissions}
          publicToken={publicToken}
        />
      );
    }
    if (layout === 'folders') {
      return (
        <div className="space-y-3">
          {title ? (
            <Text as="h2" variant="heading-sm">
              {title}
            </Text>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from(groups.entries()).map(([key, items]) => (
              <FolderTile
                key={key || '__ungrouped__'}
                groupKey={key}
                count={items.length}
                relation={groupByRelation}
                emptyGroupLabel={emptyGroupLabel}
                onSelect={() => setActiveGroupKey(key)}
              />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {title ? (
          <Text as="h2" variant="heading-sm">
            {title}
          </Text>
        ) : null}
        {Array.from(groups.entries()).map(([key, items]) => (
          <DirectoryRow
            key={key || '__ungrouped__'}
            groupKey={key}
            count={items.length}
            relation={groupByRelation}
            emptyGroupLabel={emptyGroupLabel}
            onSelect={() => setActiveGroupKey(key)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {title ? (
        <Text as="h2" variant="heading-sm">
          {title}
        </Text>
      ) : null}
      {Array.from(groups.entries()).map(([key, items]) => (
        <section key={key || '__ungrouped__'}>
          <Text
            as="h3"
            variant="meta"
            weight="semibold"
            tone="muted"
            className="mb-2 block uppercase tracking-wide"
          >
            {key ? (
              groupByRelation ? (
                <RelationValue value={key} relation={groupByRelation} variant="inline" />
              ) : (
                key
              )
            ) : (
              emptyGroupLabel
            )}{' '}
            <span className="opacity-60">({items.length})</span>
          </Text>
          <div className="space-y-3">
            {items.map(entry => (
              <EntryCard
                key={entry.id}
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
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
