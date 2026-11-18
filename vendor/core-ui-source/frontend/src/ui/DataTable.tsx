/**
 * DataTable — rows and columns for an App's own data (calculated or fetched), drawn like Core's native table views.
 *
 * Built in so Apps never draw or style tables: sorting, paging, columns that stay in view (left or right),
 * grouped column headings, section rows with subtotals, a totals row, row highlights, right-aligned amounts,
 * compact spacing and a column picker with presets.
 *
 * Layer: Primitive (Layer 1).
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, Pin } from 'lucide-react';
import { Button } from '../components/ui/Button';

export interface DataTableColumn<Row = Record<string, unknown>> {
  key: string;
  label: ReactNode;
  /** `end` right-aligns the column and uses tabular figures: use it for amounts. */
  align?: 'start' | 'end';
  sortable?: boolean;
  /** Sort by this instead of `row[key]`. */
  sortValue?: (row: Row) => string | number | null | undefined;
  /** Keep this column in view while the table scrolls sideways: `start` (or true) on the left, `end` on the right. */
  pinned?: boolean | 'start' | 'end';
  /** CSS width, for example `10rem`. Pinned columns default to `10rem`; right-pinned to `9rem`. */
  width?: string;
  /** Key of one of the table's `groups`; consecutive columns of a group share a heading. */
  group?: string;
  /** Draw the cell as a link-styled name; with `onRowClick` it opens the row. */
  emphasis?: 'link';
  render?: (row: Row) => ReactNode;
  /** Cell for the totals row and subtotal rows. A function receives the rows being added up. */
  total?: ReactNode | ((rows: Row[]) => ReactNode);
}

export interface DataTableSort { key: string; direction: 'asc' | 'desc' }
export interface DataTableGroup { key: string; label: string }
export interface DataTablePreset { label: string; keys: string[] }

export interface DataTableProps<Row = Record<string, unknown>> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Names the table for assistive technology. */
  caption: string;
  /** Headings for column `group`s. */
  groups?: DataTableGroup[];
  /** Start sorted this way. The user can change it on sortable columns. */
  defaultSort?: DataTableSort | null;
  /** Rows per page; omit to show every row. */
  pageSize?: number;
  onRowClick?: (row: Row) => void;
  /** Shown when there are no rows. */
  empty?: ReactNode;
  /** Scroll the body inside this height (CSS value) and keep the header in view. */
  maxHeight?: string;
  /** `compact` is the dense sheet spacing. */
  density?: 'comfortable' | 'compact';
  /** Tint a row that needs attention. */
  rowTone?: (row: Row) => 'danger' | 'warn' | undefined;
  /** A label row appears whenever this changes. Pass rows already grouped. */
  sectionBy?: (row: Row) => string | undefined;
  /** Add a subtotal row after each section (uses each column's `total`). */
  sectionTotals?: boolean;
  /** Let people choose which columns show, with quick presets; `persistKey` remembers it in this browser. */
  columnPicker?: { presets?: DataTablePreset[]; persistKey?: string };
  /** Narrowest the table is drawn before it scrolls sideways (CSS value). Default `600px`; use `0` for a narrow card. */
  minWidth?: string;
  /** Let people pin a column to the right edge from its heading. */
  pinnable?: boolean;
  /** Shown above the table, left of the column button. */
  toolbar?: ReactNode;
}

const PIN_START = '10rem';
const PIN_END = '9rem';
const compare = (a: unknown, b: unknown) => {
  const missingA = a === null || a === undefined || a === '', missingB = b === null || b === undefined || b === '';
  if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1; // empty values sort last
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};
const side = (c: { pinned?: boolean | 'start' | 'end' }) => (c.pinned === 'end' ? 'end' : c.pinned ? 'start' : null);
const toneBackground = (tone: 'danger' | 'warn' | undefined, base: string) =>
  tone === 'danger' ? `color-mix(in srgb, var(--danger-bg) 45%, ${base})` : tone === 'warn' ? `color-mix(in srgb, var(--warn-bg) 45%, ${base})` : base;

function readPrefs(key?: string): { hidden: string[]; pins: string[] } | null {
  if (!key) return null;
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (v && Array.isArray(v.hidden) && Array.isArray(v.pins)) return v; } catch { /* no storage */ }
  return null;
}

export function DataTable<Row extends object = Record<string, unknown>>({
  columns, rows, rowKey, caption, groups = [], defaultSort = null, pageSize, onRowClick, empty, maxHeight, density = 'comfortable',
  rowTone, sectionBy, sectionTotals, columnPicker, pinnable, toolbar, minWidth = '600px',
}: DataTableProps<Row>) {
  const stored = useMemo(() => readPrefs(columnPicker?.persistKey), [columnPicker?.persistKey]);
  const [sort, setSort] = useState<DataTableSort | null>(defaultSort);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<string[]>(stored?.hidden ?? []);
  const [pins, setPins] = useState<string[]>(stored?.pins ?? columns.filter(c => side(c) === 'end').map(c => c.key));
  const [menu, setMenu] = useState(false);
  const [moreRight, setMoreRight] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const remember = (nextHidden: string[], nextPins: string[]) => {
    setHidden(nextHidden); setPins(nextPins);
    if (columnPicker?.persistKey) { try { localStorage.setItem(columnPicker.persistKey, JSON.stringify({ hidden: nextHidden, pins: nextPins })); } catch { /* no storage */ } }
  };

  // Columns in display order: start-pinned first, then the rest, then right-pinned (also the ones a person pinned).
  const visible = useMemo(() => {
    const shown = columns.filter(c => !hidden.includes(c.key));
    const isEnd = (c: DataTableColumn<Row>) => side(c) !== 'start' && (side(c) === 'end' || pins.includes(c.key));
    return [...shown.filter(c => side(c) === 'start'), ...shown.filter(c => side(c) !== 'start' && !isEnd(c)), ...shown.filter(isEnd)];
  }, [columns, hidden, pins]);
  const sideOf = (c: DataTableColumn<Row>) => (side(c) === 'start' ? 'start' : side(c) === 'end' || pins.includes(c.key) ? 'end' : null);

  const sorted = useMemo(() => {
    const column = sort ? columns.find(c => c.key === sort.key) : undefined;
    if (!sort || !column) return rows;
    const value = (row: Row) => column.sortValue ? column.sortValue(row) : (row as Record<string, unknown>)[column.key];
    const factor = sort.direction === 'desc' ? -1 : 1;
    return [...rows].sort((x, y) => {
      const a = value(x), b = value(y);
      const missing = a === null || a === undefined || a === '' || b === null || b === undefined || b === '';
      return missing ? compare(a, b) : factor * compare(a, b); // empty values stay last either way
    });
  }, [rows, columns, sort]);
  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const shown = pageSize ? sorted.slice(current * pageSize, (current + 1) * pageSize) : sorted;

  // Pinned columns sit next to the edge they belong to, each after the pinned columns before it.
  const startOffsets: Record<string, string> = {}, endOffsets: Record<string, string> = {};
  let left = '0rem'; let right = '0rem';
  for (const c of visible) if (sideOf(c) === 'start') { startOffsets[c.key] = left; left = `calc(${left} + ${c.width || PIN_START})`; }
  for (const c of [...visible].reverse()) if (sideOf(c) === 'end') { endOffsets[c.key] = right; right = `calc(${right} + ${c.width || PIN_END})`; }
  const lastStart = [...visible].filter(c => sideOf(c) === 'start').pop()?.key;
  const firstEnd = visible.find(c => sideOf(c) === 'end')?.key;

  const hasGroups = visible.some(c => c.group) || visible.some(c => sideOf(c) === 'end');
  const bands: { label: string; span: number; key: string }[] = [];
  for (const c of visible) {
    const key = sideOf(c) === 'end' ? '__pinned' : sideOf(c) === 'start' ? '__start' : (c.group || '__none');
    const label = key === '__pinned' ? 'Pinned' : key === '__start' || key === '__none' ? '' : (groups.find(g => g.key === key)?.label ?? '');
    if (bands.length && bands[bands.length - 1].key === key) bands[bands.length - 1].span += 1; else bands.push({ key, label, span: 1 });
  }
  const groupStart = (i: number) => i > 0 && (visible[i].group || '') !== (visible[i - 1].group || '') && sideOf(visible[i]) !== 'start';
  const hasTotals = visible.some(c => c.total !== undefined);
  const totalFor = (c: DataTableColumn<Row>, list: Row[]) => typeof c.total === 'function' ? (c.total as (r: Row[]) => ReactNode)(list) : c.total;

  const toggle = (key: string) => {
    setPage(0);
    setSort(previous => previous?.key !== key ? { key, direction: 'asc' } : previous.direction === 'asc' ? { key, direction: 'desc' } : null);
  };
  const pad = density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-3';
  const edge = 'border-l border-[var(--entry-table-divider)]';
  const baseClass = (c: DataTableColumn<Row>, i: number, header = false) => [
    pad, header ? 'text-xs font-semibold text-[var(--text-muted)]' : '', c.align === 'end' ? 'text-right tabular-nums' : 'text-left',
    groupStart(i) || c.key === firstEnd ? edge : '', c.key === lastStart ? 'border-r border-[var(--entry-table-divider)]' : '',
  ].filter(Boolean).join(' ');
  const pinStyle = (c: DataTableColumn<Row>, background: string, top?: number) => {
    const s = sideOf(c); const width = c.width || (s === 'end' ? PIN_END : PIN_START);
    const base: Record<string, string | number> = { background };
    if (s === 'start') Object.assign(base, { position: 'sticky', left: startOffsets[c.key], zIndex: 1, minWidth: width, maxWidth: width });
    else if (s === 'end') Object.assign(base, { position: 'sticky', right: endOffsets[c.key], zIndex: 1, minWidth: width, maxWidth: width });
    else if (c.width) base.minWidth = c.width;
    if (top !== undefined) Object.assign(base, { position: 'sticky', top, zIndex: s ? 3 : 2 });
    return base;
  };
  const onKey = (event: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (onRowClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onRowClick(row); }
  };

  useEffect(() => {
    const el = scroller.current; if (!el) return undefined;
    const measure = () => setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    measure(); el.addEventListener('scroll', measure, { passive: true }); window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [visible.length, shown.length]);

  const headerBg = 'var(--entry-table-header)';
  const bodyCells = (row: Row) => visible.map((c, i) => {
    const tone = rowTone?.(row);
    return (
      <td key={c.key} className={baseClass(c, i)} style={pinStyle(c, toneBackground(tone, 'var(--panel)'))}>
        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
      </td>
    );
  });
  const summaryRow = (key: string, label: string, list: Row[]) => (
    <tr key={key} className="border-y border-[var(--entry-table-border)] font-semibold">
      {visible.map((c, i) => <td key={c.key} className={baseClass(c, i)} style={pinStyle(c, headerBg)}>{i === 0 ? label : totalFor(c, list)}</td>)}
    </tr>
  );
  const body: ReactNode[] = [];
  let section: string | undefined; let sectionRows: Row[] = [];
  const closeSection = (key: string) => { if (sectionTotals && sectionRows.length) body.push(summaryRow(`sub-${key}`, `${section} subtotal`, sectionRows)); sectionRows = []; };
  shown.forEach(row => {
    const label = sectionBy?.(row);
    if (sectionBy && label !== section) {
      if (section !== undefined) closeSection(section);
      section = label;
      if (label !== undefined) body.push(<tr key={`sec-${label}`} className="border-b border-[var(--entry-table-divider)]"><td colSpan={visible.length} className={`${pad} text-sm font-semibold text-[var(--text)]`} style={{ background: headerBg }}>{label}</td></tr>);
    }
    sectionRows.push(row);
    body.push(
      <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} onKeyDown={onRowClick ? e => onKey(e, row) : undefined} tabIndex={onRowClick ? 0 : undefined}
        className={`border-b border-[var(--entry-table-divider)] last:border-b-0 ${onRowClick ? 'cursor-pointer hover:bg-[var(--entry-table-row-hover)] focus-visible:outline-none' : ''}`}>
        {bodyCells(row)}
      </tr>
    );
  });
  if (section !== undefined) closeSection(section);

  const groupedColumns = (list: DataTableColumn<Row>[]) => {
    const out: { label: string; items: DataTableColumn<Row>[] }[] = [];
    for (const c of list) {
      const label = groups.find(g => g.key === c.group)?.label ?? '';
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(c); else out.push({ label, items: [c] });
    }
    return out;
  };
  const picker = columnPicker ? (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setMenu(open => !open)} aria-expanded={menu}>Columns</Button>
      {menu ? (
        <div role="dialog" aria-label="Choose columns" className="absolute right-0 top-full z-20 mt-1 max-h-96 w-72 overflow-auto rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-[var(--shadow-card)]">
          <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Columns</span><Button size="sm" variant="outline" onClick={() => setMenu(false)}>Done</Button></div>
          <div className="mb-2 flex flex-wrap gap-1">
            {(columnPicker.presets ?? []).map(p => <Button key={p.label} size="sm" variant="outline" onClick={() => remember(columns.filter(c => !p.keys.includes(c.key) && side(c) !== 'start').map(c => c.key), pins)}>{p.label}</Button>)}
            <Button size="sm" variant="outline" onClick={() => remember([], pins)}>Show all</Button>
            <Button size="sm" variant="outline" onClick={() => remember([], columns.filter(c => side(c) === 'end').map(c => c.key))}>Reset</Button>
          </div>
          {groupedColumns(columns.filter(c => side(c) !== 'start')).map(g => (
            <fieldset key={g.label || 'other'} className="mb-2">
              {g.label ? <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{g.label}</legend> : null}
              {g.items.map(c => (
                <label key={c.key} className="flex items-center gap-2 py-0.5 text-sm text-[var(--text)]">
                  <input type="checkbox" className="accent-[var(--brand-accent)]" checked={!hidden.includes(c.key)} onChange={e => remember(e.target.checked ? hidden.filter(k => k !== c.key) : [...hidden, c.key], pins)} />
                  <span>{c.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-2">
      {toolbar || picker ? <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>{picker}</div> : null}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--entry-table-border)] bg-[var(--panel)] shadow-[var(--shadow-card)]">
        <div ref={scroller} className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
          <table className={`w-full text-[var(--text)] ${density === 'compact' ? 'text-[13px]' : 'text-sm'}`} style={{ minWidth }}>
            <caption className="sr-only">{caption}</caption>
            <thead>
              {hasGroups ? (
                <tr>
                  {bands.map((b, i) => <th key={`${b.key}-${i}`} colSpan={b.span} scope="colgroup" className={`px-3 py-1.5 text-center text-xs font-normal text-[var(--text-muted)] ${i > 0 ? edge : ''}`} style={{ background: headerBg, ...(maxHeight ? { position: 'sticky', top: 0, zIndex: 2 } : {}) }}>{b.label}</th>)}
                </tr>
              ) : null}
              <tr className="border-b border-[var(--entry-table-border)]">
                {visible.map((c, i) => (
                  <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined} className={baseClass(c, i, true)}
                    style={pinStyle(c, headerBg, maxHeight ? (hasGroups ? 28 : 0) : undefined)}>
                    <span className={`inline-flex items-center gap-1 ${c.align === 'end' ? 'flex-row-reverse' : ''}`}>
                      {c.sortable ? (
                        <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-[var(--text)]">
                          <span>{c.label}</span>
                          {sort?.key === c.key ? <ChevronDown size={12} className={sort.direction === 'desc' ? 'rotate-180' : ''} aria-hidden="true" /> : <span className="inline-block w-3" aria-hidden="true" />}
                        </button>
                      ) : <span className="whitespace-nowrap">{c.label}</span>}
                      {pinnable && side(c) !== 'start' ? (
                        <button type="button" onClick={() => remember(hidden, pins.includes(c.key) ? pins.filter(k => k !== c.key) : [...pins, c.key])} aria-pressed={pins.includes(c.key)}
                          aria-label={`${pins.includes(c.key) ? 'Unpin' : 'Pin'} ${typeof c.label === 'string' ? c.label : c.key}`} title={pins.includes(c.key) ? 'Unpin' : 'Pin to the right'}
                          className={`rounded p-0.5 hover:text-[var(--text)] ${pins.includes(c.key) ? 'text-[var(--text)]' : 'opacity-50'}`}><Pin size={11} aria-hidden="true" /></button>
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={visible.length} className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">{empty ?? 'Nothing to show.'}</td></tr> : body}
              {hasTotals && sectionBy && shown.length ? summaryRow('total', 'Total', rows) : null}
            </tbody>
            {hasTotals && !sectionBy ? (
              <tfoot>
                <tr className="border-t border-[var(--entry-table-border)] font-semibold">
                  {visible.map((c, i) => <td key={c.key} className={baseClass(c, i)} style={pinStyle(c, headerBg)}>{totalFor(c, rows)}</td>)}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {pageSize && sorted.length > pageSize ? (
          <div className="flex items-center justify-between gap-2 border-t border-[var(--entry-table-divider)] bg-[var(--entry-table-toolbar)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
            <span>Showing {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length}</span>
            <span className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</Button>
            </span>
          </div>
        ) : null}
      </div>
      {moreRight ? <p className="text-xs text-[var(--text-muted)]">More columns to the right: scroll sideways.{visible.some(c => sideOf(c) === 'start') ? ' The name stays in view.' : ''}</p> : null}
    </div>
  );
}
