import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Avatar, AvatarStackedMeta, MarkdownContent } from '../ui';
import { MemberValue } from '../entries/members';
import { RelationValue } from '../entries/relations';
import type { ViewWidgetProps } from './types';
import type { Entry, OperationalModelFieldSpec } from '../../types';
import { formatRelativeTime } from '../../utils';
import { PLATFORM_ENTRY_FIELD_KEYS, resolveEntryFieldValue } from '../../utils/entryFieldValue';
import { humanizeEnumValue, humanizeFieldKey } from '../../utils/humanizeFieldKey';

interface TableColumn {
  field: string;
  label: string;
  width?: number;
  sortable?: boolean;
  /** Opt-in number formatting — 'currency'/'number' both render with
   *  thousands separators (same `Intl` convention summary_tiles' own
   *  `format: currency` already uses); plain numeric fields default to
   *  raw String(val) otherwise (unchanged behavior for every existing
   *  table view that doesn't set this). */
  format?: 'currency' | 'number';
}

type RelationByField = Record<string, NonNullable<OperationalModelFieldSpec['relation']>>;
type MemberFieldPaths = Set<string>;
/** `custom_fields.<key>` (or bare `<key>`) -> 'select' | 'multi_select', so
 *  the default cell renderer can humanize the raw stored enum value the
 *  same way every other select control in the app already displays it
 *  (SeamlessField's `resolveEnumOptionLabel`/`humanizeEnumValue`) instead
 *  of printing the raw snake/kebab-case value verbatim. */
type SelectFieldTypes = Map<string, 'select' | 'multi_select'>;

const DEFAULT_COLUMNS: TableColumn[] = [
  { field: 'title', label: 'Title / Content', sortable: true },
  { field: 'type', label: 'Type', sortable: true },
  { field: 'author', label: 'Author', sortable: false },
  { field: 'created_at', label: 'Date', sortable: true },
  { field: 'comments', label: 'Comments', sortable: true },
];

function getFieldValue(
  entry: Entry,
  field: string,
  commentCounts?: Record<string, number>
): unknown {
  const e = entry as unknown as Record<string, unknown>;
  if (field.startsWith('custom_fields.')) {
    return resolveEntryFieldValue(entry, field);
  }
  if (field.includes('.')) {
    const parts = field.split('.');
    let val: unknown = entry;
    for (const p of parts) {
      val = (val as Record<string, unknown>)?.[p];
      if (val === undefined) return '';
    }
    return val;
  }
  if (field === 'comments') {
    return commentCounts?.[entry.id] ?? entry.comment_count ?? 0;
  }
  const resolved = resolveEntryFieldValue(entry, field);
  const customFields = entry.custom_fields as Record<string, unknown> | undefined;
  if (
    PLATFORM_ENTRY_FIELD_KEYS.has(field) ||
    Object.prototype.hasOwnProperty.call(customFields ?? {}, field)
  ) {
    return resolved;
  }
  return e[field];
}

function renderCellValue(
  entry: Entry,
  column: TableColumn,
  commentCounts: Record<string, number> | undefined,
  relationByField: RelationByField,
  memberFieldPaths: MemberFieldPaths,
  selectFieldTypes: SelectFieldTypes,
) {
  switch (column.field) {
    case 'title':
      return (
        <>
          {entry.title ? (
            <>
              <p className="font-medium text-[var(--text)]">{entry.title}</p>
              {entry.body ? (
                <div className="text-xs text-[var(--text-muted)] max-w-xs mt-0.5 line-clamp-2 overflow-hidden">
                  <MarkdownContent compact>{entry.body}</MarkdownContent>
                </div>
              ) : null}
            </>
          ) : entry.body ? (
            <div className="text-[var(--text-muted)] max-w-xs line-clamp-2 overflow-hidden">
              <MarkdownContent compact>{entry.body}</MarkdownContent>
            </div>
          ) : null}
        </>
      );
    case 'type':
      return (
        <span className="text-xs capitalize bg-[var(--panel-2)] text-[var(--text-muted)] px-2 py-0.5 rounded">
          {entry.type}
        </span>
      );
    case 'author':
      return (
        <AvatarStackedMeta
          avatar={
            <Avatar
              name={
                entry.author?.display_name ||
                (entry.author_id ? `Member ${entry.author_id.slice(-6)}` : '?')
              }
              size="xs"
              url={entry.author?.avatar_url}
              attachmentId={entry.author?.avatar_attachment_id}
              userId={entry.author?.id}
              version={entry.author?.updated_at}
            />
          }
          primary={
            <span className="text-xs text-[var(--text-muted)] truncate max-w-[120px]">
              {entry.author?.display_name ||
                (entry.author_id ? `Member ${entry.author_id.slice(-6)}` : 'Unknown')}
            </span>
          }
        />
      );
    case 'created_at':
      return (
        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
          {formatRelativeTime(entry.created_at)}
        </span>
      );
    case 'comments':
      return (
        <span className="text-xs text-[var(--text-muted)]">
          {commentCounts?.[entry.id] ?? entry.comment_count ?? 0}
        </span>
      );
    default: {
      if (memberFieldPaths.has(column.field)) {
        const raw = getFieldValue(entry, column.field, commentCounts);
        if (raw == null || raw === '') {
          return <span className="text-xs italic opacity-60">—</span>;
        }
        return (
          <MemberValue
            value={raw}
            variant="cell"
            stopPropagation
          />
        );
      }
      const relation = relationByField[column.field];
      if (relation) {
        // column.field may be a dotted path (e.g. "custom_fields.department")
        // because TableColumn.field encodes the read path, not the bare key.
        // Reuse getFieldValue so the raw lookup handles both dotted and bare
        // forms consistently with non-relation columns.
        const raw = getFieldValue(entry, column.field, commentCounts);
        if (raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0)) {
          return <span className="text-xs italic opacity-60">—</span>;
        }
        return (
          <RelationValue
            value={raw}
            relation={relation}
            variant="cell"
            stopPropagation
          />
        );
      }
      const val = getFieldValue(entry, column.field, commentCounts);
      if (val === undefined || val === null) return <span className="text-[var(--text-muted)] text-xs">—</span>;
      if (typeof val === 'boolean') return val ? 'Yes' : 'No';
      const selectType = selectFieldTypes.get(column.field);
      if (selectType === 'multi_select' && Array.isArray(val)) {
        if (val.length === 0) return <span className="text-[var(--text-muted)] text-xs">—</span>;
        return (
          <span className="text-sm text-[var(--text)]">
            {val.map(v => humanizeEnumValue(String(v))).join(', ')}
          </span>
        );
      }
      if (typeof val === 'object') return <span className="text-xs text-[var(--text-muted)]">{JSON.stringify(val)}</span>;
      if (typeof val === 'number' && (column.format === 'currency' || column.format === 'number')) {
        return (
          <span className="text-sm text-[var(--text)]">
            {val.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        );
      }
      if (selectType === 'select' && typeof val === 'string') {
        return <span className="text-sm text-[var(--text)]">{humanizeEnumValue(val)}</span>;
      }
      return <span className="text-sm text-[var(--text)]">{String(val)}</span>;
    }
  }
}

function TableWidgetInner({
  entries,
  view,
  fields,
  onEntryOpen,
  commentCounts
}: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const rawColumns = config.columns as TableColumn[] | undefined;

  const relationByField = useMemo<RelationByField>(() => {
    const out: RelationByField = {};
    for (const f of fields ?? []) {
      if (String(f.type || '').toLowerCase() === 'relation' && f.relation) {
        if (!PLATFORM_ENTRY_FIELD_KEYS.has(f.key)) out[f.key] = f.relation;
        out[`custom_fields.${f.key}`] = f.relation;
      }
    }
    return out;
  }, [fields]);

  const memberFieldPaths = useMemo<MemberFieldPaths>(() => {
    const out = new Set<string>();
    for (const f of fields ?? []) {
      if (String(f.type || '').toLowerCase() === 'member') {
        if (!PLATFORM_ENTRY_FIELD_KEYS.has(f.key)) out.add(f.key);
        out.add(`custom_fields.${f.key}`);
      }
    }
    return out;
  }, [fields]);

  const selectFieldTypes = useMemo<SelectFieldTypes>(() => {
    const out: SelectFieldTypes = new Map();
    for (const f of fields ?? []) {
      const t = String(f.type || '').toLowerCase();
      if (t === 'select' || t === 'multi_select') {
        if (!PLATFORM_ENTRY_FIELD_KEYS.has(f.key)) out.set(f.key, t);
        out.set(`custom_fields.${f.key}`, t);
      }
    }
    return out;
  }, [fields]);

  // A saved column only needs a field path. Resolve its display label from
  // current schema metadata rather than persisting a second copy of that name.
  const columns = useMemo<TableColumn[]>(() => {
    const configured = Array.isArray(rawColumns) && rawColumns.length > 0
      ? rawColumns : DEFAULT_COLUMNS;
    return configured.map(column => {
      const key = column.field.replace(/^custom_fields\./u, '');
      const explicit = typeof column.label === 'string' ? column.label.trim() : '';
      const schemaLabel = fields?.find(field => field.key === key)?.name;
      const label = explicit
        || (typeof schemaLabel === 'string' ? schemaLabel.trim() : '')
        || DEFAULT_COLUMNS.find(defaultColumn => defaultColumn.field === column.field)?.label
        || humanizeFieldKey(key.replace(/\./gu, ' '))
        || 'Column';
      return { ...column, label };
    });
  }, [rawColumns, fields]);

  // Each saved view/schema owns its column choices. A sibling view may
  // share some fields while prescribing additional columns of its own.
  const columnSelectionKey = JSON.stringify([view.id, columns.map(c => c.field)]);
  const [visibleColumnSelections, setVisibleColumnSelections] = useState<Record<string, Set<string>>>({});
  const visibleColumns = useMemo(
    () => visibleColumnSelections[columnSelectionKey] ?? new Set(columns.map(c => c.field)),
    [visibleColumnSelections, columnSelectionKey, columns]
  );

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [resizing, setResizing] = useState<{ field: string; startX: number; startWidth: number } | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  const visibleCols = useMemo(
    () => columns.filter(c => visibleColumns.has(c.field)),
    [columns, visibleColumns]
  );

  const sortedEntries = useMemo(() => {
    if (!sortField) return entries;
    return [...entries].sort((a, b) => {
      const aVal = getFieldValue(a, sortField, commentCounts);
      const bVal = getFieldValue(b, sortField, commentCounts);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDir === 'asc' ? 1 : -1;
      if (bVal == null) return sortDir === 'asc' ? -1 : 1;
      if (sortField === 'comments') {
        const an = Number(aVal);
        const bn = Number(bVal);
        const cmp = an === bn ? 0 : an < bn ? -1 : 1;
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [entries, sortField, sortDir, commentCounts]);

  const handleSort = useCallback(
    (field: string) => {
      const col = columns.find(c => c.field === field);
      if (!col?.sortable) return;
      if (sortField === field) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [columns, sortField]
  );

  const handleMouseDown = useCallback(
    (field: string, e: React.MouseEvent) => {
      const th = (e.target as HTMLElement).closest('th');
      if (!th) return;
      setResizing({
        field,
        startX: e.clientX,
        startWidth: th.offsetWidth
      });
    },
    []
  );

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const newWidth = Math.max(60, resizing.startWidth + delta);
      setColWidths(prev => ({ ...prev, [resizing.field]: newWidth }));
    };

    const handleMouseUp = () => setResizing(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const toggleColumn = (field: string) => {
    setVisibleColumnSelections(prev => {
      const next = new Set(prev[columnSelectionKey] ?? columns.map(c => c.field));
      if (next.has(field)) {
        if (next.size > 1) next.delete(field);
      } else {
        next.add(field);
      }
      return { ...prev, [columnSelectionKey]: next };
    });
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--entry-table-border)] bg-[var(--panel)] shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--entry-table-divider)] bg-[var(--entry-table-toolbar)] px-3 py-2.5 md:px-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-[var(--text-muted)] shrink-0">Columns:</span>
          {/* Toggle row scrolls horizontally on mobile so it never wraps
              into 3+ lines and pushes content off-screen. */}
          <div className="flex flex-nowrap md:flex-wrap gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {columns.map(col => (
              <button
                key={col.field}
                type="button"
                onClick={() => toggleColumn(col.field)}
                aria-pressed={visibleColumns.has(col.field)}
                className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-input)] border px-2.5 py-1 text-xs transition-colors hover:border-[var(--text-subtle)] ${visibleColumns.has(col.field) ? 'border-[var(--entry-table-border)] bg-[var(--panel)] text-[var(--text)]' : 'border-transparent text-[var(--text-muted)]'}`}
              >
                {visibleColumns.has(col.field) ? (
                  <Eye size={10} className="text-[var(--text-muted)]" />
                ) : (
                  <EyeOff size={10} className="text-[var(--text-muted)]" />
                )}
                {col.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop / md+: classic table with horizontal scroll fallback if
          column count exceeds viewport. */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-[var(--entry-table-border)] bg-[var(--entry-table-header)]">
              {visibleCols.map(col => (
                <th
                  key={col.field}
                  className="relative select-none px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]"
                  style={colWidths[col.field] ? { width: colWidths[col.field] } : col.width ? { width: col.width } : undefined}
                  aria-sort={col.sortable && sortField === col.field ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button
                    type="button"
                    disabled={!col.sortable}
                    onClick={() => handleSort(col.field)}
                    className="flex items-center gap-1 text-left disabled:cursor-default enabled:hover:text-[var(--text)]"
                  >
                    {col.label}
                    {col.sortable && sortField === col.field && (
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>
                  {col.sortable && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--text-muted)]/20"
                      onMouseDown={e => handleMouseDown(col.field, e)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry, i) => (
              <tr
                key={entry.id}
                onClick={() => onEntryOpen(entry)}
                className={`cursor-pointer border-b border-[var(--entry-table-divider)] last:border-b-0 hover:bg-[var(--entry-table-row-hover)] transition-colors ${
                  i % 2 === 0 ? '' : 'bg-[var(--entry-table-row-alt)]'
                }`}
              >
                {visibleCols.map(col => (
                  <td key={col.field} className="px-4 py-3">
                    {renderCellValue(entry, col, commentCounts, relationByField, memberFieldPaths, selectFieldTypes)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked card layout. Each row becomes a card with the
          first visible column as the headline (top) and the remaining
          fields as labelled key/value rows. No horizontal scroll, all
          fields visible, full-width tap target. */}
      <ul className="divide-y divide-[var(--entry-table-divider)] md:hidden">
        {sortedEntries.map((entry, i) => {
          const [headCol, ...restCols] = visibleCols;
          return (
            <li key={entry.id} className={i % 2 === 0 ? '' : 'bg-[var(--entry-table-row-alt)]'}>
              <button
                type="button"
                onClick={() => onEntryOpen(entry)}
                className="block w-full px-4 py-3 text-left transition-colors hover:bg-[var(--entry-table-row-hover)] focus-visible:bg-[var(--entry-table-row-hover)] focus-visible:outline-none"
              >
                {headCol ? (
                  <div className="min-w-0">
                    {renderCellValue(entry, headCol, commentCounts, relationByField, memberFieldPaths, selectFieldTypes)}
                  </div>
                ) : null}
                {restCols.length > 0 ? (
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                    {restCols.map(col => (
                      <FragmentRow
                        key={col.field}
                        label={col.label}
                        value={renderCellValue(entry, col, commentCounts, relationByField, memberFieldPaths, selectFieldTypes)}
                      />
                    ))}
                  </dl>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {sortedEntries.length === 0 && (
        <div className="p-8 text-center text-sm text-[var(--text-muted)]">
          No entries to display.
        </div>
      )}
    </div>
  );
}

/** Renders a single label/value pair as adjacent dt/dd cells inside the
 *  parent CSS grid. Kept as a separate component because dt/dd must be
 *  immediate children of dl for valid HTML and accessible semantics. */
function FragmentRow({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-[var(--text-subtle)] uppercase tracking-wide font-medium pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0 text-[var(--text-muted)] break-words">{value}</dd>
    </>
  );
}

export const TableWidget = TableWidgetInner;
