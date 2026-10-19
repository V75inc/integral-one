import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { replaceEqualDeep, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  rectIntersection,
  getFirstCollision
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Flame,
  GripVertical,
  Plus,
  Settings2,
  Trash2,
  Check,
  X,
  Paperclip,
} from 'lucide-react';
import { MarkdownContent, Pill } from '../ui';
import { tagColorStyle } from '../../utils/tagColor';
import type { ViewWidgetProps } from './types';
import type { Entry, SavedView, OperationalModelFieldSpec } from '../../types';
import { entriesApi } from '../../api/entries';
import { extensionsApi, RECORDED_OUTPUT_WITHHELD_MESSAGE } from '../../api/extensions';
import { toToastMessage } from '../../api/helpers';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { humanizeFieldKey } from '../../utils/humanizeFieldKey';
import { formatCustomFieldValue } from '../../utils/entryMetaFields';
import { useRelationLabels } from '../entries/relations';
import { useWorkspaceMemberLabelMap } from '../entries/members/useWorkspaceMemberLabelMap';
import type { MemberLabelResolver } from '../entries/members/useWorkspaceMemberLabelMap';
import {
  KANBAN_ORDER_KEY,
  KANBAN_STAGE_KEY,
  UNASSIGNED_COLUMN_KEY,
  isKanbanInternalCustomFieldKey,
  resolveEffectiveKanbanCardFields,
  resolveEntryColumnKey,
  resolveKanbanGroupBy,
  resolveKanbanGroupByEligibleFields,
  buildKanbanColumnsForGroupField,
  resolveKanbanSchemaFields,
  resolveKanbanWriteFieldKey,
  resolveViewCreateEntryTypeKey,
  shouldSyncKanbanColumnEnumForView,
  generateKanbanColumnKey,
  type KanbanColumnDrop,
  type KanbanColumnSpec,
} from './kanbanColumnUtils';
import {
  buildDropPayload,
  columnDropBlockReason,
  dropOperationError,
  readKanbanColumn,
  resolveKanbanDrop,
  validateDropInput,
  type ResolvedKanbanDrop,
} from './kanbanDropActions';
import { KanbanDropDialog } from './KanbanDropDialog';

/** Map from custom-field key (no `custom_fields.` prefix) to resolved relation
 *  labels. Pre-computed per entry so `interpolateTemplate` stays synchronous. */
type RelationLabelMap = Record<string, string[]>;

interface KanbanColumn {
  key: string;
  label: string;
  color?: string;
  drop_target?: boolean;
  accepts_from?: string[];
  on_drop?: KanbanColumnDrop;
}

function toBoardColumn(column: KanbanColumnSpec): KanbanColumn {
  return {
    key: column.key,
    label: column.label || column.key,
    color: column.color,
    drop_target: column.drop_target,
    accepts_from: column.accepts_from,
    on_drop: column.on_drop,
  };
}

interface KanbanCardTemplate {
  title?: string;
  subtitle?: string;
  excerpt_field?: string;
  excerpt_chars?: number;
  footer_tags?: string[];
}

function interpolateTemplate(
  template: string,
  entry: Entry,
  relationLabels: RelationLabelMap = {},
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, expr) => {
    const [path, ...filters] = expr.trim().split('|').map((s: string) => s.trim());
    let value: unknown;
    if (path === 'title') value = entry.title;
    else if (path === 'body') value = entry.body;
    else if (path.startsWith('custom_fields.')) {
      const key = path.slice('custom_fields.'.length);
      const labels = relationLabels[key];
      if (labels && labels.length) {
        value = labels.join(', ');
      } else {
        value = (entry.custom_fields as Record<string, unknown> | undefined)?.[key];
      }
    }
    if (value == null) return '';
    let result = String(value);
    if (filters.includes('currency')) {
      const num = parseFloat(result);
      if (!isNaN(num)) result = '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return result;
  });
}

/** Extract `custom_fields.<key>` tokens from card templates that reference
 *  declared relation fields — narrows the per-entry resolver to only fetch
 *  ids whose labels will actually surface in the rendered output. */
function extractRelationKeys(
  templates: Array<string | undefined>,
  fields: OperationalModelFieldSpec[] | undefined,
): string[] {
  if (!fields?.length) return [];
  const relationKeys = new Set(
    fields
      .filter(f => String(f.type || '').toLowerCase() === 'relation')
      .map(f => f.key)
  );
  const referenced = new Set<string>();
  for (const t of templates) {
    if (!t) continue;
    for (const m of t.matchAll(/\{\{\s*custom_fields\.([^|}\s]+)/g)) {
      const k = m[1];
      if (relationKeys.has(k)) referenced.add(k);
    }
  }
  return Array.from(referenced);
}

/** Resolved relation-field descriptor — narrowed to non-null `relation`
 *  metadata so the resolver hook can dispatch directly to entry / track
 *  fetchers without re-validating. */
type ResolvedRelationField = {
  key: string;
  relation: NonNullable<OperationalModelFieldSpec['relation']>;
};

/**
 * Pre-resolve relation tokens referenced by a kanban card template, for one
 * entry. Returns a map keyed by field key (without `custom_fields.` prefix).
 *
 * Hook order is stable across renders because `relationFields` is memoized
 * at the widget level — its length and per-index identity are constant for
 * the life of the view config.
 */
function useEntryRelationLabelMap(
  entry: Entry,
  relationFields: ResolvedRelationField[],
): RelationLabelMap {
  const cf = (entry.custom_fields as Record<string, unknown> | undefined) ?? {};
  const out: RelationLabelMap = {};
  for (const f of relationFields) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { targets } = useRelationLabels(cf[f.key], f.relation);
    if (targets.length) out[f.key] = targets.map(t => t.label);
  }
  return out;
}

type Density = 'compact' | 'comfy';

function normalizeDensity(raw: unknown): Density {
  const d = String(raw || 'comfy').toLowerCase();
  return d === 'compact' ? 'compact' : 'comfy';
}

const UNASSIGNED_COLUMN: KanbanColumn = {
  key: UNASSIGNED_COLUMN_KEY,
  label: 'Unassigned',
  color: 'border-t-[var(--warn-fg)]'
};

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { key: 'todo', label: 'To Do', color: 'border-t-[var(--text-subtle)]' },
  { key: 'in_progress', label: 'In Progress', color: 'border-t-[var(--info-fg)]' },
  { key: 'in_review', label: 'In Review', color: 'border-t-[var(--warn-fg)]' },
  { key: 'done', label: 'Done', color: 'border-t-[var(--success-fg)]' },
];

const COLOR_SWATCHES: Array<{ token: string; label: string }> = [
  { token: 'border-t-[var(--text-subtle)]', label: 'Neutral' },
  { token: 'border-t-[var(--info-fg)]', label: 'Blue' },
  { token: 'border-t-[var(--warn-fg)]', label: 'Amber' },
  { token: 'border-t-[var(--success-fg)]', label: 'Green' },
  { token: 'border-t-[var(--danger-fg)]', label: 'Red' },
  { token: 'border-t-[var(--brand-accent)]', label: 'Brand' },
];

const SWATCH_BG: Record<string, string> = {
  'border-t-[var(--text-subtle)]': 'bg-[var(--text-subtle)]',
  'border-t-[var(--info-fg)]': 'bg-[var(--info-fg)]',
  'border-t-[var(--warn-fg)]': 'bg-[var(--warn-fg)]',
  'border-t-[var(--success-fg)]': 'bg-[var(--success-fg)]',
  'border-t-[var(--danger-fg)]': 'bg-[var(--danger-fg)]',
  'border-t-[var(--brand-accent)]': 'bg-[var(--brand-accent)]'
};

function formatFieldValue(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    // crude ISO-date detection — keep short form
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    return v;
  }
  try {
    return JSON.stringify(v).slice(0, 32);
  } catch {
    return String(v);
  }
}

/** Sortable id prefix that disambiguates column-drag handles from card
 *  drags inside the same `DndContext`. Cards use raw entry ids; columns
 *  use `col:<key>` so `active.id` reveals what's being moved. */
const COL_ID_PREFIX = 'col:';
const isColumnId = (id: unknown): boolean =>
  typeof id === 'string' && id.startsWith(COL_ID_PREFIX);
const colKeyFromId = (id: unknown): string =>
  typeof id === 'string' && id.startsWith(COL_ID_PREFIX)
    ? id.slice(COL_ID_PREFIX.length)
    : String(id);

function getOrder(entry: Entry): number {
  const v = (entry.custom_fields as Record<string, unknown> | undefined)?.[KANBAN_ORDER_KEY];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Returns the entry's stored `_kanban_order` when present, or a virtual
 *  order derived from its position in the server-returned entries list
 *  (×1000 to leave fractional headroom for inserts). Without this, every
 *  unordered entry collapses to `getOrder() === 0`, so `computeOrder`
 *  picks 0 as the midpoint of two unordered neighbors — colliding with
 *  them and falling back to the index tiebreak, which produces no
 *  visible movement on the next sort. */
function getEffectiveOrder(entry: Entry, indexMap: Map<string, number>): number {
  const stored = (entry.custom_fields as Record<string, unknown> | undefined)?.[KANBAN_ORDER_KEY];
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  if (typeof stored === 'string') {
    const n = Number(stored);
    if (Number.isFinite(n)) return n;
  }
  return (indexMap.get(entry.id) ?? 0) * 1000;
}

function buildIndexMap(entries: Entry[]): Map<string, number> {
  const m = new Map<string, number>();
  entries.forEach((e, i) => m.set(e.id, i));
  return m;
}

function sortColumnEntries(
  list: Entry[],
  indexMap: Map<string, number>
): Entry[] {
  return [...list].sort((a, b) => {
    const oa = getEffectiveOrder(a, indexMap);
    const ob = getEffectiveOrder(b, indexMap);
    if (oa !== ob) return oa - ob;
    return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0);
  });
}

function groupAndSort(
  entries: Entry[],
  columns: KanbanColumn[],
  groupBy: string
): Record<string, Entry[]> {
  const indexMap = buildIndexMap(entries);
  const map: Record<string, Entry[]> = {};
  for (const col of columns) {
    map[col.key] = [];
  }
  map[UNASSIGNED_COLUMN_KEY] = [];
  for (const entry of entries) {
    const colKey = resolveEntryColumnKey(entry, columns, groupBy);
    if (!map[colKey]) map[colKey] = [];
    map[colKey].push(entry);
  }
  for (const key of Object.keys(map)) {
    map[key] = sortColumnEntries(map[key], indexMap);
  }
  return map;
}

function isBoardColumnKey(
  colKey: string,
  columns: KanbanColumn[],
  localCols: Record<string, Entry[]>
): boolean {
  return (
    columns.some(c => c.key === colKey) ||
    (colKey === UNASSIGNED_COLUMN_KEY &&
      (localCols[UNASSIGNED_COLUMN_KEY]?.length ?? 0) > 0)
  );
}

function findColumnOf(
  byCol: Record<string, Entry[]>,
  entryId: string
): string | undefined {
  for (const k of Object.keys(byCol)) {
    if (byCol[k].some(e => e.id === entryId)) return k;
  }
  return undefined;
}

/** Compute a `_kanban_order` value for a card at `targetIdx` inside
 *  `list` (where `list` already includes the card at that index).
 *  Reads neighbors via `getEffectiveOrder` so unordered entries still
 *  produce distinct virtual orders — midpoint never collides with the
 *  active card or its neighbors.
 *
 *  - No neighbors → 1000 (column was empty).
 *  - Edge → step ±1000 from the one neighbor.
 *  - Between two → midpoint. If the two happen to share an order (same
 *    stored value), nudge by 0.5 so the result is still distinct. */
function computeOrder(
  list: Entry[],
  targetIdx: number,
  indexMap: Map<string, number>
): number {
  const above = list[targetIdx - 1];
  const below = list[targetIdx + 1];
  const a = above ? getEffectiveOrder(above, indexMap) : null;
  const b = below ? getEffectiveOrder(below, indexMap) : null;
  if (a == null && b == null) return 1000;
  if (a == null) return (b as number) - 1000;
  if (b == null) return (a as number) + 1000;
  if (a === b) return a + 0.5;
  return (a + b) / 2;
}

/** Card body content, shared between in-list cards and the DragOverlay
 *  clone. Renders title / body / chips per density without any DnD wiring.
 *
 *  `relationFields` lists the declared relation-typed fields the card
 *  template references (computed once at the widget level). The body
 *  pre-resolves their ids → labels via `useEntryRelationLabelMap` so the
 *  synchronous `interpolateTemplate` substitution outputs labels rather
 *  than raw ids — no flicker because the template position is unchanged. */
function formatKanbanChipValue(
  key: string,
  raw: unknown,
  fieldSpecsByKey: Map<string, OperationalModelFieldSpec>,
  relationLabels: RelationLabelMap,
  resolveMemberLabel?: MemberLabelResolver
): string {
  const field = fieldSpecsByKey.get(key);
  if (field && String(field.type || '').toLowerCase() === 'relation') {
    const labels = relationLabels[key];
    if (labels?.length) return labels.join(', ');
  }
  if (field && String(field.type || '').toLowerCase() === 'member') {
    if (raw == null || raw === '') return '';
    const id = String(raw);
    return resolveMemberLabel?.(id) ?? `Member ${id.slice(-6)}`;
  }
  if (field) return formatCustomFieldValue(field, raw);
  return formatFieldValue(raw);
}

function CardBody({
  entry,
  density,
  cardFields,
  cardTemplate,
  relationFields,
  fieldSpecsByKey,
  resolveMemberLabel
}: {
  entry: Entry;
  density: Density;
  cardFields: string[];
  cardTemplate?: KanbanCardTemplate;
  relationFields: ResolvedRelationField[];
  fieldSpecsByKey: Map<string, OperationalModelFieldSpec>;
  resolveMemberLabel?: MemberLabelResolver;
}) {
  const padCls = density === 'compact' ? 'p-2' : 'p-3';
  const chipsMarginCls = density === 'compact' ? 'mt-1.5' : 'mt-2';
  const titleCls =
    density === 'compact'
      ? 'text-[13px] font-medium text-[var(--text)]'
      : 'text-sm font-medium text-[var(--text)] mb-1';
  const showBody = density === 'comfy';
  const showChips = density === 'comfy';
  const showTemplateExtras = density === 'comfy';

  const customFields = (entry.custom_fields || {}) as Record<string, unknown>;
  const tagPills = !!entry.tags?.length && <div className="flex flex-wrap gap-1">
    {entry.tags.map(tag => <Pill key={tag.id} tone="descriptive" style={tagColorStyle(tag.color)}>#{tag.name || 'Untitled tag'}</Pill>)}
  </div>;
  const relationLabels = useEntryRelationLabelMap(entry, relationFields);
  const chips = cardFields
    .map(k => {
      const top = (entry as unknown as Record<string, unknown>)[k];
      const raw = top !== undefined ? top : customFields[k];
      const formatted = formatKanbanChipValue(
        k,
        raw,
        fieldSpecsByKey,
        relationLabels,
        resolveMemberLabel
      );
      return formatted ? { key: k, value: formatted } : null;
    })
    .filter((x): x is { key: string; value: string } => !!x);

  // Profile-driven template rendering — only when card_template is present in the view config.
  if (cardTemplate) {
    const subtitle =
      showTemplateExtras && cardTemplate.subtitle
        ? interpolateTemplate(cardTemplate.subtitle, entry, relationLabels)
        : null;
    const excerptSource =
      showTemplateExtras && cardTemplate.excerpt_field === 'body'
        ? (entry.body ?? '')
        : '';
    const maxChars = cardTemplate.excerpt_chars ?? 80;
    const excerpt =
      showTemplateExtras && excerptSource.length > 0
        ? excerptSource.slice(0, maxChars) +
          (excerptSource.length > maxChars ? '…' : '')
        : null;
    const footerValues = showTemplateExtras
      ? (cardTemplate.footer_tags ?? [])
          .map(path => {
            const key = path.startsWith('custom_fields.')
              ? path.slice('custom_fields.'.length)
              : path;
            const val = customFields[key];
            return val != null ? String(val) : null;
          })
          .filter((v): v is string => v !== null)
      : [];

    return (
      <div className={`flex-1 min-w-0 ${padCls} flex flex-col gap-0.5`}>
          {entry.title && <p className={titleCls}>{entry.title}</p>}
          {subtitle && (
            <p className="text-xs font-medium text-[var(--text-muted)]">{subtitle}</p>
          )}
          {excerpt && (
            <p className="text-xs text-[var(--text-subtle)] line-clamp-2">{excerpt}</p>
          )}
          {tagPills}
          {footerValues.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {footerValues.map((v, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--panel-2)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
      </div>
    );
  }

  return (
    <div className={`flex-1 min-w-0 ${padCls}`}>
        {entry.title && <p className={titleCls}>{entry.title}</p>}
        {showBody && entry.body ? (
          <div className="text-xs text-[var(--text-muted)] line-clamp-2 overflow-hidden">
            <MarkdownContent compact>{entry.body}</MarkdownContent>
          </div>
        ) : null}
        {showChips && chips.length > 0 && (
          <div className={`flex flex-wrap gap-1 ${chipsMarginCls}`}>
            {chips.map(c => {
              const spec = fieldSpecsByKey.get(c.key);
              const label = spec?.name || humanizeFieldKey(c.key) || c.key;
              return (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 rounded bg-[var(--panel)] border border-[var(--panel-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]"
                  title={`${label}: ${c.value}`}
                >
                  <span className="text-[var(--text-subtle)]">{label}</span>
                  <span className="text-[var(--text)] normal-case">{c.value}</span>
                </span>
              );
            })}
          </div>
        )}
        {tagPills}
        {(entry.attachment_ids?.length ?? 0) > 0 ? (
          <div className={`flex items-center gap-1 text-[10px] text-[var(--text-subtle)] ${chipsMarginCls}`}>
            <Paperclip size={12} aria-hidden />
            <span>{entry.attachment_ids!.length}</span>
          </div>
        ) : null}
    </div>
  );
}

function SortableCard({
  entry,
  onOpen,
  density,
  cardFields,
  cardTemplate,
  relationFields,
  fieldSpecsByKey,
  resolveMemberLabel,
  dragEnabled = true
}: {
  entry: Entry;
  onOpen: (entry: Entry) => void;
  density: Density;
  cardFields: string[];
  cardTemplate?: KanbanCardTemplate;
  relationFields: ResolvedRelationField[];
  fieldSpecsByKey: Map<string, OperationalModelFieldSpec>;
  resolveMemberLabel?: MemberLabelResolver;
  dragEnabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !dragEnabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Original card stays in place as a faint placeholder while the
    // DragOverlay clone follows the cursor. Hiding it entirely would
    // collapse the column; ghosting it preserves the slot.
    opacity: isDragging ? 0.35 : 1
  };

  /** Click vs drag separation: dnd-kit's MouseSensor `distance: 4`
   *  arms drag on the first 4+ px of pointer movement and consumes the
   *  pointerup that ends the drag, so the browser never synthesizes a
   *  click on that release. A click only fires when the user didn't
   *  meaningfully move — exactly the intent for "open detail." We
   *  still guard with `isDragging` for the synthetic-click edge case
   *  where some browsers fire a click after a tiny drag tail. */
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    // Don't intercept clicks on interactive children (markdown links,
    // chip buttons, etc.) — they have their own behavior.
    const tgt = e.target as HTMLElement | null;
    if (tgt && tgt !== e.currentTarget) {
      const interactive = tgt.closest('a, button, input, textarea, select');
      if (interactive && e.currentTarget.contains(interactive)) return;
    }
    onOpen(entry);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(dragEnabled ? attributes : {})}
      {...(dragEnabled ? listeners : {})}
      onClick={handleClick}
      onKeyDown={e => {
        // Enter opens detail; Space is reserved by dnd-kit's
        // KeyboardSensor for picking up/dropping the card.
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen(entry);
        }
      }}
      aria-label={entry.title || 'Card'}
      className={[
        'flex items-stretch bg-[var(--panel-2)] rounded-lg border border-[var(--panel-border)] overflow-hidden',
        dragEnabled
          ? 'cursor-grab active:cursor-grabbing touch-none select-none'
          : 'cursor-pointer select-none',
        'hover:border-[var(--text-muted)]/30 transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand-accent)]',
        isDragging ? 'ring-1 ring-[var(--brand-accent)]/40' : '',
      ].join(' ')}
    >
      <CardBody
        entry={entry}
        density={density}
        cardFields={cardFields}
        cardTemplate={cardTemplate}
        relationFields={relationFields}
        fieldSpecsByKey={fieldSpecsByKey}
        resolveMemberLabel={resolveMemberLabel}
      />
    </div>
  );
}

/** Column body — droppable so empty columns accept drops. */
function KanbanColumnBody({
  colKey,
  entries,
  onEntryOpen,
  density,
  cardFields,
  cardTemplate,
  relationFields,
  fieldSpecsByKey,
  resolveMemberLabel,
  dragEnabled
}: {
  colKey: string;
  entries: Entry[];
  onEntryOpen: (entry: Entry) => void;
  density: Density;
  cardFields: string[];
  cardTemplate?: KanbanCardTemplate;
  relationFields: ResolvedRelationField[];
  fieldSpecsByKey: Map<string, OperationalModelFieldSpec>;
  resolveMemberLabel?: MemberLabelResolver;
  dragEnabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey });
  return (
    <div
      ref={setNodeRef}
      className={[
        'px-3 pb-3 space-y-2 min-h-[80px]',
        'transition-colors duration-fast rounded-b-lg',
        isOver ? 'bg-[var(--panel-2)]' : '',
      ].join(' ')}
    >
      <SortableContext
        items={entries.map(e => e.id)}
        strategy={verticalListSortingStrategy}
      >
        {entries.length === 0 ? (
          <p className="text-xs text-[var(--text-subtle)] text-center py-4 italic select-none">
            Drop here
          </p>
        ) : (
          entries.map(entry => (
            <SortableCard
              key={entry.id}
              entry={entry}
              onOpen={onEntryOpen}
              density={density}
              cardFields={cardFields}
              cardTemplate={cardTemplate}
              relationFields={relationFields}
              fieldSpecsByKey={fieldSpecsByKey}
              resolveMemberLabel={resolveMemberLabel}
              dragEnabled={dragEnabled}
            />
          ))
        )}
      </SortableContext>
    </div>
  );
}

/** Drag-to-delete sink. Only rendered while a drag is active so it doesn't
 *  occupy real estate when idle. Drop target id is the literal string
 *  `__burn__`, matched by `handleDragEnd` in the board. */
function BurnBarrel() {
  const { setNodeRef, isOver } = useDroppable({ id: '__burn__' });
  return (
    <div
      ref={setNodeRef}
      className={[
        'flex-shrink-0 grid h-32 w-32 place-content-center rounded-lg border-2 border-dashed transition-colors',
        isOver
          ? 'border-[var(--danger-fg)] bg-[var(--danger-bg)] text-[var(--danger-fg)]'
          : 'border-[var(--panel-border)] bg-[var(--panel)]/40 text-[var(--text-muted)]',
      ].join(' ')}
      aria-label="Drop to delete"
    >
      {isOver ? <Flame size={28} className="animate-pulse" /> : <Trash2 size={22} />}
    </div>
  );
}

/** Inline quick-create card for a column. Toggles between collapsed
 *  "+ Add card" button and an expanded textarea. */
function AddCard({
  colKey,
  groupKey,
  entryTypeKey,
  onCreate,
  extraCustomFields
}: {
  colKey: string;
  groupKey: string;
  entryTypeKey?: string;
  onCreate?: ViewWidgetProps['onEntryCreate'];
  extraCustomFields?: Record<string, unknown>;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  if (!onCreate) return null;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onCreate({
        title: t,
        type: entryTypeKey,
        custom_fields: { [groupKey]: colKey, ...(extraCustomFields || {}) }
      });
      setText('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center gap-1.5 rounded px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] transition-colors"
      >
        <Plus size={14} />
        <span>Add card</span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mx-3 mb-3">
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) submit(e as unknown as React.FormEvent);
          if (e.key === 'Escape') {
            setOpen(false);
            setText('');
          }
        }}
        placeholder="New card title…"
        rows={2}
        className="w-full rounded border border-[var(--panel-border)] bg-[var(--panel-2)] p-2 text-sm text-[var(--text)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--brand-accent)]"
      />
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setText('');
          }}
          className="px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="flex items-center gap-1 rounded bg-[var(--brand-accent)] px-2 py-1 text-xs text-[var(--on-accent,white)] disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          <span>Add</span>
          <Plus size={12} />
        </button>
      </div>
    </form>
  );
}

/** Inline-editable column header (rename + recolor). */
function ColumnHeader({
  column,
  count,
  canEdit,
  canRename,
  canRemove,
  onRename,
  onRecolor,
  onRemove,
  dragHandleProps
}: {
  column: KanbanColumn;
  count: number;
  canEdit: boolean;
  canRename: boolean;
  canRemove: boolean;
  onRename: (label: string) => void;
  onRecolor: (token: string) => void;
  onRemove: () => void;
  /** Spread onto the leading drag-grip when column reorder is enabled.
   *  Contains `useSortable` attributes + listeners; omit to hide the
   *  grip entirely (read-only viewers, etc.). */
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.label);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(column.label), [column.label]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!paletteRef.current?.contains(e.target as Node)) setPaletteOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [paletteOpen]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== column.label) onRename(t);
    setEditing(false);
  };

  return (
    <div className="px-3 py-3 flex items-center justify-between gap-1">
      {dragHandleProps && (
        <button
          type="button"
          aria-label={`Drag ${column.label} column`}
          {...dragHandleProps}
          className="shrink-0 inline-flex h-7 w-5 items-center justify-center rounded text-[var(--text-subtle)] cursor-grab active:cursor-grabbing touch-none select-none hover:text-[var(--text-muted)] md:opacity-0 md:group-hover:opacity-100 md:transition-opacity"
        >
          <GripVertical size={14} />
        </button>
      )}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(column.label);
              setEditing(false);
            }
          }}
          className="flex-1 bg-[var(--panel-2)] text-sm font-semibold text-[var(--text)] rounded px-1.5 py-0.5 mr-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-accent)]"
        />
      ) : (
        <button
          type="button"
          onClick={() => canRename && setEditing(true)}
          className={`text-sm font-semibold text-[var(--text)] truncate text-left ${canRename ? 'hover:text-[var(--brand-accent)] cursor-text' : 'cursor-default'}`}
          title={canRename ? 'Rename column' : column.label}
        >
          {column.label}
        </button>
      )}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs bg-[var(--panel-2)] text-[var(--text-muted)] px-2 py-0.5 rounded">
          {count}
        </span>
        {canEdit && (
          <div className="relative" ref={paletteRef}>
            <button
              type="button"
              onClick={() => setPaletteOpen(o => !o)}
              aria-label="Change column color"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] md:opacity-0 md:group-hover:opacity-100 md:transition-opacity md:duration-fast"
            >
              <span
                className={`h-3 w-3 rounded-full ${SWATCH_BG[column.color || ''] || 'bg-[var(--text-subtle)]'}`}
              />
            </button>
            {paletteOpen && (
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-[var(--panel-border)] bg-[var(--panel)] p-2 shadow-lg">
                <div className="grid grid-cols-3 gap-1">
                  {COLOR_SWATCHES.map(s => (
                    <button
                      key={s.token}
                      type="button"
                      onClick={() => {
                        onRecolor(s.token);
                        setPaletteOpen(false);
                      }}
                      aria-label={s.label}
                      title={s.label}
                      className="relative h-6 w-full rounded border border-[var(--panel-border)] hover:scale-105 transition-transform"
                    >
                      <span
                        className={`absolute inset-0.5 rounded ${SWATCH_BG[s.token] || ''}`}
                      />
                      {column.color === s.token && (
                        <Check
                          size={12}
                          className="absolute inset-0 m-auto text-[var(--text)]"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${column.label} column`}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--danger-fg)] md:opacity-0 md:group-hover:opacity-100 md:transition-opacity md:duration-fast"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Wraps a column so the outer `SortableContext` (with
 *  `horizontalListSortingStrategy`) can reorder it via drag. The drag
 *  handle is rendered inside `ColumnHeader`; the entire column wrapper
 *  receives `setNodeRef` + transform so dnd-kit can animate the slide. */
function SortableColumn({
  col,
  count,
  canEditConfig,
  canRename,
  canRemove,
  columnDraggable = true,
  onRename,
  onRecolor,
  onRemove,
  children
}: {
  col: KanbanColumn;
  count: number;
  canEditConfig: boolean;
  canRename: boolean;
  canRemove: boolean;
  columnDraggable?: boolean;
  onRename: (label: string) => void;
  onRecolor: (color: string) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: COL_ID_PREFIX + col.key,
    data: { type: 'column', colKey: col.key },
    disabled: !columnDraggable
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };
  return (
    <div ref={setNodeRef} style={style} className="relative group snap-start">
      <div
        className={`flex-shrink-0 w-[80vw] max-w-[18rem] md:w-72 bg-[var(--panel)] rounded-lg border-t-4 ${col.color || 'border-t-[var(--text-subtle)]'} border border-[var(--panel-border)] ${isDragging ? 'ring-2 ring-[var(--brand-accent)]/40' : ''}`}
      >
        <ColumnHeader
          column={col}
          count={count}
          canEdit={canEditConfig}
          canRename={canRename}
          canRemove={canRemove}
          onRename={onRename}
          onRecolor={onRecolor}
          onRemove={onRemove}
          dragHandleProps={
            canEditConfig && columnDraggable
              ? ({
                  ...attributes,
                  ...listeners
                } as React.HTMLAttributes<HTMLButtonElement>)
              : undefined
          }
        />
        {children}
      </div>
    </div>
  );
}

/** Board settings popover — density + group-by + card_fields picker. */
function BoardSettings({
  density,
  setDensity,
  groupBy,
  groupByOptions,
  setGroupBy,
  availableFields,
  cardFields,
  setCardFields
}: {
  density: Density;
  setDensity: (d: Density) => void;
  groupBy: string;
  groupByOptions: Array<{ key: string; label: string; groupBy: string }>;
  setGroupBy: (next: string) => void;
  availableFields: string[];
  cardFields: string[];
  setCardFields: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggleField = (k: string) => {
    if (cardFields.includes(k)) setCardFields(cardFields.filter(x => x !== k));
    else setCardFields([...cardFields, k]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 rounded border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        aria-label="Kanban settings"
      >
        <Settings2 size={14} />
        <span>Display</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-lg">
          <div className="mb-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
              Density
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(['compact', 'comfy'] as Density[]).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className={`rounded px-2 py-1 text-xs capitalize transition-colors ${
                    density === d
                      ? 'bg-[var(--brand-accent)] text-[var(--on-accent,white)]'
                      : 'bg-[var(--panel-2)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          {groupByOptions.length > 0 ? (
            <div className="mb-3">
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
                Group by
              </div>
              <select
                value={groupBy}
                onChange={e => setGroupBy(e.target.value)}
                className="w-full rounded border border-[var(--panel-border)] bg-[var(--panel-2)] px-2 py-1.5 text-xs text-[var(--text)]"
                aria-label="Group kanban board by"
              >
                {groupByOptions.map(opt => (
                  <option key={opt.groupBy} value={opt.groupBy}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
                Card fields
              </span>
              {cardFields.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCardFields([])}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] inline-flex items-center gap-0.5"
                >
                  <X size={10} /> clear
                </button>
              )}
            </div>
            {availableFields.length === 0 ? (
              <p className="text-xs italic text-[var(--text-subtle)]">
                No custom fields detected
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {availableFields.map(k => {
                  const checked = cardFields.includes(k);
                  return (
                    <label
                      key={k}
                      className="flex items-center gap-2 px-1.5 py-1 text-xs text-[var(--text)] rounded hover:bg-[var(--panel-2)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleField(k)}
                        className="accent-[var(--brand-accent)]"
                      />
                      <span className="truncate">{humanizeFieldKey(k) || k}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanWidgetInner({
  entries,
  view,
  onEntryOpen,
  onEntryUpdate,
  onEntryPersist,
  onEntryDelete,
  onEntryDeleteFailed,
  onEntryCreate,
  onViewUpdate,
  onKanbanColumnEnumSync,
  isEditor,
  publicPermissions,
  fields,
  entryTypes,
  track,
}: ViewWidgetProps) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { showToast, showPendingToast, resolveToast } = useToast();
  const { resolveMemberLabel } = useWorkspaceMemberLabelMap();
  // Prefer the explicit persist hook (writes to backend + syncs cache);
  // fall back to cache-only update when the host page didn't wire one.
  const commitEntry = onEntryPersist || onEntryUpdate;
  const canUpdate = publicPermissions ? !!publicPermissions.update_entries : !!isEditor;
  const config = (view.config || {}) as Record<string, unknown>;
  const groupBy = resolveKanbanGroupBy(config.group_by);
  const createEntryTypeKey = useMemo(
    () => resolveViewCreateEntryTypeKey(view),
    [view]
  );
  const density = normalizeDensity(config.density);
  const configuredCardFields = useMemo(
    () => (Array.isArray(config.card_fields) ? (config.card_fields as string[]) : []),
    [config.card_fields]
  );
  const cardTemplate = (config.card_template as KanbanCardTemplate | undefined) ?? undefined;

  const schemaFields = useMemo(
    () => resolveKanbanSchemaFields(fields, entryTypes, view, createEntryTypeKey),
    [fields, entryTypes, view, createEntryTypeKey]
  );
  const groupWriteFieldKey = useMemo(
    () => resolveKanbanWriteFieldKey(groupBy, schemaFields),
    [groupBy, schemaFields]
  );
  const cardFields = useMemo(
    () =>
      resolveEffectiveKanbanCardFields(
        configuredCardFields,
        schemaFields,
        groupWriteFieldKey
      ),
    [configuredCardFields, schemaFields, groupWriteFieldKey]
  );
  const fieldSpecsByKey = useMemo(() => {
    const map = new Map<string, OperationalModelFieldSpec>();
    for (const f of schemaFields) {
      if (f?.key) map.set(f.key, f);
    }
    return map;
  }, [schemaFields]);

  /** Relation-typed fields referenced by the card template or chip list. The hook
   *  order inside `useEntryRelationLabelMap` is tied to this array's length
   *  and per-index identity, so it MUST be memoized — recomputing on every
   *  render would re-create the array each time, but stable contents keep
   *  React Query's per-id cache keys (and therefore hook slots) consistent. */
  const relationFields = useMemo<ResolvedRelationField[]>(() => {
    const referenced = new Set(
      extractRelationKeys([cardTemplate?.title, cardTemplate?.subtitle], schemaFields)
    );
    for (const key of cardFields) {
      const spec = fieldSpecsByKey.get(key);
      if (spec && String(spec.type || '').toLowerCase() === 'relation') {
        referenced.add(key);
      }
    }
    return (schemaFields ?? [])
      .filter(
        f =>
          String(f.type || '').toLowerCase() === 'relation' &&
          f.relation &&
          referenced.has(f.key)
      )
      .map(f => ({
        key: f.key,
        relation: f.relation as NonNullable<OperationalModelFieldSpec['relation']>
      }));
  }, [
    schemaFields,
    cardTemplate?.title,
    cardTemplate?.subtitle,
    cardFields,
    fieldSpecsByKey,
  ]);

  const sprintField = useMemo(() => {
    return (schemaFields ?? []).find(
      f => f.key === 'sprint' && String(f.type || '').toLowerCase() === 'relation' && f.relation
    );
  }, [schemaFields]);

  const observedSprintIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) {
      const sp = (e.custom_fields as Record<string, unknown> | undefined)?.sprint;
      if (sp) {
        if (Array.isArray(sp)) {
          sp.forEach(id => id && ids.add(String(id)));
        } else {
          ids.add(String(sp));
        }
      }
    }
    return Array.from(ids);
  }, [entries]);

  const { targets: sprintTargets } = useRelationLabels(
    sprintField ? observedSprintIds : undefined,
    sprintField?.relation
  );

  const groupFieldSpec = useMemo(() => {
    return (schemaFields ?? []).find(f => f.key === groupWriteFieldKey);
  }, [schemaFields, groupWriteFieldKey]);

  const observedGroupRelationIds = useMemo(() => {
    if (!groupFieldSpec || String(groupFieldSpec.type || '').toLowerCase() !== 'relation') {
      return [];
    }
    const ids = new Set<string>();
    for (const e of entries) {
      const val = (e.custom_fields as Record<string, unknown> | undefined)?.[groupWriteFieldKey];
      if (val) {
        if (Array.isArray(val)) {
          val.forEach(id => id && ids.add(String(id)));
        } else {
          ids.add(String(val));
        }
      }
    }
    return Array.from(ids);
  }, [entries, groupFieldSpec, groupWriteFieldKey]);

  const { targets: groupRelationTargets } = useRelationLabels(
    groupFieldSpec && String(groupFieldSpec.type || '').toLowerCase() === 'relation'
      ? observedGroupRelationIds
      : undefined,
    groupFieldSpec?.relation
  );

  const resolveRelationLabel = useCallback(
    (id: string, fieldKey?: string) => {
      if (!fieldKey || fieldKey === groupWriteFieldKey) {
        const found = groupRelationTargets.find(t => t.id === id);
        if (found) return found.label;
      }
      const sprintFound = sprintTargets.find(t => t.id === id);
      if (sprintFound) return sprintFound.label;
      return undefined;
    },
    [groupWriteFieldKey, groupRelationTargets, sprintTargets]
  );

  const columns: KanbanColumn[] = useMemo(() => {
    const raw = Array.isArray(config.kanban_columns)
      ? (config.kanban_columns as Array<Record<string, unknown>>)
      : undefined;
    const configured = raw?.length
      ? raw
          .map(column => readKanbanColumn(column))
          .filter(column => column.key)
      : undefined;
    const built = buildKanbanColumnsForGroupField(
      groupBy,
      schemaFields,
      configured,
      entries,
      resolveMemberLabel,
      resolveRelationLabel
    );
    if (built.length > 0) {
      return built.map(column => toBoardColumn(column));
    }
    return DEFAULT_COLUMNS;
  }, [config.kanban_columns, groupBy, schemaFields, entries, resolveMemberLabel, resolveRelationLabel]);

  /** Union of schema + observed custom_fields keys for the card-field picker. */
  const availableFields = useMemo(() => {
    const set = new Set<string>();
    for (const f of schemaFields) {
      if (!f.key || isKanbanInternalCustomFieldKey(f.key)) continue;
      if (f.key === groupWriteFieldKey) continue;
      if (f.key === KANBAN_ORDER_KEY || f.key === KANBAN_STAGE_KEY) continue;
      set.add(f.key);
    }
    for (const e of entries) {
      const cf = (e.custom_fields || {}) as Record<string, unknown>;
      for (const k of Object.keys(cf)) {
        if (isKanbanInternalCustomFieldKey(k)) continue;
        if (k === groupWriteFieldKey) continue;
        if (k === KANBAN_ORDER_KEY || k === KANBAN_STAGE_KEY) continue;
        set.add(k);
      }
    }
    return Array.from(set).sort();
  }, [entries, schemaFields, groupWriteFieldKey]);

  // Sensors: desktop uses tiny distance so clicks vs drags split cleanly
  // (under 4px = click → onClick on the card; 4+ px = drag activates and
  // the browser suppresses the trailing click). Touch waits 200ms with a
  // 5px tolerance so taps and vertical scrolling aren't grabbed as drags.
  // Keyboard sensor adds a11y: Space picks up, arrows move, Space drops.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  /** Active drag id — entry id for card drags, or `col:<key>` for column
   *  drags. We branch on this in the drag handlers via `isColumnId`. */
  const [activeId, setActiveId] = useState<string | null>(null);
  const isDragging = activeId !== null;
  const isColumnDrag = isColumnId(activeId);

  /** Optimistic column order while a column is being dragged. Mirrors
   *  the `columns` prop when idle; mutated inside `onDragOver` so the
   *  outer `horizontalListSortingStrategy` can animate siblings sliding
   *  apart. On drop we persist the new array via `onViewUpdate`. */
  const [localColumns, setLocalColumns] = useState<KanbanColumn[]>(columns);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [columnError, setColumnError] = useState('');
  const [dropPrompt, setDropPrompt] = useState<{
    entry: Entry;
    action: ResolvedKanbanDrop;
  } | null>(null);
  const [dropBusy, setDropBusy] = useState(false);
  const [dropError, setDropError] = useState('');
  useEffect(() => {
    if (isColumnId(activeId)) return;
    setLocalColumns(current => replaceEqualDeep(current, columns));
  }, [columns, activeId]);

  const [sprintFilter, setSprintFilter] = useState<string>('all');

  const visibleEntries = useMemo(() => {
    if (sprintFilter === 'all' || !sprintField) return entries;
    return entries.filter(e => {
      const sp = (e.custom_fields as Record<string, unknown> | undefined)?.sprint;
      if (sprintFilter === '__none__') {
        return !sp || (Array.isArray(sp) && sp.length === 0);
      }
      if (Array.isArray(sp)) {
        return sp.includes(sprintFilter);
      }
      return sp === sprintFilter;
    });
  }, [entries, sprintFilter, sprintField]);

  const sprintFilterOptions = useMemo(() => {
    const list: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    for (const target of sprintTargets) {
      if (target.id && !seen.has(target.id)) {
        seen.add(target.id);
        list.push({ id: target.id, label: target.label });
      }
    }
    for (const id of observedSprintIds) {
      if (!seen.has(id)) {
        seen.add(id);
        list.push({ id, label: `Sprint ${id.slice(-6)}` });
      }
    }
    return list;
  }, [sprintTargets, observedSprintIds]);

  /** Single source of truth for the rendered card lists per column.
   *  Mirrors `entries` grouped + sorted by `_kanban_order` when idle;
   *  mutated optimistically inside `onDragOver` to move the active card
   *  to its projected slot. dnd-kit's `verticalListSortingStrategy`
   *  reads per-column item ids from this state and animates sibling
   *  transforms — no parallel display computation, no flicker. */
  const [localCols, setLocalCols] = useState<Record<string, Entry[]>>(() =>
    groupAndSort(visibleEntries, columns, groupBy)
  );

  // Re-sync from props when no card drag is in flight. (Column drags
  // don't change card placement, so they shouldn't gate this resync.)
  useEffect(() => {
    if (activeId && !isColumnId(activeId)) return;
    const next = groupAndSort(visibleEntries, columns, groupBy);
    setLocalCols(current => {
      const keys = Object.keys(next);
      const unchanged = keys.length === Object.keys(current).length && keys.every(key =>
        current[key]?.length === next[key].length &&
        next[key].every((entry, index) => current[key][index] === entry)
      );
      return unchanged ? current : next;
    });
  }, [visibleEntries, columns, groupBy, activeId]);

  const activeEntry = useMemo(() => {
    if (!activeId) return null;
    for (const col of columns) {
      const found = localCols[col.key]?.find(e => e.id === activeId);
      if (found) return found;
    }
    return entries.find(e => e.id === activeId) || null;
  }, [activeId, columns, localCols, entries]);

  const persistView = (patch: Partial<SavedView['config']>) => {
    if (!onViewUpdate) return;
    onViewUpdate({
      ...view,
      config: {
        ...(view.config || {}),
        ...(patch as Record<string, unknown>)
      }
    });
  };

  const persistColumns = (next: KanbanColumn[]) => {
    persistView({ kanban_columns: next });
  };

  /** Track the last valid "over" id across renders so the custom
   *  collision strategy can keep the previous target when the pointer
   *  briefly leaves all droppables (e.g. between gap pixels). */
  const lastOverId = useRef<string | null>(null);

  /** Custom collision detection — adapted from dnd-kit's official
   *  multi-container kanban example.
   *
   *  1. Filter out the active card so the cursor never picks itself as
   *     `over` (root cause of intermittent within-column sort failures
   *     where `closestCorners` chose the active card's transformed box).
   *  2. Prefer `pointerWithin` (pointer is literally inside a droppable)
   *     for accurate column-body targeting on empty columns.
   *  3. Fall back to `rectIntersection` (overlap between boxes), then
   *     `closestCenter` (nearest center) so dragging in gutters still
   *     resolves to the most sensible card. */
  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      // Filter the active item out so it can't pick itself; also scope
      // droppables to the right type — column drags only collide with
      // other column wrappers (ids prefixed `col:`); card drags only
      // collide with non-column droppables (other cards + column bodies).
      const activeIsColumn = isColumnId(activeId);
      const droppable = args.droppableContainers.filter(c => {
        const id = String(c.id);
        if (id === activeId) return false;
        if (activeIsColumn) return isColumnId(id);
        return !isColumnId(id);
      });
      const filteredArgs = { ...args, droppableContainers: droppable };

      const pointer = pointerWithin(filteredArgs);
      let collisions =
        pointer.length > 0 ? pointer : rectIntersection(filteredArgs);
      if (collisions.length === 0) {
        collisions = closestCenter(filteredArgs);
      }
      const overId = getFirstCollision(collisions, 'id');
      if (overId != null) {
        lastOverId.current = String(overId);
        return collisions;
      }
      // Pointer is in a gutter — keep the previous over so the active
      // item doesn't flicker back to its source slot mid-drag.
      if (lastOverId.current) {
        const fallback = droppable.find(c => String(c.id) === lastOverId.current);
        if (fallback) return [{ id: fallback.id }];
      }
      return [];
    },
    [activeId]
  );

  const handleDragStart = (e: DragStartEvent) => {
    lastOverId.current = null;
    setActiveId(String(e.active.id));
  };

  /** Card drag: only handle cross-column moves here — mutating
   *  `localCols` mid-drag for same-column reorders fights dnd-kit's
   *  `verticalListSortingStrategy`. Same-column reorder is committed
   *  once in `handleDragEnd`.
   *  Column drag: mirror `arrayMove` into `localColumns` so the outer
   *  `horizontalListSortingStrategy` animates the sliding columns.
   *  Persistence happens in `handleDragEnd`. */
  const handleDragOver = (event: DragOverEvent) => {
    if (!isEditor) return;
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overId = String(over.id);
    if (overId === '__burn__') return;
    if (overId === activeIdStr) return;

    if (isColumnId(activeIdStr)) {
      // Column reorder is committed once in handleDragEnd. Mutating
      // localColumns here mid-drag fights horizontalListSortingStrategy
      // (which animates siblings via transforms) — the array gets one
      // step ahead of the cursor, producing off-by-one drops.
      return;
    }

    setLocalCols(prev => {
      const sourceCol = findColumnOf(prev, activeIdStr);
      if (!sourceCol) return prev;

      let targetCol: string | undefined;
      if (isBoardColumnKey(overId, columns, prev)) {
        targetCol = overId;
      } else {
        targetCol = findColumnOf(prev, overId);
      }
      if (!targetCol) return prev;

      // Same-column: leave to the sortable strategy + drag-end commit.
      if (sourceCol === targetCol) return prev;

      const activeEntryLocal = prev[sourceCol].find(e => e.id === activeIdStr);
      if (!activeEntryLocal) return prev;

      // Action columns (Paid → receive payment) and display-only columns
      // must not preview a status write. The card stays put until drop.
      const targetColumn = columns.find(c => c.key === targetCol);
      if (targetColumn) {
        const sourceKey = resolveEntryColumnKey(activeEntryLocal, columns, groupBy);
        const blocked = columnDropBlockReason(
          targetColumn,
          sourceKey,
          columns.find(c => c.key === sourceKey)?.label || sourceKey,
          key => columns.find(c => c.key === key)?.label || key
        );
        if (blocked || targetColumn.on_drop) return prev;
      }

      // Cross-column: splice active into target at the projected slot.
      const newSource = prev[sourceCol].filter(e => e.id !== activeIdStr);
      const targetList = [...prev[targetCol]];
      const overIdx = targetList.findIndex(e => e.id === overId);
      const insertAt = overIdx >= 0 ? overIdx : targetList.length;
      targetList.splice(insertAt, 0, activeEntryLocal);
      return { ...prev, [sourceCol]: newSource, [targetCol]: targetList };
    });
  };

  const invokeColumnDrop = useCallback(
    async (
      appId: string,
      action: ResolvedKanbanDrop,
      card: Entry,
      input: Record<string, string>
    ) => {
      const invalid = validateDropInput(action, card, input);
      if (invalid) {
        setDropError(invalid);
        showToast(invalid, 'error');
        return;
      }
      setDropBusy(true);
      setDropError('');
      const pendingId = showPendingToast(`${action.title}…`);
      try {
        const payload = buildDropPayload(action.payload, card, input, action.fields);
        if (action.bindDocument) {
          payload.document_id = payload.document_id || card.id;
          payload.entry_id = payload.entry_id || card.id;
        }
        const result = await extensionsApi.invokeOperation(
          appId,
          action.operation,
          payload
        );
        if (result.output_disposition === 'withheld') {
          resolveToast(pendingId, RECORDED_OUTPUT_WITHHELD_MESSAGE, 'info');
        } else {
          const failed = dropOperationError(result.output);
          if (failed) throw new Error(failed);
          resolveToast(pendingId, action.successMessage, 'success');
        }
        setDropPrompt(null);
        if (track?.id) {
          await queryClient.invalidateQueries({
            queryKey: ['track', track.id, 'entries'],
          });
        }
      } catch (err) {
        const message = toToastMessage(err, 'The action failed');
        setDropError(message);
        resolveToast(pendingId, message, 'error');
      } finally {
        setDropBusy(false);
      }
    },
    [queryClient, resolveToast, showPendingToast, showToast, track?.id]
  );

  const runColumnDrop = useCallback(
    async (card: Entry, column: KanbanColumn) => {
      const action = resolveKanbanDrop(column.on_drop);
      if (!action) {
        showToast('This column has no drop action.', 'error');
        return;
      }
      const appId = track?.app?.id;
      if (!appId) {
        showToast('This board action needs the app that owns the track.', 'error');
        return;
      }
      if (action.mode === 'form') {
        setDropError('');
        setDropPrompt({ entry: card, action });
        return;
      }
      const ok = await confirm({
        title: action.title,
        message:
          action.confirm ||
          action.message ||
          `Update “${card.title || 'this card'}”?`,
        confirmLabel: action.confirmLabel,
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
      await invokeColumnDrop(appId, action, card, {});
    },
    [confirm, invokeColumnDrop, showToast, track?.app?.id]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const aId = activeId;
    setActiveId(null);
    const { active, over } = event;
    if (!over || !aId) return;

    const activeIdStr = String(active.id);
    const overId = String(over.id);

    // Column drag → reorder kanban_columns now (kept out of onDragOver
    // to avoid fighting horizontalListSortingStrategy). `over.id` is the
    // sibling column the cursor settled on; arrayMove gives the final
    // order, which we persist via onViewUpdate.
    if (isColumnId(activeIdStr)) {
      if (!onViewUpdate) return;
      if (!isColumnId(overId)) return;
      const fromKey = colKeyFromId(activeIdStr);
      const toKey = colKeyFromId(overId);
      const fromIdx = columns.findIndex(c => c.key === fromKey);
      const toIdx = columns.findIndex(c => c.key === toKey);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      const reordered = arrayMove(columns, fromIdx, toIdx);
      // Mirror into localColumns immediately so the post-persist re-sync
      // doesn't briefly snap the column back to its old spot.
      setLocalColumns(reordered);
      persistColumns(reordered);
      return;
    }

    // Burn barrel — delete entry (after confirm). Fire-and-forget so
    // dnd-kit can settle synchronously; we already reset activeId above.
    // The optimistic localCols still has the card in its source column
    // (burn isn't a column we move into), so view stays consistent.
    if (overId === '__burn__') {
      if (!isEditor || !onEntryDelete) return;
      const srcCol = findColumnOf(localCols, activeIdStr);
      const activeEntryLocal = srcCol
        ? localCols[srcCol].find(e => e.id === activeIdStr)
        : entries.find(e => e.id === activeIdStr);
      const title = activeEntryLocal?.title?.trim();
      void (async () => {
        const ok = await confirm({
          title: 'Delete entry',
          message: title
            ? `Delete “${title}”? This removes the entry and its comments. This cannot be undone.`
            : 'Delete this entry? This removes the entry and its comments. This cannot be undone.',
          confirmLabel: 'Delete',
          cancelLabel: 'Keep',
          variant: 'danger'
        });
        if (!ok) return;
        onEntryDelete(activeIdStr);
        const pendingId = showPendingToast('Deleting…');
        try {
          await entriesApi.delete(activeIdStr);
          resolveToast(pendingId, 'Entry deleted', 'success');
        } catch {
          resolveToast(pendingId, 'Failed to delete entry', 'error');
          onEntryDeleteFailed?.();
        }
      })();
      return;
    }

    if (!canUpdate) return;

    const overColumnKey = isBoardColumnKey(overId, columns, localCols)
      ? overId
      : findColumnOf(localCols, overId);
    const draggedEntry = (() => {
      const sourceKey = findColumnOf(localCols, activeIdStr);
      return (
        (sourceKey ? localCols[sourceKey]?.find(e => e.id === activeIdStr) : undefined) ||
        entries.find(e => e.id === activeIdStr)
      );
    })();
    if (draggedEntry && overColumnKey) {
      const sourceKey = resolveEntryColumnKey(draggedEntry, columns, groupBy);
      const targetColumn = columns.find(c => c.key === overColumnKey);
      if (targetColumn && sourceKey !== overColumnKey) {
        const blocked = columnDropBlockReason(
          targetColumn,
          sourceKey,
          columns.find(c => c.key === sourceKey)?.label || sourceKey,
          key => columns.find(c => c.key === key)?.label || key
        );
        if (blocked) {
          showToast(blocked, 'info');
          return;
        }
        if (targetColumn.on_drop) {
          void runColumnDrop(draggedEntry, targetColumn);
          return;
        }
      }
    }

    if (!commitEntry) return;

    // Locate the active card in optimistic state (onDragOver already
    // settled cross-column moves; same-column moves haven't yet).
    let targetCol: string | undefined;
    let targetIdx = -1;
    const columnKeys = [
      ...columns.map(c => c.key),
      ...(localCols[UNASSIGNED_COLUMN_KEY]?.length
        ? [UNASSIGNED_COLUMN_KEY]
        : []),
    ];
    for (const colKey of columnKeys) {
      const list = localCols[colKey] || [];
      const i = list.findIndex(e => e.id === activeIdStr);
      if (i >= 0) {
        targetCol = colKey;
        targetIdx = i;
        break;
      }
    }
    if (!targetCol) return;

    // Apply same-column reorder now (kept out of onDragOver to avoid
    // fighting verticalListSortingStrategy). `over.id` here is the
    // sibling card the cursor settled on; arrayMove yields the final
    // list.
    let finalList = localCols[targetCol];
    if (
      overId !== '__burn__' &&
      overId !== activeIdStr &&
      !isBoardColumnKey(overId, columns, localCols)
    ) {
      const overIdx = finalList.findIndex(e => e.id === overId);
      if (overIdx >= 0 && overIdx !== targetIdx) {
        finalList = arrayMove(finalList, targetIdx, overIdx);
        targetIdx = overIdx;
      }
    }

    const movedEntry = finalList[targetIdx];
    const sourceColKey = resolveEntryColumnKey(movedEntry, columns, groupBy);
    const indexMap = buildIndexMap(visibleEntries);
    const newOrder = computeOrder(finalList, targetIdx, indexMap);
    const oldOrder = getOrder(movedEntry);
    const columnChanged = sourceColKey !== targetCol;
    const orderChanged = Math.abs(newOrder - oldOrder) > 1e-9;

    if (!columnChanged && !orderChanged) return;

    const groupKey = resolveKanbanWriteFieldKey(groupBy, schemaFields);
    const newFields: Record<string, unknown> = {
      ...(movedEntry.custom_fields || {}),
      [KANBAN_ORDER_KEY]: newOrder
    };
    if (columnChanged) {
      if (targetCol === UNASSIGNED_COLUMN_KEY) {
        delete newFields[groupKey];
      } else {
        newFields[groupKey] = targetCol;
      }
    }

    const patched: Entry = {
      ...movedEntry,
      custom_fields: newFields
    };

    // Optimistically commit the same-column reorder (`finalList`) plus
    // the patched kanban_order so the post-drag re-sort from props lands
    // on the same visual position.
    const committedList = finalList.map(e =>
      e.id === activeIdStr ? patched : e
    );
    setLocalCols(prev => ({ ...prev, [targetCol!]: committedList }));

    void commitEntry(patched);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    // Restore optimistic state from props since the user aborted the
    // move — drop any mutations made during onDragOver.
    setLocalCols(groupAndSort(visibleEntries, columns, groupBy));
    setLocalColumns(columns);
  };

  const handleAddColumn = async () => {
    const label = newColumnName.trim();
    if (!label) {
      setColumnError('Enter a column name.');
      return;
    }
    if (columns.some(c => c.label.toLowerCase() === label.toLowerCase() || c.key.toLowerCase() === label.toLowerCase())) {
      setColumnError('That column already exists.');
      return;
    }
    const syncEnum = shouldSyncKanbanColumnEnumForView(groupBy, schemaFields);
    // Select field values are the board lane identities. Use the name itself
    // so the entry form and board always show the same choice.
    const key = syncEnum ? label : generateKanbanColumnKey(columns.map(c => c.key));
    const newCol: KanbanColumn = {
      key,
      label,
      color: 'border-t-[var(--text-subtle)]'
    };
    if (
      syncEnum &&
      onKanbanColumnEnumSync
    ) {
      const fieldKey = resolveKanbanWriteFieldKey(groupBy, schemaFields);
      try {
        await onKanbanColumnEnumSync({ fieldKey, columnKey: key });
      } catch {
        // Host surfaces the error toast; don't persist a column users can't post to.
        return;
      }
    }
    persistColumns([...columns, newCol]);
    setNewColumnName('');
    setColumnError('');
    setAddingColumn(false);
  };

  const handleRemoveColumn = async (colKey: string) => {
    const col = columns.find(c => c.key === colKey);
    const colLabel = col?.label || colKey;
    const cardsInCol = localCols[colKey]?.length || 0;
    if (cardsInCol > 0) {
      await confirm({
        title: 'Move cards before removing this column',
        message: `The “${colLabel}” column contains ${cardsInCol} card${cardsInCol === 1 ? '' : 's'}. Move them to another column first so they remain visible.`,
        confirmLabel: 'Keep column',
        cancelLabel: 'Close',
      });
      return;
    }
    const message = `Remove the “${colLabel}” column from this view? This does not delete the status option. If records use it later, the column will appear again.`;
    const ok = await confirm({
      title: 'Remove column',
      message,
      confirmLabel: 'Remove column',
      cancelLabel: 'Keep',
      variant: 'danger'
    });
    if (!ok) return;
    persistColumns(columns.filter(c => c.key !== colKey));
  };

  const handleRenameColumn = (colKey: string, label: string) => {
    if (columns.some(c => c.key !== colKey && c.label.toLowerCase() === label.toLowerCase())) return;
    persistColumns(columns.map(c => (c.key === colKey ? { ...c, label } : c)));
  };

  const handleRecolorColumn = (colKey: string, color: string) => {
    persistColumns(columns.map(c => (c.key === colKey ? { ...c, color } : c)));
  };

  const setDensity = (d: Density) => persistView({ density: d });
  const setCardFields = (next: string[]) => persistView({ card_fields: next });

  const groupByOptions = useMemo(
    () =>
      resolveKanbanGroupByEligibleFields(schemaFields).map(f => ({
        key: f.key,
        label: f.name || humanizeFieldKey(f.key) || f.key,
        groupBy: `custom_fields.${f.key}`,
      })),
    [schemaFields]
  );

  const setGroupBy = (nextGroupBy: string) => {
    const nextColumns = buildKanbanColumnsForGroupField(
      nextGroupBy,
      schemaFields,
      undefined,
      entries,
      resolveMemberLabel,
      resolveRelationLabel
    );
    persistView({
      group_by: nextGroupBy,
      kanban_columns: nextColumns.map(c => ({
        key: c.key,
        label: c.label || c.key,
      })),
    });
  };

  const groupKey = resolveKanbanWriteFieldKey(groupBy, schemaFields);
  /** Select value must match an option; heal legacy ``_kanban_stage`` to the
   *  write-field path so the control isn't blank with no way back. */
  const groupBySelectValue = useMemo(() => {
    if (groupByOptions.some(o => o.groupBy === groupBy)) return groupBy;
    const healed = `custom_fields.${groupKey}`;
    if (groupByOptions.some(o => o.groupBy === healed)) return healed;
    return groupByOptions[0]?.groupBy ?? groupBy;
  }, [groupBy, groupByOptions, groupKey]);
  const canEditConfig = !!(isEditor && onViewUpdate);
  const hasUnassigned = (localCols[UNASSIGNED_COLUMN_KEY]?.length ?? 0) > 0;
  const boardColumns = useMemo(
    () => (hasUnassigned ? [...localColumns, UNASSIGNED_COLUMN] : localColumns),
    [localColumns, hasUnassigned]
  );

  return (
    <div>
      {(sprintField || canEditConfig) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {sprintField ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor="kanban-sprint-filter"
                className="text-xs font-medium text-[var(--text-muted)] flex items-center gap-1.5"
              >
                <span>Sprint:</span>
                <select
                  id="kanban-sprint-filter"
                  value={sprintFilter}
                  onChange={e => setSprintFilter(e.target.value)}
                  className="rounded border border-[var(--panel-border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs text-[var(--text)] font-normal focus:outline-none focus:ring-1 focus:ring-[var(--brand-accent)]"
                  aria-label="Filter tasks by sprint"
                >
                  <option value="all">All Sprints</option>
                  {sprintFilterOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                  <option value="__none__">Backlog (No Sprint)</option>
                </select>
              </label>
              {sprintFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSprintFilter('all')}
                  className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
                >
                  Reset
                </button>
              )}
            </div>
          ) : (
            <div />
          )}
          {canEditConfig && (
            <div className="flex items-center justify-end gap-2">
              <BoardSettings
                density={density}
                setDensity={setDensity}
                groupBy={groupBySelectValue}
                groupByOptions={groupByOptions}
                setGroupBy={setGroupBy}
                availableFields={availableFields}
                cardFields={cardFields}
                setCardFields={setCardFields}
              />
            </div>
          )}
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* B-ENT-06: always-visible thin scrollbar so users see when the
            board overflows past 4-5 columns. Firefox uses scrollbar-width,
            Webkit-based browsers use the ::-webkit-scrollbar pseudo
            (defined in index.css under .kanban-board-scroll). */}
        <div
          className="kanban-board-scroll -mx-4 md:mx-0 overflow-x-auto pb-3"
          style={{ scrollbarWidth: 'thin' }}
        >
          <div
            className="
              flex gap-3 px-4 md:px-0
              snap-x snap-proximity
              min-w-min
            "
          >
            <SortableContext
              items={localColumns.map(c => COL_ID_PREFIX + c.key)}
              strategy={horizontalListSortingStrategy}
            >
              {boardColumns.map(col => {
                const isUnassigned = col.key === UNASSIGNED_COLUMN_KEY;
                return (
                  <SortableColumn
                    key={col.key}
                    col={col}
                    count={localCols[col.key]?.length || 0}
                    canEditConfig={canEditConfig && !isUnassigned}
                    canRename={
                      canEditConfig && !isUnassigned &&
                      !shouldSyncKanbanColumnEnumForView(groupBy, schemaFields)
                    }
                    canRemove={
                      canEditConfig && localColumns.length > 1 && !isUnassigned
                    }
                    columnDraggable={!isUnassigned}
                    onRename={label => handleRenameColumn(col.key, label)}
                    onRecolor={color => handleRecolorColumn(col.key, color)}
                    onRemove={() => handleRemoveColumn(col.key)}
                  >
                    <KanbanColumnBody
                      colKey={col.key}
                      entries={localCols[col.key] || []}
                      onEntryOpen={onEntryOpen}
                      density={density}
                      cardFields={cardFields}
                      cardTemplate={cardTemplate}
                      relationFields={relationFields}
                      fieldSpecsByKey={fieldSpecsByKey}
                      resolveMemberLabel={resolveMemberLabel}
                      dragEnabled={canUpdate}
                    />
                    {!isUnassigned && isEditor && (
                      <AddCard
                        colKey={col.key}
                        groupKey={groupKey}
                        entryTypeKey={createEntryTypeKey}
                        onCreate={onEntryCreate}
                        extraCustomFields={
                          sprintFilter !== 'all' && sprintFilter !== '__none__'
                            ? { sprint: sprintFilter }
                            : undefined
                        }
                      />
                    )}
                  </SortableColumn>
                );
              })}
            </SortableContext>

            {canEditConfig && (
              addingColumn ? (
                <form
                  onSubmit={e => { e.preventDefault(); void handleAddColumn(); }}
                  className="flex-shrink-0 w-[80vw] max-w-[18rem] md:w-72 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-3 snap-start"
                >
                  <input
                    autoFocus
                    aria-label="New column name"
                    value={newColumnName}
                    onChange={e => { setNewColumnName(e.target.value); setColumnError(''); }}
                    placeholder="Column name"
                    className="w-full rounded border border-[var(--panel-border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text)]"
                  />
                  {columnError && <p role="alert" className="mt-1 text-xs text-[var(--danger-fg)]">{columnError}</p>}
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => { setAddingColumn(false); setColumnError(''); setNewColumnName(''); }} className="text-sm text-[var(--text-muted)]">Cancel</button>
                    <button type="submit" className="rounded bg-[var(--brand-accent)] px-2 py-1 text-sm text-[var(--on-accent,white)]">Add</button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingColumn(true)}
                  className="flex-shrink-0 w-[80vw] max-w-[18rem] md:w-72 h-24 border-2 border-dashed border-[var(--panel-border)] rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors snap-start"
                >
                  <Plus size={18} />
                  <span className="ml-2 text-sm">Add column</span>
                </button>
              )
            )}

            {isDragging && !isColumnDrag && isEditor && onEntryDelete && (
              <div className="flex items-end pb-3 self-stretch snap-start">
                <BurnBarrel />
              </div>
            )}
          </div>
        </div>
        {/* DragOverlay portal: renders a clone of the grabbed card
            under the pointer so the user can see what they're moving.
            The original card in `localCols` stays in its projected
            slot as a faint placeholder (opacity 0.35). dropAnimation
            is null because the optimistic state already has the card
            at its final slot — animating the overlay back to the
            source position would visibly recoil against the new
            position. Instead the overlay disappears at drop and the
            real card is already where it should be. */}
        <DragOverlay dropAnimation={null}>
          {isColumnDrag && activeId ? (() => {
            const draggedCol = localColumns.find(
              c => c.key === colKeyFromId(activeId)
            );
            if (!draggedCol) return null;
            const cardCount = localCols[draggedCol.key]?.length || 0;
            return (
              <div
                className={`flex-shrink-0 w-72 bg-[var(--panel)] rounded-lg border-t-4 ${draggedCol.color || 'border-t-[var(--text-subtle)]'} border border-[var(--brand-accent)]/60 shadow-xl rotate-1 cursor-grabbing`}
              >
                <div className="px-3 py-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--text)] truncate">
                    {draggedCol.label}
                  </h3>
                  <span className="text-xs bg-[var(--panel-2)] text-[var(--text-muted)] px-2 py-0.5 rounded">
                    {cardCount}
                  </span>
                </div>
                <div className="px-3 pb-3 text-xs text-[var(--text-subtle)] italic">
                  {cardCount} {cardCount === 1 ? 'card' : 'cards'}
                </div>
              </div>
            );
          })() : activeEntry ? (
            <div className="flex items-stretch overflow-hidden bg-[var(--panel-2)] rounded-lg border border-[var(--brand-accent)]/60 shadow-xl rotate-1 cursor-grabbing">
              <CardBody
                entry={activeEntry}
                density={density}
                cardFields={cardFields}
                cardTemplate={cardTemplate}
                relationFields={relationFields}
                fieldSpecsByKey={fieldSpecsByKey}
                resolveMemberLabel={resolveMemberLabel}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <KanbanDropDialog
        entry={dropPrompt?.entry ?? null}
        action={dropPrompt?.action ?? null}
        busy={dropBusy}
        error={dropError}
        onClose={() => {
          if (dropBusy) return;
          setDropPrompt(null);
          setDropError('');
        }}
        onSubmit={input => {
          const appId = track?.app?.id;
          if (!dropPrompt || !appId) return;
          void invokeColumnDrop(appId, dropPrompt.action, dropPrompt.entry, input);
        }}
      />
    </div>
  );
}

export const KanbanWidget = KanbanWidgetInner;
