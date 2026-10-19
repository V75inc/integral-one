import { useEffect, useState } from 'react';
import { Download, ExternalLink, Link2 } from 'lucide-react';
import { entriesApi } from '../../api';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui';
import { Badge } from '../ui/Badge';
import { Surface, Text } from '../../ui';
import type { Entry } from '../../types';
import type { ViewWidgetProps } from './types';

type Column = { field: string; label: string; format?: 'text' | 'number' | 'currency' | 'date' | 'status'; emphasis?: 'primary' | 'muted' };
const PAGE_SIZE = 25;

function valueFor(entry: Entry, field: string): unknown {
  if (field === 'title') return entry.title;
  if (field === 'id') return entry.id;
  return entry.custom_fields?.[field];
}

function display(value: unknown, format?: Column['format']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'currency') return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (format === 'number') return Number(value).toLocaleString();
  if (format === 'date') return String(value).slice(0, 10);
  return String(value);
}

function statusVariant(value: unknown): string {
  const status = String(value || '').toLowerCase();
  if (['paid', 'complete', 'ready', 'approved'].includes(status)) return 'success';
  if (['warning', 'pending', 'draft'].includes(status)) return 'warning';
  if (['blocked', 'failed', 'error'].includes(status)) return 'danger';
  return 'default';
}

export function RecordCollectionWidget({ view, onEntryOpen }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const hostEntryId = typeof bindings.entryId === 'string' ? bindings.entryId : undefined;
  const relation = typeof config.relation === 'string' ? config.relation : '';
  const title = typeof config.title === 'string' ? config.title : undefined;
  const entryType = typeof config.entry_type === 'string' ? config.entry_type : undefined;
  const presentation = config.presentation === 'table' ? 'table' : 'responsive';
  const columns: Column[] = Array.isArray(config.columns) ? config.columns as Column[] : [{ field: 'title', label: 'Record' }];
  const rowActions = Array.isArray(config.row_actions) ? config.row_actions.map(String) : ['open'];
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!hostEntryId || !relation) { setRows([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    entriesApi.listRelated(hostEntryId, relation, { limit: PAGE_SIZE, entryType })
      .then(result => { if (!cancelled) { setRows(result.entries); setCursor(result.nextCursor); setHasMore(result.hasMore); } })
      .catch(err => { if (!cancelled) setError(String(err?.message || 'Failed to load records')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hostEntryId, relation, entryType, bindings.__refreshKey]);

  if (loading) return <Surface tone="panel-2" radius="input" className="h-28 animate-pulse">{null}</Surface>;
  if (error) return <Text as="p" variant="body-sm" tone="danger">{error}</Text>;
  return (
    <Surface tone="panel" border="default" radius="card" padding="md">
      {title && <div className="mb-3 flex items-center gap-2"><Link2 size={16} aria-hidden="true" /><Text as="h3" variant="heading-sm">{title} <Text as="span" variant="body" tone="muted">({rows.length}{hasMore ? '+' : ''})</Text></Text></div>}
      {!rows.length ? <EmptyState title="No records yet" /> : presentation === 'table' ? (
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-[var(--panel-border)]">{columns.map(column => <th key={column.field} className="px-3 py-2"><Text as="span" variant="label" tone="muted" className="uppercase tracking-wide">{column.label}</Text></th>)}<th className="px-3 py-2" /></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-[var(--panel-border)] last:border-0"><>{columns.map(column => { const value = valueFor(row, column.field); return <td key={column.field} className="px-3 py-3"><Text as="span" variant="body-sm" weight={column.emphasis === 'primary' ? 'semibold' : undefined} tone={column.emphasis === 'muted' ? 'muted' : undefined}>{column.format === 'status' ? <Badge variant={statusVariant(value)}>{display(value)}</Badge> : display(value, column.format)}</Text></td>; })}</><td className="px-3 py-2 text-right"><Button variant="ghost" size="xs" icon={rowActions.includes('download') ? <Download size={14} /> : <ExternalLink size={14} />} onClick={() => onEntryOpen(row)}>{rowActions.includes('download') ? 'Open' : 'View'}</Button></td></tr>)}</tbody></table></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">{rows.map(row => <button key={row.id} type="button" className="text-left" onClick={() => onEntryOpen(row)}><Surface tone="panel-2" border="default" radius="input" padding="md" className="hover:border-[var(--link)]"><Text as="div" variant="body" weight="medium">{display(valueFor(row, columns[0]?.field || 'title'), columns[0]?.format)}</Text>{columns.slice(1).map(column => <div key={column.field} className="mt-2 flex justify-between gap-3"><Text variant="body-sm" tone="muted">{column.label}</Text><Text variant="body-sm" weight={column.emphasis === 'primary' ? 'medium' : undefined}>{display(valueFor(row, column.field), column.format)}</Text></div>)}</Surface></button>)}</div>
      )}
      {hasMore && <div className="mt-3"><Button variant="outline" size="sm" onClick={() => { if (!hostEntryId || !relation || !cursor) return; entriesApi.listRelated(hostEntryId, relation, { limit: PAGE_SIZE, cursor, entryType }).then(result => { setRows(prev => [...prev, ...result.entries]); setCursor(result.nextCursor); setHasMore(result.hasMore); }); }}>Load more</Button></div>}
    </Surface>
  );
}
