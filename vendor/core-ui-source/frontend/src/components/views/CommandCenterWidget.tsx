import { useMemo } from 'react';
import { ComposableViewSlot } from './ComposableViewSlot';
import { Badge } from '../ui/Badge';
import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from './types';

type Metric = { label: string; field: string; aggregate?: 'count' | 'sum' | 'avg' | 'max' | 'min'; format?: 'number' | 'currency' };

function formatMetric(value: number, format?: Metric['format']): string {
  return format === 'currency' ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value.toLocaleString();
}

type ChildView = { key: string; label?: string };

// A bare string ("pay_runs_table") or a {key, label} object — the label
// defaults to a title-cased key when the manifest doesn't supply one, so
// this widget never has to guess what a view key means for any given app.
function normalizeChildView(raw: unknown): ChildView | null {
  if (typeof raw === 'string') return { key: raw };
  if (raw && typeof raw === 'object' && typeof (raw as ChildView).key === 'string') return raw as ChildView;
  return null;
}

function titleCase(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function CommandCenterWidget({ view, entries, isLoading }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const metrics = (Array.isArray(config.metrics) ? config.metrics : []) as Metric[];
  const childViews = (Array.isArray(config.child_views) ? config.child_views : []).map(normalizeChildView).filter((v): v is ChildView => v !== null);
  const title = typeof config.title === 'string' ? config.title : 'Command Center';
  const values = useMemo(() => metrics.map(metric => {
    const numbers = entries.map(entry => Number(metric.field === 'id' ? entry.id : entry.custom_fields?.[metric.field])).filter(Number.isFinite);
    const aggregate = metric.aggregate || 'sum';
    const value = aggregate === 'count' ? entries.length : aggregate === 'avg' ? (numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0) : aggregate === 'max' ? (numbers.length ? Math.max(...numbers) : 0) : aggregate === 'min' ? (numbers.length ? Math.min(...numbers) : 0) : numbers.reduce((a, b) => a + b, 0);
    return { ...metric, value };
  }), [entries, metrics]);
  const recordLabel = typeof config.record_label === 'string' ? config.record_label : 'records';
  if (isLoading) return <Surface tone="panel-2" radius="input" className="h-40 animate-pulse">{null}</Surface>;
  return <div className="space-y-5">
    <div className="flex items-center justify-between"><div><Text as="h2" variant="heading-lg">{title}</Text><Text variant="body-sm" tone="muted">{typeof config.subtitle === 'string' ? config.subtitle : 'Review current records and take the next action.'}</Text></div><Badge variant="info">{entries.length} {recordLabel}</Badge></div>
    {values.length > 0 && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{values.map(metric => <Surface key={metric.field} tone="panel" border="default" radius="card" padding="md"><Text as="div" variant="label" tone="muted" className="uppercase tracking-wide">{metric.label}</Text><Text as="div" variant="heading-sm" className="mt-1">{formatMetric(metric.value, metric.format)}</Text></Surface>)}</div>}
    {childViews.map(({ key, label }) => <div key={key} className="space-y-2"><Text as="h3" variant="heading-sm">{label || titleCase(key)}</Text><ComposableViewSlot trackId={view.track_id} viewKey={key} allowedScopes={['track', 'both']} /></div>)}
  </div>;
}
