import { useEffect, useMemo, useState } from 'react';
import { Download, FileBarChart } from 'lucide-react';
import { entriesApi, entryTypesApi, tracksApi } from '../../api';
import { slug } from '../entries/entryFormCustomFields';
import type { OperationalModelFieldSpec, Entry } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from './types';
import { humanizeEnumValue } from '../../utils/humanizeFieldKey';
import { PLATFORM_ENTRY_FIELD_KEYS, resolveEntryFieldValue } from '../../utils/entryFieldValue';

type ReportMetric = { label: string; field: string; aggregate?: 'count' | 'sum' | 'avg' | 'max' | 'min'; format?: 'number' | 'currency' };
type ReportColumn = { label: string; field: string; format?: 'date' | 'currency' | 'number' };
type Report = { key: string; title: string; description?: string; metrics?: ReportMetric[]; kind?: 'summary' | 'table' | 'trend' | 'composition'; columns?: ReportColumn[]; x_field?: string; y_field?: string };

// Cycled by metric index for a `kind: composition` report's bars — a fixed
// domain-neutral palette, not tied to what any one app's metrics mean.
const COMPOSITION_COLORS = ['bg-[var(--link)]', 'bg-[var(--success)]', 'bg-[var(--warning)]', 'bg-[var(--info)]'];

export function fieldValue(entry: Entry | Record<string, unknown>, field: string): unknown {
  return resolveEntryFieldValue(entry, field);
}

export function displayValue(
  value: unknown,
  format?: ReportColumn['format'] | ReportMetric['format'],
  selectType?: 'select' | 'multi_select'
): string {
  if (value == null || value === '') return '—';
  if (format === 'currency') return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (format === 'number') return Number(value).toLocaleString();
  if (format === 'date') return new Date(String(value)).toLocaleDateString();
  // Report columns declare no field-type info of their own (just a bare
  // `field` key + optional date/currency/number `format`), so a select
  // field's raw stored enum value (e.g. pay_run `status`: "approved")
  // rendered verbatim here — matches TableWidget's own
  // fieldValue/selectFieldTypes fix (same underlying gap, sibling widget).
  if (selectType === 'multi_select' && Array.isArray(value)) {
    return value.map(v => humanizeEnumValue(String(v))).join(', ');
  }
  if (selectType === 'select') return humanizeEnumValue(String(value));
  return String(value);
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ReportCenterWidget({ view, entries, isLoading, fields }: ViewWidgetProps) {
  const config = (view.config || {}) as { title?: string; reports?: Report[]; source_track?: string };
  const reports = Array.isArray(config.reports) ? config.reports : [];
  const [sourceEntries, setSourceEntries] = useState<Entry[] | null>(null);
  const [sourceFields, setSourceFields] = useState<OperationalModelFieldSpec[] | null>(null);
  const [sourceLoading, setSourceLoading] = useState(Boolean(config.source_track));

  // Bare unknown field keys retain compatibility with older saved views.
  // Reserved platform names resolve at the Entry level, so new or migrated
  // business references should use `custom_fields.<key>`. When `source_track` is set, `fields` (the
  // CURRENT track's own entry-type fields, passed down by ViewRenderer)
  // is the wrong source — a dashboard-only track like payroll-app's
  // "Payroll Reports & Trends" declares zero entry types of its own, so
  // `fields` is empty even though the sourced entries (pay_run, via
  // `source_track: pay_runs`) very much have a `status` select field.
  // `sourceFields`, fetched below alongside `sourceEntries`, covers that.
  const selectFieldTypes = useMemo(() => {
    const out = new Map<string, 'select' | 'multi_select'>();
    for (const f of [...(fields ?? []), ...(sourceFields ?? [])]) {
      const t = String(f.type || '').toLowerCase();
      if (t === 'select' || t === 'multi_select') {
        if (!PLATFORM_ENTRY_FIELD_KEYS.has(f.key)) out.set(f.key, t);
        out.set(`custom_fields.${f.key}`, t);
      }
    }
    return out;
  }, [fields, sourceFields]);

  useEffect(() => {
    const sourceTrack = config.source_track;
    if (!sourceTrack) {
      setSourceEntries(null);
      setSourceFields(null);
      setSourceLoading(false);
      return;
    }
    let cancelled = false;
    setSourceLoading(true);
    (async () => {
      try {
        const allTracks = await tracksApi.list({ limit: 100 });
        const track = allTracks.find(item => item.id === sourceTrack) ||
          allTracks.find(item => slug(String(item.template_id || item.title)) === slug(sourceTrack));
        const [loaded, entryTypes] = await Promise.all([
          track ? entriesApi.list({ track_id: track.id, limit: 200 }) : Promise.resolve([]),
          track ? entryTypesApi.list({ track_id: track.id }).catch(() => []) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setSourceEntries(loaded);
          setSourceFields(entryTypes.flatMap(et => et.form_schema?.fields ?? []));
        }
      } catch {
        if (!cancelled) {
          setSourceEntries([]);
          setSourceFields([]);
        }
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [config.source_track]);

  const reportEntries = sourceEntries ?? entries;
  const cards = useMemo(() => reports.map(report => ({
    ...report,
    values: (report.metrics || []).map(metric => {
    const numbers = reportEntries.map((entry: Entry) => Number(fieldValue(entry, metric.field))).filter(Number.isFinite);
      const aggregate = metric.aggregate || 'sum';
      const value = aggregate === 'count' ? reportEntries.length : aggregate === 'avg'
        ? (numbers.length ? numbers.reduce((a: number, b: number) => a + b, 0) / numbers.length : 0)
        : aggregate === 'max' ? (numbers.length ? Math.max(...numbers) : 0)
        : aggregate === 'min' ? (numbers.length ? Math.min(...numbers) : 0)
        : numbers.reduce((a: number, b: number) => a + b, 0);
      return { ...metric, value };
    }),
  })), [reportEntries, reports]);

  // Exports the raw records behind every configured `kind: table` report,
  // deduped by field — the natural "give me the rows" export for a
  // dashboard of aggregate cards. Falls back to just the record title if
  // no report declares any table columns.
  const exportColumns = useMemo(() => {
    const byField = new Map<string, ReportColumn>();
    reports.forEach(report => (report.columns || []).forEach(column => byField.set(column.field, column)));
    return byField.size ? Array.from(byField.values()) : [{ label: 'Record', field: 'title' } as ReportColumn];
  }, [reports]);

  const exportCsv = () => {
    const header = exportColumns.map(column => column.label);
    const rows = reportEntries.map(entry => exportColumns.map(column => displayValue(fieldValue(entry, column.field), column.format)));
    const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug(config.title || view.name || 'report')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || sourceLoading) return <Surface tone="panel-2" radius="card" className="h-48 animate-pulse">{null}</Surface>;
  return (
    <div className="space-y-4" data-testid="report-center-widget">
      <div className="flex items-start gap-3">
        <Surface tone="panel-2" border="none" radius="input" padding="sm"><FileBarChart size={20} aria-hidden="true" /></Surface>
        <div><Text as="h2" variant="heading-md">{config.title || view.name || 'Reports'}</Text><Text variant="body-sm" tone="muted">Configured operational reports for this track.</Text></div>
        <div className="ml-auto flex items-center gap-2"><Badge variant="info">{reportEntries.length} records</Badge><Button type="button" variant="secondary" size="sm" onClick={exportCsv} disabled={!reportEntries.length}><Download size={14} aria-hidden="true" /> Export CSV</Button></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(report => <Surface key={report.key} tone="panel" border="default" radius="card" padding="md">
          <Text as="h3" variant="heading-sm">{report.title}</Text>
          {report.description && <Text variant="body-sm" tone="muted">{report.description}</Text>}
          {report.kind === 'table' && report.columns?.length ? <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr>{report.columns.map(column => <th key={column.field} className="px-2 py-2"><Text as="span" variant="label" tone="muted">{column.label}</Text></th>)}</tr></thead><tbody>{[...reportEntries].sort((a: Entry, b: Entry) => String(fieldValue(b, 'pay_date') || fieldValue(b, 'period_start') || '').localeCompare(String(fieldValue(a, 'pay_date') || fieldValue(a, 'period_start') || ''))).slice(0, 12).map((entry: Entry) => <tr key={entry.id} className="border-t border-[var(--panel-border)]">{report.columns!.map(column => <td key={column.field} className="whitespace-nowrap px-2 py-2">{displayValue(fieldValue(entry, column.field), column.format, selectFieldTypes.get(column.field))}</td>)}</tr>)}</tbody></table></div>
            : report.kind === 'trend' && report.x_field && report.y_field ? <div className="mt-4 space-y-2">{[...reportEntries].sort((a: Entry, b: Entry) => String(fieldValue(a, report.x_field!) || '').localeCompare(String(fieldValue(b, report.x_field!) || ''))).slice(-12).map((entry: Entry) => { const value = Number(fieldValue(entry, report.y_field!)) || 0; const max = Math.max(...reportEntries.map((item: Entry) => Number(fieldValue(item, report.y_field!)) || 0), 1); return <div key={entry.id} className="flex items-center gap-3"><Text variant="meta" className="w-24 shrink-0">{displayValue(fieldValue(entry, report.x_field!), 'date')}</Text><Surface tone="panel-2" border="none" radius="pill" className="h-2 flex-1"><div className="h-2 rounded-full bg-[var(--link)]" style={{ width: `${Math.max(3, value / max * 100)}%` }} /></Surface><Text variant="meta" className="w-28 text-right">{displayValue(value, 'currency')}</Text></div> })}</div>
            : report.kind === 'composition' && report.values.length ? <div className="mt-4 space-y-3">{(() => { const max = Math.max(...report.values.map(v => v.value), 1); return report.values.map((metric, i) => <div key={metric.field} className="flex items-center gap-3"><Text variant="meta" className="w-32 shrink-0">{metric.label}</Text><Surface tone="panel-2" border="none" radius="pill" className="h-3 flex-1"><div className={`h-3 rounded-full ${COMPOSITION_COLORS[i % COMPOSITION_COLORS.length]}`} style={{ width: `${Math.max(4, metric.value / max * 100)}%` }} /></Surface><Text variant="meta" className="w-32 text-right">{displayValue(metric.value, metric.format)}</Text></div>); })()}</div>
            : <div className="mt-4 grid grid-cols-2 gap-3">{report.values.map(metric => <div key={metric.field}><Text variant="label" tone="muted">{metric.label}</Text><Text variant="heading-sm">{displayValue(metric.value, metric.format)}</Text></div>)}</div>}
        </Surface>)}
      </div>
      {!cards.length && <Text variant="body-sm" tone="muted">No reports have been configured for this track.</Text>}
      {cards.length > 0 && !sourceLoading && !reportEntries.length && <Text variant="body-sm" tone="muted">No source records were found for these reports.</Text>}
    </div>
  );
}
