import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { toolsApi } from '../../api/tools';
import { Badge } from '../ui/Badge';
import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from './types';

type CheckSpec = { key: string; label: string; field: string; required?: boolean; equals?: unknown; message?: string };
type SummaryField = { label: string; field: string; format?: 'number' | 'currency' };
type ToolCheck = { key: string; state: 'pass' | 'warning' | 'block'; label: string; message: string; action?: string };
type ToolResult = { status: string; summary?: Record<string, unknown>; checks?: ToolCheck[] };

const statusVariant: Record<string, string> = { ready: 'success', complete: 'success', pass: 'success', warning: 'warning', blocked: 'danger', block: 'danger' };

function formatSummaryValue(value: unknown, format?: SummaryField['format']): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '—');
  return format === 'currency' ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : num.toLocaleString();
}

/** Client-side mode: every check reads straight off the current entry's own
 * fields — no server round-trip, pass/fail only. Good for "is this record
 * filled in" checks with no cross-entity logic. */
function useFieldChecks(config: { checks?: CheckSpec[] }, entry: ViewWidgetProps['entries'][number] | undefined) {
  return (config.checks || []).map(check => {
    const value = entry?.custom_fields?.[check.field];
    const pass = check.equals !== undefined ? value === check.equals : check.required ? value !== undefined && value !== null && value !== '' : true;
    return { ...check, pass };
  });
}

export function DataHealthWidget({ view, entries, isLoading }: ViewWidgetProps) {
  const config = (view.config || {}) as { title?: string; checks?: CheckSpec[]; tool?: string; summary_fields?: SummaryField[] };
  const entry = entries[0];
  const bindings = (view.config?.__bindings || {}) as Record<string, unknown>;
  const entryId = typeof bindings.entryId === 'string' ? bindings.entryId : entry?.id;
  const toolKey = config.tool;

  // Server mode: a named workspace tool computes checks that need more than
  // "is this field set" — related-record counts, cross-track lookups,
  // effective-dated rate lookups, whatever the app's own logic requires.
  // Contract: {status, summary?, checks: [{key, label, message, state, action?}]}.
  const [toolResult, setToolResult] = useState<ToolResult | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  useEffect(() => {
    if (!toolKey || !entryId) return;
    let cancelled = false;
    setToolError(null);
    toolsApi.call(toolKey, { entry_id: entryId })
      .then(({ output }) => { if (!cancelled) setToolResult(output as unknown as ToolResult); })
      .catch(err => { if (!cancelled) setToolError(String(err?.message || 'Readiness check failed')); });
    return () => { cancelled = true; };
  }, [toolKey, entryId, bindings.__refreshKey]);

  const fieldChecks = useFieldChecks(config, entry);

  if (isLoading || (toolKey && !toolResult && !toolError)) return <Surface tone="panel-2" radius="card" className="h-28 animate-pulse">{null}</Surface>;
  if (toolKey && toolError) return <Surface tone="panel" border="default" radius="card" padding="md"><Text tone="danger">{toolError}</Text></Surface>;

  if (toolKey && toolResult) {
    const checks = toolResult.checks || [];
    const summaryFields = config.summary_fields || [];
    return (
      <Surface tone="panel" border="default" radius="card" padding="md" data-testid="data-health-widget">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2"><ShieldCheck size={18} aria-hidden="true" /><Text as="h3" variant="heading-sm">{config.title || 'Readiness'}</Text></div>
          <Badge variant={statusVariant[toolResult.status] || 'default'}>{toolResult.status}</Badge>
        </div>
        {summaryFields.length > 0 && <div className="mt-4 flex flex-wrap gap-3">{summaryFields.map(field => <Badge key={field.field} variant="default">{field.label}: {formatSummaryValue(toolResult.summary?.[field.field], field.format)}</Badge>)}</div>}
        <div className="mt-4 space-y-2">
          {checks.map(check => { const Icon = check.state === 'pass' ? CheckCircle2 : check.state === 'block' ? AlertCircle : AlertTriangle; return <div key={check.key} className="flex gap-2"><Icon size={16} className={check.state === 'pass' ? 'text-[var(--success-fg)]' : check.state === 'block' ? 'text-[var(--danger-fg)]' : 'text-[var(--warn-fg)]'} aria-hidden="true" /><div><Text as="div" variant="body-sm" weight="medium">{check.label}</Text><Text as="div" variant="body-sm" tone="muted">{check.message}{check.action ? ` ${check.action}` : ''}</Text></div></div>; })}
        </div>
      </Surface>
    );
  }

  const failed = fieldChecks.filter(check => !check.pass).length;
  return <Surface tone="panel" border="default" radius="card" padding="md" data-testid="data-health-widget">
    <div className="flex items-center justify-between gap-3"><div><Text as="h3" variant="heading-sm">{config.title || 'Data health'}</Text><Text variant="body-sm" tone="muted">Check the required information before continuing.</Text></div><Badge variant={failed ? 'warning' : 'success'}>{failed ? `${failed} to review` : 'Ready'}</Badge></div>
    <div className="mt-4 space-y-2">{fieldChecks.map(check => <div key={check.key} className="flex items-start gap-2">{check.pass ? <CheckCircle2 size={16} className="text-[var(--success-fg)]" aria-hidden="true" /> : <AlertCircle size={16} className="text-[var(--warn-fg)]" aria-hidden="true" />}<div><Text as="div" variant="body-sm" weight="medium">{check.label}</Text>{!check.pass && <Text as="div" variant="meta" tone="muted">{check.message || `Set ${check.field} before continuing.`}</Text>}</div></div>)}</div>
  </Surface>;
}
